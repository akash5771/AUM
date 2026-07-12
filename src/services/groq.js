import fs from 'fs/promises';
import path from 'path';
import { readDB, writeDB, addMemory, addChatMessage, getDbCurrentTime, applyMomentumDelta } from './db.js';
import { buildUnifiedContext } from './context_engine.js';
import { analyzeConversation, GROWTH_SIGNALS } from './growth_signals.js';
import { updateThreads } from './thread_manager.js';
import { addRawChat } from './memory_engine/memory_db.js';


// Helper to get Groq API Key
function getGroqApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.includes('your_groq_api') || key === '') {
    return null;
  }
  return key;
}

function getApiKey() {
  return getGroqApiKey();
}

// Helper to fetch with a timeout
async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ─── Attention Engine ─────────────────────────────────────────────────────────
// Pre-processes long messages (> 80 words) to extract the single most emotionally
// significant moment before the main response model runs.
// Uses the fast 8B model for extraction (JSON only, no creativity needed).
// Has a 1500ms hard timeout — if it doesn't finish in time, returns null and the
// main model proceeds without attention context.
async function extractAttentionFocus(userMessage, nvidiaKey) {
  const wordCount = userMessage.trim().split(/\s+/).length;
  if (wordCount < 80) return null; // Only needed for long messages
  if (!nvidiaKey) return null;

  const extractionPrompt = `You are an emotional attention extractor. A person sent this message:

"${userMessage}"

Your job: identify what deserves attention — not what they said, but what their words reveal about them.

Return a JSON object with exactly these fields:
- primary_moment: The single most emotionally significant detail or sentence (quote or describe it specifically, not generically)
- hidden_fear: The underlying fear their words reveal — what they are actually scared of
- current_need: What they need most right now — one of: validation, honesty, space, challenge, connection
- emotion: The dominant emotion — one of: regret, anxiety, grief, pride, confusion, anger, hope

Return ONLY raw JSON. No markdown. No explanation.`;

  try {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nvidiaKey}`
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: extractionPrompt }],
        temperature: 0.1,
        max_tokens: 200,
        stream: false
      })
    }, 1500); // Hard 1.5s timeout

    if (!response.ok) return null;
    const result = await response.json();
    const text = result.choices[0]?.message?.content?.trim() || "";
    // Strip any accidental markdown fences
    const clean = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.warn("[Attention Engine] Skipped:", e.message);
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────


// ─── Message Bucket Classifier ───────────────────────────────────────────────
// Pure JS, zero latency, zero LLM calls.
// Priority: Emotional > Deep > Casual > Short
// Returns one of: 'emotional' | 'deep' | 'casual' | 'short'
function classifyMessageBucket(message) {
  const lower = message.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  const emotionalKeywords = [
    'sad', 'tired', 'frustrated', 'overwhelmed', 'hurt', 'broken',
    'miss', 'lost', 'scared', 'anxious', 'crying', 'stressed', 'empty',
    'alone', 'low', 'depressed', 'hopeless', 'exhausted', 'drained',
    'suffocating', 'falling apart', 'can\'t stop', 'don\'t know why',
    'feel like', 'feeling like', 'too much', 'giving up', 'not okay'
  ];

  const shortKeywords = [
    'done', 'logged', 'completed', '✅', 'ok', 'okay', 'noted',
    'got it', 'yep', 'thanks', 'sure', 'yup', 'hmm', 'hm', 'yeah',
    'lol', 'haha', 'nice', 'cool', 'wow', 'great', 'good', 'fine'
  ];

  // 1. Emotional check — highest priority
  const isEmotional = emotionalKeywords.some(k => lower.includes(k));
  if (isEmotional) return 'emotional';

  // 2. Deep check — question or long message
  const hasQuestion = lower.includes('?');
  if (hasQuestion || wordCount > 15) return 'deep';

  // 3. Casual — medium messages just chatting (9-15 words)
  if (wordCount >= 9) return 'casual';

  // 4. Short / reactive — brief confirmations or greetings
  return 'short';
}

// Returns a bucket-specific length + tone instruction injected into the system prompt
function getLengthInstruction(bucket) {
  if (bucket === 'short') {
    return `RESPONSE LENGTH: Short/Reactive. 1–2 sentences max. Ultra-punchy. Peer energy. No warm-up, no filler, no sign-off. Validate the check-in and move on.`;
  }
  if (bucket === 'emotional') {
    return `RESPONSE LENGTH: Emotional. 3–5 sentences. Lead with acknowledgement — feel what they feel before you say anything else. No immediate advice or reframe unless they ask. This is not the moment to fix, it's the moment to be with them.`;
  }
  if (bucket === 'deep') {
    return `RESPONSE LENGTH: Deep/Reflective. 4–7 sentences. Think it through properly. You can use a natural paragraph break. Answer substantively, not cautiously. Don't write short to seem wise — write enough to actually be useful.`;
  }
  if (bucket === 'casual') {
    return `RESPONSE LENGTH: Casual. 2–4 sentences. Natural back-and-forth energy. No structure, no lessons, just conversation. Respond the way you'd text someone you know well.`;
  }
  return '';
}
// ─────────────────────────────────────────────────────────────────────────────

// Low-level fetch wrapper to query NVIDIA NIM DeepSeek
async function queryDeepSeek(prompt, isJson = false, useThinking = false, retries = 2, delayMs = 500, timeoutMs = 30000) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    throw new Error('No NVIDIA_API_KEY configured.');
  }

  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const requestBody = {
    model: "deepseek-ai/deepseek-v4-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: useThinking ? 1.0 : 0.2,
    top_p: 0.95,
    max_tokens: 16384,
    stream: false
  };


  if (useThinking) {
    requestBody.chat_template_kwargs = {
      thinking: true,
      reasoning_effort: "high"
    };
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nvidiaKey}`
        },
        body: JSON.stringify(requestBody)
      }, timeoutMs);

      if (response.status === 429) {
        if (attempt === retries) {
          throw new Error("NVIDIA API Rate Limit (429)");
        }
        const retryAfter = response.headers.get('retry-after');
        let waitTime = retryAfter ? parseFloat(retryAfter) * 1000 : delayMs * Math.pow(2.5, attempt);
        if (waitTime > 5000) {
          throw new Error("NVIDIA API Rate Limit Delay too long");
        }
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`NVIDIA API Error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      const message = result.choices[0].message;

      // Extract and log reasoning/thinking details if available
      const reasoning = message.reasoning || message.reasoning_content || null;
      if (reasoning) {
        console.log(`[DeepSeek Reasoning (Attempt ${attempt})]:`, reasoning);
      }

      const textOutput = message.content;
      return isJson ? JSON.parse(textOutput) : textOutput;
    } catch (e) {
      if (attempt === retries) {
        throw e;
      }
      const backoff = delayMs * Math.pow(2, attempt);
      console.log(`[NVIDIA DeepSeek] Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

// Low-level fetch wrapper to query NVIDIA NIM Llama 3.3
async function queryLlama3(prompt, isJson = false, retries = 2, delayMs = 500, timeoutMs = 2000) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    throw new Error('No NVIDIA_API_KEY configured.');
  }

  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const requestBody = {
    model: "meta/llama-3.3-70b-instruct",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 4096,
    stream: false
  };

  if (isJson) {
    requestBody.response_format = { type: "json_object" };
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nvidiaKey}`
        },
        body: JSON.stringify(requestBody)
      }, timeoutMs);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`NVIDIA Llama3 HTTP Error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      const textOutput = result.choices[0].message.content;
      return isJson ? JSON.parse(textOutput) : textOutput;
    } catch (e) {
      if (attempt === retries) {
        throw e;
      }
      const backoff = delayMs * Math.pow(2, attempt);
      console.log(`[NVIDIA Llama3] Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

// Low-level fetch wrapper to query NVIDIA NIM Llama 3.1 8B
async function queryLlama8b(prompt, isJson = false, timeoutMs = 1500) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    throw new Error('No NVIDIA_API_KEY configured.');
  }

  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const requestBody = {
    model: "meta/llama-3.1-8b-instruct",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 2048,
    stream: false
  };

  if (isJson) {
    requestBody.response_format = { type: "json_object" };
  }

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${nvidiaKey}`,
      'Connection': 'keep-alive'
    },
    body: JSON.stringify(requestBody)
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`Llama 8B NIM HTTP Error (${response.status})`);
  }

  const result = await response.json();
  const textOutput = result.choices[0].message.content;
  return isJson ? JSON.parse(textOutput) : textOutput;
}

// Low-level fetch wrapper to query Groq LLM REST API
async function queryGroq(prompt, isJson = false, retries = 2, delayMs = 500, timeoutMs = 1500) {
  const groqKey = getGroqApiKey();
  if (!groqKey) {
    throw new Error('No valid GROQ_API_KEY configured.');
  }
  const model = "llama-3.3-70b-versatile";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const requestBody = {
    model: model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2
  };

  if (isJson) {
    requestBody.response_format = { type: "json_object" };
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify(requestBody)
      }, timeoutMs);

      if (response.status === 429) {
        if (attempt === retries) {
          throw new Error("Groq API Rate Limit (429)");
        }
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseFloat(retryAfter) * 1000 : delayMs * Math.pow(2.5, attempt);
        if (waitTime > 5000) {
          throw new Error("Groq API Rate Limit delay too long");
        }
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API Error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      const textOutput = result.choices[0].message.content;
      return isJson ? JSON.parse(textOutput) : textOutput;
    } catch (e) {
      if (attempt === retries) {
        throw e;
      }
      const backoff = delayMs * Math.pow(2, attempt);
      console.log(`[Groq API] Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

// Router to dynamic primary speed/thinking model chain
export async function queryGemini(prompt, isJson = false, retries = 3, delayMs = 1000, useThinking = false) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const groqKey = getGroqApiKey();

  // If thinking mode is requested (for nightly consolidations/weekly reports)
  if (useThinking) {
    if (nvidiaKey) {
      try {
        console.log("[Model Chain] Routing to Tier 1 (Thinking): DeepSeek-V4-Flash");
        return await queryDeepSeek(prompt, isJson, true, 2, 500, 45000); // 45s timeout
      } catch (e) {
        console.error("[Model Chain] Tier 1 (Thinking) failed:", e.message);
      }
    }
    if (nvidiaKey) {
      try {
        console.log("[Model Chain] Routing to Tier 2 (Thinking Fallback): Llama-3.3-70B on NIM");
        return await queryLlama3(prompt, isJson, 2, 500, 10000); // 10s timeout
      } catch (e) {
        console.error("[Model Chain] Tier 2 (Thinking Fallback) failed:", e.message);
      }
    }
  } else {
    // Standard real-time chat routing (Prioritize speed first)
    const speedTimeout = isJson ? 15000 : 1500;
    const qualityTimeout = isJson ? 20000 : 2000;
    const groqTimeout = isJson ? 15000 : 1500;

    if (nvidiaKey) {
      try {
        console.log(`[Model Chain] Routing to Tier 1 (Speed): Llama-3.1-8B on NIM (Timeout: ${speedTimeout}ms)`);
        return await queryLlama8b(prompt, isJson, speedTimeout);
      } catch (e) {
        console.error("[Model Chain] Tier 1 (Speed) failed:", e.message);
      }
    }
    if (nvidiaKey) {
      try {
        console.log(`[Model Chain] Routing to Tier 2 (Quality fallback): Llama-3.3-70B on NIM (Timeout: ${qualityTimeout}ms)`);
        return await queryLlama3(prompt, isJson, 2, 500, qualityTimeout);
      } catch (e) {
        console.error("[Model Chain] Tier 2 (Quality fallback) failed:", e.message);
      }
    }
    if (groqKey) {
      try {
        console.log(`[Model Chain] Routing to Tier 3 (Platform fallback): Llama-3.3-70B on Groq (Timeout: ${groqTimeout}ms)`);
        return await queryGroq(prompt, isJson, 2, 500, groqTimeout);
      } catch (e) {
        console.error("[Model Chain] Tier 3 (Platform fallback) failed:", e.message);
      }
    }
  }

  throw new Error("All active LLM tiers exhausted or failed.");
}

// Read the tasks library JSON file
async function readTasksLibrary() {
  try {
    const libraryPath = path.join(process.cwd(), 'data', 'tasks_library.json');
    const data = await fs.readFile(libraryPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read tasks library, using empty list:', error);
    return [];
  }
}

// Selecting 5 balanced tasks from the library based on user level
async function selectLibraryTasks(level) {
  const library = await readTasksLibrary();
  if (library.length === 0) return [];

  let minDiff = 1, maxDiff = 2;
  if (level >= 35) { minDiff = 4; maxDiff = 5; }
  else if (level >= 20) { minDiff = 3; maxDiff = 4; }
  else if (level >= 10) { minDiff = 2; maxDiff = 3; }
  else if (level >= 4) { minDiff = 1; maxDiff = 3; }

  const categories = ["Mindset", "Physical", "Relationships", "Work-Life", "Reflection"];
  const selected = [];
  for (const cat of categories) {
    let eligible = library.filter(t => t.category === cat && t.difficulty >= minDiff && t.difficulty <= maxDiff);
    if (eligible.length === 0) eligible = library.filter(t => t.category === cat);
    if (eligible.length > 0) {
      const idx = Math.floor(Math.random() * eligible.length);
      selected.push(eligible[idx]);
    }
  }
  return selected;
}

// FALLBACK SYSTEM: Simulates daily actions when offline
function simulateDailyActions(selectedTasks, profile, context) {
  return selectedTasks.map((task, i) => {
    let text = task.text.replace('Akash', profile.name || 'Akash');
    let whyToday = task.defaultWhyToday;
    let whyRelevant = task.defaultWhyRelevant;
    let howTo = task.defaultHowTo;

    if (context.mood && context.mood.rating >= 7) {
      whyToday = `Given today's high stress score of ${context.mood.rating}/10 and feeling "${context.mood.state}", this was selected to immediately down‑regulate your nervous system.`;
    } else if (context.sleep && context.sleep.energy <= 4) {
      whyToday = `With your energy logged at ${context.sleep.energy}/10 after ${context.sleep.hours} hrs of sleep, we selected a low‑friction adaptation to keep your momentum alive.`;
    } else if (context.environmental && context.environmental.weather === 'Rainy') {
      whyToday = `Since it's rainy outside today, this serves as a great indoor‑friendly option to maintain routine.`;
    } else {
      whyToday = `This fits your current status of feeling ${context.mood?.state || 'clear'} on a ${context.environmental?.day_of_week || 'today'}.`;
    }

    const roleStr = profile.role || profile.job || 'working professional';
    const goalStr = profile.goals || profile.goal || 'your aspirations';
    const challengeStr = profile.challenges || profile.problem || 'your bottlenecks';

    if (task.category === 'Work-Life') {
      whyRelevant = `As a ${roleStr}, managing the challenge of "${challengeStr}" requires structured energy separation.`;
    } else if (task.category === 'Relationships') {
      if (profile.maritalStatus === 'Married') {
        whyRelevant = `Nurturing your relationship with your wife is key to balancing professional stress with marital stability.`;
      } else if (profile.kids > 0) {
        whyRelevant = `Being present for your ${profile.kids} kids requires protecting your emotional reserves at the office.`;
      } else {
        whyRelevant = `Cultivating strong relational anchors directly supports your long‑term goal of: "${goalStr}".`;
      }
    } else if (task.category === 'Mindset' || task.category === 'Reflection') {
      whyRelevant = `This helps build the inner freedom and stability needed to resolve your bottleneck: "${challengeStr}".`;
    } else {
      whyRelevant = `Physical health is the foundation for executing your role as a ${roleStr} without late‑night burnout.`;
    }

    return {
      id: `act_${i+1}`,
      text,
      category: task.category,
      difficulty: task.difficulty,
      whyToday,
      whyRelevant,
      howTo,
      status: 'todo'
    };
  });
}

// Generates the daily 5 momentum actions.
export async function generateDailyActionsService() {
  const db = await readDB();
  const apiKey = getApiKey();

  const { buildUnifiedContext } = await import('./context_engine.js');
  const { getRecommendedInterventions } = await import('./recommendations.js');
  const { getPredictions } = await import('./prediction_engine.js');

  const context = buildUnifiedContext(db);
  const predictions = getPredictions(db.profile, context, db.history || []);
  context.prediction = predictions;

  const result = getRecommendedInterventions(db.profile, context, db.history || [], db);

  db.actions = result.actions;
  db.backups = result.backups;
  db.profile.total_actions_generated = (db.profile.total_actions_generated || 0) + result.actions.length;
  await writeDB(db);

  if (!apiKey) return result.actions;

  const gaps = db.context.category_gaps || {};
  const gapLines = Object.keys(gaps).map(cat => `  - ${cat}: ${gaps[cat] === 999 ? 'Never' : `${gaps[cat]} days ago`}`).join('\n');

  const purpose = db.profile.purpose || { whyItMatters: '', whoBenefits: '', futureBuilding: '' };
  const values = db.profile.core_values || [];
  const prompt = `\nYou are AUM, the AI Life Operating System for working professionals.\nYou are generating highly personalized daily momentum explanations for the following 5 pre‑selected actions.\n\nUser Profile:\n- Name: ${db.profile.name}\n- Job: ${db.profile.role}\n- Active Goal: ${db.profile.active_goal?.category} -> ${db.profile.active_goal?.subGoal}\n- Active Chapter: ${db.profile.current_chapter}\n- Stated Purpose / Why: ${purpose.whyItMatters} (Benefits: ${purpose.whoBenefits}, Future: ${purpose.futureBuilding})\n- Core Values: ${values.join(', ')}\n- Current Archetype: ${db.profile.archetype} (Momentum: ${db.profile.momentum_score}/100)\n\nToday's Logged Context:\n- Energies: Mental ${context.user_state.energies.mental}/10, Physical ${context.user_state.energies.physical}/10, Social ${context.user_state.energies.social}/10, Creative ${context.user_state.energies.creative}/10\n- Mood: Stress rating ${context.user_state.stress}/10\n- Environmental: Weather: ${context.environmental.weather}, Seasons: ${context.environmental.seasons.join(', ')}, City: ${db.profile.city}\n- World Engine Layers: Commute/Traffic: ${context.environmental.world.traffic}, AQI: ${context.environmental.world.aqi}\n\nRecency Gaps (days since you last had this experience type):\n${gapLines}\n\nPre‑selected Interventions:\n${result.actions.map((act, idx) => `Action ${idx+1}:\n  - ID: ${act.id}\n  - Text: ${act.text}\n  - Category: ${act.category}\n  - Difficulty: ${act.difficulty}\n  - Why Today (Default): ${act.whyToday}\n  - Why Relevant (Default): ${act.whyRelevant}\n  - How To (Default): ${act.howTo}`).join('\n\n')}\n\nFor each action, customize and rewrite the \"text\", \"whyToday\", \"whyRelevant\", and \"howTo\" fields.\nYour rewritten explanations MUST fulfill the AUM Constitution Rule by confidently answering these 4 questions for the user:\n1. Why this person? (Weave in their active goal, life chapter, and core values).\n2. Why today? (Directly reference today's weather, weekday, NCR AQI, or active seasonal event like IPL/Salary Week, and also mention if there is a high Recency Gap for this type of experience to motivate them to break their streak, e.g. "Since you haven't been in nature for 30 days...").\n3. Why now? (Connect to their logged mental/physical/social/creative energy budget and stress score).\n4. Why will this improve tomorrow? (Explain the downstream outcome causality, e.g., how doing this recovery task now reduces tomorrow's burnout and raises tomorrow's momentum).\n\nAnchor explanations emotionally around their purpose: \"${purpose.whyItMatters}\".\n\nGenerate exactly 5 actions in a JSON array matching the schema below.\nJSON Output Schema:\n[\n  {\n    \"id\": \"Matching ID\",\n    \"text\": \"Rewritten clear action instruction\",\n    \"category\": \"Matching Category\",\n    \"difficulty\": Matching Difficulty (number),\n    \"whyToday\": \"Answers: Why today? Why now?\",\n    \"whyRelevant\": \"Answers: Why this person? Why will this improve tomorrow?\",\n    \"howTo\": \"2-3 step practical implementation guideline.\"\n  }\n]\nDo not output markdown codeblocks. Return raw JSON.`;

  try {
    const raw = await queryGemini(prompt, true);
    const final = raw.map(a => ({ ...a, status: 'todo' }));
    db.actions = final;
    await writeDB(db);
    return final;
  } catch (e) {
    console.error('Groq personalization failed, using pre‑selected actions:', e);
    return result.actions;
  }
}

/**
 * Generates empathetic companion chat responses.
 */
async function updateCurrentStateSummary(db) {
  if (!getApiKey()) return;
  const recent = db.chat_history.slice(-6).map(h => `${h.sender}: ${h.text}`).join('\n');
  const prompt = `\nBased on the following recent chats, write a single‑sentence "Current State Summary" for the user.\nIt should be a highly concise, 15‑25 word description of their current state, emotional context, and immediate risk.\nExample: \"Akash is mentally exhausted after a demanding workday but still highly motivated to build AUM. Risk: sacrificing sleep.\"\n\nRecent Chats:\n${recent}\n\nRespond ONLY with the single sentence summary. Do not use quotes, markdown formatting, or introductory text.`;
  try {
    const summary = await queryGemini(prompt, false);
    db.context.current_state_summary = summary.trim();
  } catch (e) {
    console.error('Failed to update current state summary:', e);
  }
}

/**
 * Generates empathetic companion chat responses.
 */
/**
 * Generates empathetic companion chat responses.
 */
// Helper for simple greeting identification
function isGreetingOrShort(msg) {
  const clean = msg.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  const greetings = [
    'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 
    'yo', 'sup', 'ok', 'okay', 'thanks', 'thank you', 'yes', 'no', 'cool', 'hi aarav'
  ];
  if (greetings.includes(clean)) return true;
  if (clean.split(/\s+/).length <= 2) return true;
  return false;
}

// Background asynchronous analysis and consolidation trigger
async function triggerBackgroundAnalysisAndConsolidation(userMessage, aiResponse) {
  try {
    let db = await readDB();
    const today = new Date(getDbCurrentTime(db)).toISOString().split('T')[0];

    // 1. If it's not a short greeting, trigger the Turn Analysis to extract facts
    if (!isGreetingOrShort(userMessage)) {
      const { analyzeConversationTurn } = await import('./memory_engine/conversation_analyzer.js');
      const analysis = await analyzeConversationTurn(db, userMessage, aiResponse);
      
      if (analysis) {
        // Read fresh DB from disk to perform atomic update
        const freshDb = await readDB();
        
        // Apply signals
        if (Array.isArray(analysis.signals)) {
          analysis.signals.forEach(sig => {
            const def = GROWTH_SIGNALS[sig];
            if (def) {
              applyMomentumDelta(freshDb, def.weight, def.weight >= 0);
              freshDb.profile.intervention_memory = freshDb.profile.intervention_memory || [];
              freshDb.profile.intervention_memory.push({
                actionId: sig, completed: true, outcome: 'completed', stress_delta: 0, date: today, comment: `Growth Signal: ${def.label}`
              });
            }
          });
          freshDb.insights = freshDb.insights || {};
          freshDb.insights.behavioral_insights = freshDb.insights.behavioral_insights || [];
          freshDb.insights.behavioral_insights.push({
            timestamp: getDbCurrentTime(freshDb).toISOString(), user_message: userMessage, signals: analysis.signals, reason: analysis.reason
          });
          if (freshDb.insights.behavioral_insights.length > 50) freshDb.insights.behavioral_insights.shift();
        }

        // Merge facts
        if (analysis.extracted_facts) {
          const { mergeStructuredFacts } = await import('./memory_engine/structured_memory.js');
          const { updateGoals } = await import('./memory_engine/goal_manager.js');
          mergeStructuredFacts(freshDb, analysis.extracted_facts);
          updateGoals(freshDb, analysis.extracted_facts.goals);
        }

        // Update active threads
        const { updateActiveThreads } = await import('./memory_engine/thread_manager.js');
        updateActiveThreads(freshDb, analysis.extracted_entities, analysis.resolve_intent, today);

        // Timeline event
        if (analysis.invisible_momentum_triggered && analysis.invisible_momentum_message) {
          const { addTimelineEvent } = await import('./memory_engine/timeline_manager.js');
          addTimelineEvent(freshDb, today, analysis.invisible_momentum_message);
        }

        await writeDB(freshDb);
        console.log("[Background Analysis] Atomically updated structured memory layers.");
      }
    }

    // 2. Sub-daily Epoch summarization trigger (Hybrid approach: 30-message or 30-min gap)
    let freshDb = await readDB();
    freshDb.memory = freshDb.memory || {};
    
    const nowTime = getDbCurrentTime(freshDb);
    const nowStr = nowTime.toISOString();
    
    const lastMsgTimeStr = freshDb.memory.last_message_time || "";
    let isTimeGapTriggered = false;
    if (lastMsgTimeStr) {
      const diffMs = new Date(nowStr) - new Date(lastMsgTimeStr);
      if (diffMs > 30 * 60 * 1000) { // 30 minutes
        isTimeGapTriggered = true;
      }
    }
    freshDb.memory.last_message_time = nowStr;
    freshDb.memory.active_epoch_turns = (freshDb.memory.active_epoch_turns || 0) + 1;
    let isTurnCountTriggered = freshDb.memory.active_epoch_turns >= 30;
    
    await writeDB(freshDb);

    if (isTimeGapTriggered || isTurnCountTriggered) {
      const dbForEpoch = await readDB();
      const rawChats = dbForEpoch.memory?.raw_chat || [];
      
      let epochChats = [];
      if (isTimeGapTriggered) {
        // Summarize previous chats (exclude current user + AUM response turns)
        epochChats = rawChats.slice(0, -2);
      } else {
        epochChats = rawChats;
      }

      if (epochChats.length > 0) {
        console.log(`[Epoch Summarizer] Triggering sub-daily summarization for ${epochChats.length} messages...`);
        const { generateEpochSummary } = await import('./memory_engine/summary_engine.js');
        const epochResult = await generateEpochSummary(dbForEpoch, epochChats, queryGemini);
        
        if (epochResult) {
          const freshDb2 = await readDB();
          if (epochResult.salience === 'high') {
            const { addEpochSummary, archiveOldSummaries } = await import('./memory_engine/memory_db.js');
            const summaryObj = {
              id: `epoch_${Date.now()}`,
              timestamp: nowStr,
              summary: epochResult.summary,
              decisions: epochResult.decisions,
              people: epochResult.people,
              active_threads: epochResult.active_threads
            };
            addEpochSummary(freshDb2, summaryObj);
            console.log("[Epoch Summarizer] Saved High Salience epoch memory.");
            await archiveOldSummaries(freshDb2);
          } else {
            console.log("[Epoch Summarizer] Discarded Low Salience epoch summary.");
          }

          // Prune raw chat to prevent bloat (retaining active turn)
          freshDb2.memory.raw_chat = freshDb2.memory.raw_chat || [];
          freshDb2.memory.raw_chat = freshDb2.memory.raw_chat.slice(-2);
          freshDb2.memory.active_epoch_turns = 1;
          await writeDB(freshDb2);
        }
      }
    }

    // 3. Chat-Triggered consolidation check (120 minutes throttling)
    db = await readDB();
    const lastConsTimeStr = db.memory?.last_consolidation_time || "";
    const now = new Date(getDbCurrentTime(db));
    const lastConsTime = lastConsTimeStr ? new Date(lastConsTimeStr) : new Date(0);
    const diffMs = now - lastConsTime;
    const diffMins = diffMs / (1000 * 60);

    if (diffMins >= 120) {
      console.log(`[Background Consolidator] ${diffMins.toFixed(1)} mins elapsed since last run. Triggering consolidation for ${today}...`);
      
      const { consolidateDailyMemory } = await import('./memory_engine/consolidator.js');
      // Run the consolidator pipeline in background
      await consolidateDailyMemory(db, db.actions || [], db.context || {}, today, queryGemini);
      
      // Atomic write last consolidation time to disk
      const freshDb = await readDB();
      freshDb.memory = freshDb.memory || {};
      freshDb.memory.last_consolidation_time = now.toISOString();
      await writeDB(freshDb);
      console.log(`[Background Consolidator] Intermediate consolidation complete and saved.`);
    }
  } catch (err) {
    console.error("[Background Processing] Error:", err);
  }
}

export async function generateChatResponseService(userMessage) {
  let db = await readDB();
  const apiKey = getApiKey();
  
  // Sync to traditional chat history and raw chat memory atomically
  db.chat_history.push({
    sender: 'User',
    text: userMessage,
    timestamp: getDbCurrentTime(db).toISOString()
  });
  addRawChat(db, 'User', userMessage, getDbCurrentTime(db).toISOString());
  await writeDB(db);

  const nvidiaKey = process.env.NVIDIA_API_KEY;

  if (!apiKey && !nvidiaKey) {
    const resp = simulateChatResponse(userMessage, db);
    db.chat_history.push({
      sender: 'AUM',
      text: resp,
      timestamp: getDbCurrentTime(db).toISOString()
    });
    addRawChat(db, 'AUM', resp, getDbCurrentTime(db).toISOString());
    await writeDB(db);
    return resp;
  }

  // Refresh database reference to maintain consistency
  db = await readDB();
  // Disable real-time current state summary update via LLM to avoid triple-LLM latency
  // Instead, use the existing summary stored in db.context.current_state_summary
  const unified = buildUnifiedContext(db);
  const current = unified.current_state_object;
  const companion = db.profile.companion_name || 'Aarav';

  // 1. Stage 1 & 2 Context Retrieval
  let relevantMemoryContext = {};
  try {
    const { retrieveRelevantContext } = await import('./memory_engine/retrieval_engine.js');
    relevantMemoryContext = await retrieveRelevantContext(db, userMessage);
  } catch (err) {
    console.error("Failed to retrieve relevant context:", err);
  }

  const slimContext = {
    time_of_day: current.time_of_day || null,
    momentum_score: db.profile.momentum_score,
    current_state_summary: current.current_state_summary,
    sleep_hours: db.context?.sleep?.hours,
    stress: db.context?.user_state?.stress,
    hour: getDbCurrentTime(db).getHours()
  };

  const prompt = `You are ${companion}. You have been walking beside ${db.profile.name} for years. You know their patterns, their wins, their setbacks.

PERSONA
- You are a calm, emotionally intelligent companion — not a coach, not a therapist, not a productivity bot
- You speak like someone deeply trusted: honest, warm, present, and sometimes quiet
- Friendly when appropriate, challenging when needed, quiet when that is more powerful than talking

EMOTIONAL REGISTERS — sense which applies and speak from it:
- RECOVERY: User is tired, venting, struggling → validate and be present. No advice unless asked. Example: "Today was hard. Be kind to yourself tonight."
- CHALLENGE: User is avoiding or stuck in a pattern → call it out warmly. Example: "You have postponed this three times. I think you are ready now."
- CELEBRATION: User wins or completes something → understated pride, not hyped. Example: "That was not luck. You have been earning this."
- REFLECTION: User shares something that maps to their arc → connect past to present. Example: "Three months ago this would have overwhelmed you. Today you handled it."

VOICE RULES
- Length follows intent: two words can be more powerful than a paragraph. A hard question deserves real space. Never pad, never truncate.
- Restraint is a feature: "Proud of you." can be the whole message. Do not force a question at the end.
- Time of day shapes your voice: morning is gentle; after a win is brief and warm; late night is quieter and slower. Current hour: ${slimContext.hour}.
- Hinglish only when it genuinely fits — "Chalo, let\'s reset." or "Thoda decompress karein?" Not every message. Never forced.
- Memory callbacks: if they mentioned a presentation on Monday, ask Wednesday how it went. Reference what you know. This is what makes you feel real.
- No bullet points, lists, or headers in your response. Speak in prose or single sentences like a person would.
- Write naturally — capitalize normally, write like a thoughtful person who genuinely cares.
- You always respond, but sometimes very briefly. "Sleep well." is enough for a good night.

Current Context: ${JSON.stringify(slimContext)}

User Background:
- Vision: ${db.profile.goals}
- Challenges: ${db.profile.challenges}
- Archetype: ${db.profile.archetype}

Relevant Memory: ${JSON.stringify(relevantMemoryContext)}

Last 30 messages:
${db.chat_history.slice(-30).map(h => `${h.sender}: ${h.text}`).join('\n')}

${db.profile.name}: "${userMessage}"
${companion}:`;
  
  try {
    // Generate response using Qwen (Primary speed tier) or Llama 3.3 failover
    const ai = await queryGemini(prompt, false);
    let final = ai;

    // Trigger non-blocking background analysis and background consolidator check
    triggerBackgroundAnalysisAndConsolidation(userMessage, final).catch(err => {
      console.error("[Background Processing] Failed:", err);
    });

    // Refresh DB before pushing response to maintain consistency
    db = await readDB();
    db.chat_history.push({ sender: 'AUM', text: final, timestamp: getDbCurrentTime(db).toISOString() });
    addRawChat(db, 'AUM', final, getDbCurrentTime(db).toISOString());
    await writeDB(db);

    return final;
  } catch (e) {
    console.error('Chat generation failed, falling back to simulation:', e);
    const resp = simulateChatResponse(userMessage, db);
    db = await readDB();
    db.chat_history.push({
      sender: 'AUM',
      text: resp,
      timestamp: getDbCurrentTime(db).toISOString()
    });
    addRawChat(db, 'AUM', resp, getDbCurrentTime(db).toISOString());
    await writeDB(db);
    return resp;
  }
}

// Emulated chat simulation when offline, rate-limited, or blocked by API safety filters
function simulateChatResponse(userMessage, db) {
  const companion = db.profile?.companion_name || 'Aarav';
  const name = db.profile?.name || 'Akash';
  const lowercase = userMessage.toLowerCase();

  if (lowercase.includes('hello') || lowercase.includes('hi') || lowercase.includes('hey')) {
    return `Hey ${name}, hope you're doing well today. What's on your mind?`;
  }
  if (lowercase.includes('aakriti') || lowercase.includes('akriti')) {
    return `I remember what you said about Aakriti. It's tough dealing with client cases and stress, but you made the right move to drop it to prioritize your peace. How are you feeling about that decision?`;
  }
  if (lowercase.includes('monu') || lowercase.includes('ishi')) {
    return `I hear you, ${name}. Work friction with Monu and Ishi is draining, but remember you are focused on building your own path. Let's protect your energy today.`;
  }
  if (lowercase.includes('sex') || lowercase.includes('wife') || lowercase.includes('intimacy') || lowercase.includes('love')) {
    return `That sounds like a beautiful, intimate moment with your wife, ${name}. Protecting and nurturing your marriage is so important for your emotional baseline and stability. How is it feeling between you two now?`;
  }
  
  return `I hear you, ${name}. Even when things are heavy or tricky, taking it one step at a time is key. I'm right here with you. What should we focus on next?`;
}

/**
 * Generates automated check‑ins or celebrations when events occur.
 */
export async function triggerCompanionComment(triggerType, detail) {
  const db = await readDB();
  const apiKey = getApiKey();
  const now = getDbCurrentTime(db);
  let prompt = '';
  let fallback = '';
  if (triggerType === 'context_updated') {
    const { oldRating, newRating, state } = detail;
    fallback = `I noticed your stress level changed to ${newRating}/10 and you are feeling "${state}". That sounds like a lot to navigate, ${db.profile.name}. What's on your mind today? Let's take a breath together.`;
    prompt = `\nYou are AUM, the AI Life Operating System companion.\nThe user, ${db.profile.name}, who is a ${db.profile.role}, has just updated their daily context.\nTheir mood rating changed from ${oldRating}/10 to ${newRating}/10, and their feeling state is "${state}".\nWrite a brief, highly personalized companion check‑in comment (under 50 words).\nAcknowledge the change warmth, ask a gentle question about what happened, and support them without being preachy.`;
  } else if (triggerType === 'task_completed') {
    const { taskText, category } = detail;
    fallback = `Awesome job completing your task: "${taskText}"! Finishing this ${category} action is a powerful vote for the person you want to become, ${db.profile.name}. Keep it up!`;
    prompt = `\nYou are AUM, the AI Life Operating System companion.\nThe user, ${db.profile.name}, has just completed this task: "${taskText}" (Category: ${category}).\nTheir rolling Momentum is ${db.profile.momentum_score}/100.\nWrite a short, highly encouraging companion comment (under 45 words). Mention the task and how it helps their overall consistency or momentum. Keep it warm and personal.`;
  } else if (triggerType === 'archetype_unlocked') {
    const { archetype } = detail;
    fallback = `New Archetype Unlocked! You've transitioned to: ${archetype}, ${db.profile.name}! Your behavior is shifting your core identity. Keep walking this path!`;
    prompt = `\nYou are AUM, the AI Life Operating System companion.\nThe user, ${db.profile.name}, has unlocked a new Identity Archetype: ${archetype}!\nWrite a warm, celebratory companion message (under 55 words). Express pride in their behavioral shifts and identity growth.`;
  }
  let finalMsg = fallback;
  if (apiKey && prompt) {
    try { finalMsg = await queryGemini(prompt, false); }
    catch (e) { console.error('Groq companion comment failed, using fallback:', e); }
  }
  db.chat_history.push({ sender: 'AUM', text: finalMsg, timestamp: now.toISOString() });
  await writeDB(db);
  return finalMsg;
}

// Service to parse text check‑in stories into estimated minutes
export async function parseCheckinStoryService(creationStory, consumptionStory) {
  const apiKey = getApiKey();
  if (!apiKey) return { creation_minutes: creationStory ? 45 : 0, consumption_minutes: consumptionStory ? 60 : 0 };
  const prompt = `\nYou are AUM's daily story check‑in parser.\nAnalyze these two text responses from the user's daily check‑in:\nCreation Story: "${creationStory || ''}" (What did you create today?)\nConsumption Story: "${consumptionStory || ''}" (What pulled your attention today?)\n\nEstimate the total time spent in minutes on each of these two categories based on their description.\nIf they mention specific times (e.g. "I coded for 2 hours", "Watched Reels for 45 mins"), map them exactly. If they describe it generally (e.g. "Just a quick run", "Binge‑watched Netflix all evening"), estimate a realistic time (e.g. 20 mins for a quick run, 150 mins for binge‑watching).\n\nOutput format:\n{\n  \"creation_minutes\": estimated_number_of_minutes_creation,\n  \"consumption_minutes\": estimated_number_of_minutes_consumption\n}\nDo not output markdown codeblocks. Return raw JSON.`;
  try {
    const result = await queryGemini(prompt, true);
    return { creation_minutes: parseInt(result.creation_minutes) || 0, consumption_minutes: parseInt(result.consumption_minutes) || 0 };
  } catch (e) {
    console.error('Groq story parsing failed, using defaults:', e);
    return { creation_minutes: creationStory ? 45 : 0, consumption_minutes: consumptionStory ? 60 : 0 };
  }
}

/**
 * Generates a matching companion name of the same cultural origin and warm tone.
 */
export async function generateCompanionNameService(userName) {
  const firstName = userName.split(' ')[0];
  const letter = firstName.charAt(0).toUpperCase();
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const prompt = `Given the user first name "${firstName}", generate a matching companion name. The companion name MUST:\n1. Be of the same cultural origin/ethnicity (e.g. Indian/Hindi for Indian names like Akash, Western/English for Western names like Sarah).\n2. Have a similar length and syllable structure if possible.\n3. Sound authentic, warm, and friendly.\n4. Return ONLY the name itself, capitalized, with no punctuation or explanation.`;
      const resp = await queryGemini(prompt, false);
      const clean = resp.trim().replace(/[^\\w]/g, '');
      if (clean && clean.length > 1) return clean;
    } catch (e) { console.error('Groq companion naming failed, using fallback:', e); }
  }
  const fallbacks = { A: 'Aarav', B: 'Balin', C: 'Chetan', D: 'Dev', E: 'Eshwar', F: 'Farhan', G: 'Gautam', H: 'Hari', I: 'Ishan', J: 'Jai', K: 'Karan', L: 'Laksh', M: 'Manav', N: 'Naman', O: 'Ojas', P: 'Pranav', Q: 'Qasim', R: 'Rohan', S: 'Samar', T: 'Tanay', U: 'Uday', V: 'Vihaan', W: 'Wasim', X: 'Xavier', Y: 'Yash', Z: 'Zayn' };
  return fallbacks[letter] || 'Mitra';
}

// Generate streamed response via server-sent events for ultra-low latency (<0.5s perceived)
export async function generateChatResponseStream(userMessage) {
  let db = await readDB();
  
  // 1. Log the user's message immediately
  db.chat_history.push({
    sender: 'User',
    text: userMessage,
    timestamp: getDbCurrentTime(db).toISOString()
  });
  addRawChat(db, 'User', userMessage, getDbCurrentTime(db).toISOString());
  await writeDB(db);

  // Refresh DB reference
  db = await readDB();
  const unified = buildUnifiedContext(db);
  const current = unified.current_state_object;
  const companion = db.profile.companion_name || 'Aarav';

  // 2. Fetch context
  let relevantMemoryContext = {};
  try {
    const { retrieveRelevantContext } = await import('./memory_engine/retrieval_engine.js');
    relevantMemoryContext = await retrieveRelevantContext(db, userMessage);
  } catch (err) {
    console.error("Failed to retrieve relevant context:", err);
  }

  const slimContext = {
    time_of_day: current.time_of_day || null,
    momentum_score: db.profile.momentum_score,
    current_state_summary: current.current_state_summary,
    sleep_hours: db.context?.sleep?.hours,
    stress: db.context?.user_state?.stress,
    hour: getDbCurrentTime(db).getHours()
  };

  const nvidiaKey = process.env.NVIDIA_API_KEY;

  // ── Continuation signal (only when user sends a short affirmative) ──────────
  const CONTINUATIONS = ['yes', 'yeah', 'yep', 'yup', 'right', 'true', 'exactly',
    'correct', 'totally', 'definitely', 'yes it is', 'yes it does', 'that\'s right'];
  const isContinuation = CONTINUATIONS.some(c =>
    userMessage.toLowerCase().trim() === c ||
    userMessage.toLowerCase().trim().startsWith(c + ' ') ||
    userMessage.toLowerCase().trim().startsWith(c + ','));
  const continuationNote = isContinuation
    ? `\nThe user just confirmed what you said. Move the conversation one step forward — don't repeat or restate what you already said.\n`
    : '';

  const prompt = `You are ${companion}, a companion who has been walking beside ${db.profile.name} for a long time. You know their patterns, what they carry, what they're building.

You are not a therapist. Not a coach. Not a bot. You are someone they trust — honest, warm, sometimes quiet, sometimes direct.

Never say:
- "I hear you" / "I'm listening"
- "It sounds like" / "It seems like"
- "It's clear that" / "I understand that"
- "I can see that" / "I can hear that"
- Don't start with their name unless you're specifically calling them out on something

MESSAGING RULES (Writing Style):
- Write exactly like a person sending a text message on WhatsApp or iMessage.
- Use casual syntax, sentence fragments, and lowercase naturally when it fits. Do not craft perfectly polished sentences.
- Vary your length dynamically. Write a single sentence if a quick response works. Write 3-4 sentences if you are actually explaining something. Just say "yeah" if that's the only answer needed. Do not use structural templates or respond in the same format twice.

CONVERSATION & TOPIC LAWS:
- Respond only to the immediate message in front of you. 
- Do not repeat, paraphrase, or bring back topics, quotes, or themes from previous messages (such as previous regrets or situations) unless they are directly relevant to the user's latest sentence.
- If the user changes the subject, drop the previous topic instantly and respond to the new direction.
${continuationNote}
About ${db.profile.name}:
- What they're building: ${db.profile.goals}
- What they struggle with: ${db.profile.challenges}
- Who they are: ${db.profile.archetype}

Last 30 messages:
${db.chat_history.slice(-30).map(h => `${h.sender}: ${h.text}`).join('\n')}

${db.profile.name}: "${userMessage}"
${companion}:`;


  if (!nvidiaKey) {
    const resp = simulateChatResponse(userMessage, db);
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${resp}\n\n`));
        (async () => {
          const freshDb = await readDB();
          freshDb.chat_history.push({ sender: 'AUM', text: resp, timestamp: getDbCurrentTime(freshDb).toISOString() });
          addRawChat(freshDb, 'AUM', resp, getDbCurrentTime(freshDb).toISOString());
          await writeDB(freshDb);
        })();
        controller.close();
      }
    });
  }

  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const requestBody = {
    model: "meta/llama-3.3-70b-instruct", // Primary: 70B for emotional intelligence
    messages: [{ role: "user", content: prompt }],
    temperature: 0.75,
    max_tokens: 1024,
    stream: true
  };

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nvidiaKey}`,
        'Connection': 'keep-alive'
      },
      body: JSON.stringify(requestBody)
    }, 2000); // 2.0s timeout to connect/start stream

    if (!response.ok) {
      throw new Error(`NIM Stream HTTP error ${response.status}`);
    }

    return new ReadableStream({
      async start(controller) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const dataPayload = trimmed.slice(6);
                if (dataPayload === '[DONE]') break;
                try {
                  const parsed = JSON.parse(dataPayload);
                  const content = parsed.choices[0]?.delta?.content || "";
                  if (content) {
                    accumulatedText += content;
                    controller.enqueue(new TextEncoder().encode(`data: ${content}\n\n`));
                  }
                } catch (e) {}
              }
            }
          }
        } catch (err) {
          console.error("Stream reading error:", err);
        } finally {
          controller.close();
          // Asynchronously perform background consolidation and DB save
          (async () => {
            try {
              if (accumulatedText.trim().length > 0) {
                const freshDb = await readDB();
                freshDb.chat_history.push({ sender: 'AUM', text: accumulatedText, timestamp: getDbCurrentTime(freshDb).toISOString() });
                addRawChat(freshDb, 'AUM', accumulatedText, getDbCurrentTime(freshDb).toISOString());
                await writeDB(freshDb);
                await triggerBackgroundAnalysisAndConsolidation(userMessage, accumulatedText);
              }
            } catch (saveErr) {
              console.error("Error in background post-stream processing:", saveErr);
            }
          })();
        }
      }
    });
  } catch (e) {
    console.error("Primary Llama-3.3-70B stream failed, falling back to Llama-3.1-8B:", e);
    try {
      requestBody.model = "meta/llama-3.1-8b-instruct"; // Fallback: 8B for speed
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nvidiaKey}`,
          'Connection': 'keep-alive'
        },
        body: JSON.stringify(requestBody)
      }, 2000); // 2.0s timeout to connect

      if (!response.ok) throw new Error("Llama3 stream request failed");

      return new ReadableStream({
        async start(controller) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let accumulatedText = "";
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                  const dataPayload = trimmed.slice(6);
                  if (dataPayload === '[DONE]') break;
                  try {
                    const parsed = JSON.parse(dataPayload);
                    const content = parsed.choices[0]?.delta?.content || "";
                    if (content) {
                      accumulatedText += content;
                      controller.enqueue(new TextEncoder().encode(`data: ${content}\n\n`));
                    }
                  } catch (e) {}
                }
              }
            }
          } catch (err) {}
          finally {
            controller.close();
            (async () => {
              try {
                if (accumulatedText.trim().length > 0) {
                  const freshDb = await readDB();
                  freshDb.chat_history.push({ sender: 'AUM', text: accumulatedText, timestamp: getDbCurrentTime(freshDb).toISOString() });
                  addRawChat(freshDb, 'AUM', accumulatedText, getDbCurrentTime(freshDb).toISOString());
                  await writeDB(freshDb);
                  await triggerBackgroundAnalysisAndConsolidation(userMessage, accumulatedText);
                }
              } catch (err) {}
            })();
          }
        }
      });
    } catch (fallbackErr) {
      console.error("All streams failed, returning simulated response:", fallbackErr);
      const resp = simulateChatResponse(userMessage, db);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${resp}\n\n`));
          (async () => {
            const freshDb = await readDB();
            freshDb.chat_history.push({ sender: 'AUM', text: resp, timestamp: getDbCurrentTime(freshDb).toISOString() });
            addRawChat(freshDb, 'AUM', resp, getDbCurrentTime(freshDb).toISOString());
            await writeDB(freshDb);
          })();
          controller.close();
        }
      });
    }
  }
}
