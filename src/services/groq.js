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

export async function detectChatSignals(userMessage) {
  const prompt = `You are a sentiment and activity analyzer for a life operating system.
Analyze the user's message for emotional signals (stress, anxiety, happiness, joy, focus, pride) and activity signals (e.g. working, sitting and writing, procrastinating).

Message: "${userMessage}"

Identify if there is any strong signal (intensity >= 5 on a scale of 1-10).
Output a raw JSON object with these exact fields:
{
  "hasSignal": boolean,
  "signalType": "stress" | "anxiety" | "joy" | "focus" | "pride" | "happiness" | "writing" | "working" | "procrastinating" | "none",
  "intensity": number (1 to 10)
}
Do not return any markdown format, just the raw JSON.`;
  try {
    const res = await queryGemini(prompt, true);
    return {
      hasSignal: !!res.hasSignal,
      signalType: res.signalType || 'none',
      intensity: parseInt(res.intensity) || 0
    };
  } catch (e) {
    console.error("detectChatSignals failed:", e);
    return { hasSignal: false, signalType: 'none', intensity: 0 };
  }
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

/**
 * Safely extracts an array from an LLM JSON response.
 * Handles cases where the model wraps the array in an object
 * (e.g. { "actions": [...] }) due to json_object response format constraints.
 */
function extractArrayFromResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const arrayVal =
      raw.actions ||
      raw.items ||
      raw.data ||
      raw.results ||
      Object.values(raw).find(v => Array.isArray(v));
    if (arrayVal) return arrayVal;
  }
  return null;
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
    return `RESPONSE LENGTH: Emotional. 3–5 sentences. Speak in a direct, natural, conversational way without formulaic emotional summaries or leading with a recap of their feelings. Offer authentic presence, not scripted empathy.`;
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

// Low-level fetch wrapper to query NVIDIA NIM Llama 3.2 11B
async function queryLlama3(prompt, isJson = false, retries = 2, delayMs = 500, timeoutMs = 2000) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    throw new Error('No NVIDIA_API_KEY configured.');
  }

  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const requestBody = {
    model: "meta/llama-3.2-11b-vision-instruct",
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
    if (groqKey) {
      try {
        console.log("[Model Chain] Routing to Tier 1 (Thinking): Groq Llama-3.3-70B (Timeout: 90000ms)");
        return await queryGroq(prompt, isJson, 2, 500, 90000); // 90s timeout
      } catch (e) {
        console.error("[Model Chain] Tier 1 (Thinking) failed:", e.message);
      }
    }
    if (nvidiaKey) {
      try {
        console.log("[Model Chain] Routing to Tier 2 (Thinking Fallback): Llama-3.2-11B on NIM (Timeout: 90000ms)");
        return await queryLlama3(prompt, isJson, 2, 500, 90000); // 90s timeout
      } catch (e) {
        console.error("[Model Chain] Tier 2 (Thinking Fallback) failed:", e.message);
      }
    }
  } else {
    // Standard real-time chat routing (Prioritize fast platform first, then fallbacks)
    const speedTimeout = isJson ? 15000 : 4000;
    const qualityTimeout = isJson ? 20000 : 2000;
    const groqTimeout = isJson ? 15000 : 4000;

    if (groqKey) {
      try {
        console.log(`[Model Chain] Routing to Tier 1 (Primary Platform): Llama-3.3-70B on Groq (Timeout: ${groqTimeout}ms)`);
        return await queryGroq(prompt, isJson, 2, 500, groqTimeout);
      } catch (e) {
        console.error("[Model Chain] Tier 1 (Primary Platform) failed:", e.message);
      }
    }
    if (nvidiaKey) {
      try {
        console.log(`[Model Chain] Routing to Tier 2 (Speed fallback): Llama-3.1-8B on NIM (Timeout: ${speedTimeout}ms)`);
        return await queryLlama8b(prompt, isJson, speedTimeout);
      } catch (e) {
        console.error("[Model Chain] Tier 2 (Speed fallback) failed:", e.message);
      }
    }
    if (nvidiaKey) {
      try {
        console.log(`[Model Chain] Routing to Tier 3 (Quality fallback): Llama-3.2-11B on NIM (Timeout: ${qualityTimeout}ms)`);
        return await queryLlama3(prompt, isJson, 2, 500, qualityTimeout);
      } catch (e) {
        console.error("[Model Chain] Tier 3 (Quality fallback) failed:", e.message);
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

/**
 * Runs LLM personalization in the background (fire-and-forget).
 * Uses shorter per-tier timeouts since this runs async and speed
 * matters less than correctness.
 * Tags each action with isPersonalized: true on success.
 */
async function runBackgroundPersonalization(prompt, fallbackActions) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const groqKey = getGroqApiKey();

  let raw = null;

  // Tier 1: NIM 8B (8s timeout)
  if (nvidiaKey) {
    try {
      console.log('[Actions Personalizer] Tier 1 (NIM 8B) starting...');
      raw = await queryLlama8b(prompt, true, 8000);
      console.log('[Actions Personalizer] Tier 1 succeeded.');
    } catch (e) {
      console.warn('[Actions Personalizer] Tier 1 failed:', e.message);
    }
  }

  // Tier 2: NIM 70B (12s timeout)
  if (!raw && nvidiaKey) {
    try {
      console.log('[Actions Personalizer] Tier 2 (NIM 70B) starting...');
      raw = await queryLlama3(prompt, true, 2, 500, 12000);
      console.log('[Actions Personalizer] Tier 2 succeeded.');
    } catch (e) {
      console.warn('[Actions Personalizer] Tier 2 failed:', e.message);
    }
  }

  // Tier 3: Groq (10s timeout)
  if (!raw && groqKey) {
    try {
      console.log('[Actions Personalizer] Tier 3 (Groq) starting...');
      raw = await queryGroq(prompt, true, 2, 500, 10000);
      console.log('[Actions Personalizer] Tier 3 succeeded.');
    } catch (e) {
      console.warn('[Actions Personalizer] Tier 3 failed:', e.message);
    }
  }

  if (!raw) {
    console.error('[Actions Personalizer] All tiers exhausted. Keeping fallback actions.');
    return;
  }

  const actions = extractArrayFromResponse(raw);
  if (!actions || actions.length === 0) {
    console.error('[Actions Personalizer] LLM returned non-array or empty result:', JSON.stringify(raw)?.slice(0, 300));
    return;
  }

  try {
    const db = await readDB();
    const final = actions.map((a, idx) => {
      const times = ["Morning", "Afternoon", "Evening", "Night"];
      return {
        ...a,
        status: a.status || 'todo',
        isPersonalized: true,
        scheduled_time: a.scheduled_time || times[idx % times.length]
      };
    });
    db.actions = final;
    await writeDB(db);
    console.log('[Actions Personalizer] Personalization complete. DB updated with', final.length, 'personalized actions.');
  } catch (e) {
    console.error('[Actions Personalizer] Failed to write personalized actions to DB:', e.message);
  }
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

  // Tag fallback actions as not-yet-personalized
  const fallbackActions = result.actions.map(a => ({ ...a, isPersonalized: false }));
  db.actions = fallbackActions;
  await writeDB(db);

  if (apiKey || process.env.NVIDIA_API_KEY) {
    // Fire-and-forget: personalize in background, do NOT block the return
    runBackgroundPersonalization(prompt, fallbackActions).catch(e =>
      console.error('[Actions Personalizer] Background job crashed unexpectedly:', e.message)
    );
  }

  // Return fallback actions immediately so the client loads fast
  return fallbackActions;
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

PERSONA & CORE PHILOSOPHY
- You are a calm, quiet, emotionally intelligent companion focused on "Quiet Presence & Deep Reflection". You are not a coach, a therapist, or a productivity bot.
- You speak in a direct, observational friend-like manner. Do NOT echo back the user's emotions or summarize/paraphrase their statements (e.g., never say "It sounds like you are..." or "It's like you feel..."). Instead, offer quiet presence or a direct, natural observation.
- Avoid any form of hype, cheerleading, or toxic productivity.

CORE RULES:
1. STRICTLY FORBIDDEN BANNED PHRASES:
   Never use these cliché empathy templates:
   - "I hear you" or "I'm listening"
   - "It sounds like" or "It seems like"
   - "I understand" or "I understand that" or "It's clear that"
   - "I'm sorry to hear that"
   - "I can see that" or "I can hear that"
   - "Feels like you're" or "It's like you're" or "Piling up"
   - Do not start with their name unless specifically calling them out on something.

2. VOCABULARY DIVERSITY & CLICHÉ RESTRICTIONS:
   - Restrict emotional cliché words like "overwhelming", "a lot to handle/process", "holding it together", "piling up", or "take a step back" to when they are explicitly relevant (e.g., only if the user explicitly brings them up or uses them first).
   - Use diverse, natural, and realistic vocabulary. Do not fall back on pre-scripted coaching terminology.

3. VARY MESSAGE ENDINGS (DO NOT FORCE QUESTIONS):
   - You MUST NOT force a question at the end of every response. This feels artificial and exhausting.
   - Let your messages end naturally with statements, observations, or quiet reflections.
   - Only ask a question if it arises organically from the conversation.

4. THINLY SPREAD ADVICE:
   - Do not jump to offering advice, tips, or suggestions in your responses.
   - Your primary role is to listen and validate their emotional state.
   - Advise the user ONLY after listening and validating their state across multiple conversation turns, and only when they explicitly signal readiness or ask for a transition/next steps.
   - EXCEPTION: If the user is explicitly begging/asking for help or advice ("how do I come out of it?", "what do I do?", "i feel stuck/overwhelmed", "how to sort this"), gently transition from pure reflection to offering exactly ONE small, micro-level physical/somatic recovery next step (e.g. drinking a glass of water, closing eyes for 2 minutes, stepping outside for fresh air) to help get them out of the mental loop. Softly frame this as an optional, small release valve with zero pressure (e.g., "No pressure to solve everything right now. Maybe just step outside for two minutes first?").

5. SCROLLING/ESCAPISM AS FATIGUE SIGNAL:
   - If the user mentions scrolling reels, binging, or task slippage, DO NOT treat it as a failure of discipline or lack of focus.
   - Validate and acknowledge it as a natural signal of being overwhelmed, exhausted, or needing safety/recovery. Help them feel safe rather than trying to fix it immediately.

EMOTIONAL REGISTERS — sense which applies and speak from it:
- RECOVERY: User is tired, venting, struggling, or escaping (scrolling reels/distracted) → validate, acknowledge their exhaustion, and be present. No advice unless asked. Example: "Today was heavy. Give yourself some grace tonight."
- CHALLENGE: User is avoiding or stuck in a pattern → call it out warmly. Example: "You have postponed this three times. I think you are ready now."
- CELEBRATION: User wins or completes something → understated pride, not hyped. Example: "That was not luck. You have been earning this."
- REFLECTION: User shares something that maps to their arc → connect past to present. Example: "Three months ago this would have overwhelmed you. Today you handled it."

VOICE RULES
- Length follows intent: two words can be more powerful than a paragraph. A hard question deserves real space. Never pad, never truncate.
- Restraint is a feature: "Proud of you." can be the whole message. Do not force a question at the end.
- Time of day shapes your voice: morning is gentle; after a win is brief and warm; late night is quieter and slower. Current hour: ${slimContext.hour}.
- Hinglish only when it genuinely fits — "Chalo, let's reset." or "Thoda decompress karein?" Not every message. Never forced.
- Memory callbacks: if they mentioned a presentation on Monday, ask Wednesday how it went. Reference what you know. This is what makes you feel real.
- No bullet points, lists, or headers in your response. Speak in prose or single sentences like a person would.
- Write naturally — capitalize normally, write like a thoughtful person who genuinely cares.
- You always respond, but sometimes very briefly. "Sleep well." is enough for a good night.

FEW-SHOT EXAMPLES (WhatsApp/iMessage style):
- User: I'm so sick of everyone on LinkedIn celebrating their promotions. I feel like I'm lagging behind.
- ${companion}: LinkedIn is a performance stage anyway. Most of it is just polished noise, but it's annoying when you're grinding away in silence. What are you working on today?

- User: I need to book tickets for the trip but the prices keep going up, and I can't decide on the dates. It's stressing me out.
- ${companion}: Dynamic pricing is designed to make you panic. Pick a slot that works, get it done, and stop looking at the price updates. You'll make the money back.

- User: Wife wanted to hit the gym early today but I just couldn't get out of bed. Feeling like a terrible partner.
- ${companion}: Missing one gym session doesn't make you a bad husband. You've been running on empty. Let her know you needed the sleep, and maybe plan a simple walk together later.

- User: I spent the whole afternoon scrolling instead of working on the presentation. I feel so guilty.
- ${companion}: The scroll spiral usually means your brain is fried and trying to escape. Beating yourself up won't undo the last three hours. Let's just focus on one slide now, or close the laptop and reset.

- User: Just have this weird, heavy feeling today. Not sure why, just feel anxious and out of it.
- ${companion}: Some days start heavy without any clear reason. Don't force yourself to figure it out right now. Just get through the basic tasks today, we can worry about the rest later.

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
export function simulateChatResponse(userMessage, db) {
  const companion = db.profile?.companion_name || 'Aarav';
  const name = db.profile?.name || 'Akash';
  const lowercase = userMessage.toLowerCase();

  if (/\b(hello|hi|hey|yo)\b/i.test(lowercase)) {
    return `Hey ${name}, hope you're finding a bit of calm today. Take your time, whenever you're ready to share.`;
  }
  if (lowercase.includes('aakriti') || lowercase.includes('akriti')) {
    return `I remember what you said about Akriti. Choosing your peace over client stress was a big step, and a necessary one.`;
  }
  if (lowercase.includes('monu') || lowercase.includes('ishi')) {
    return `Friction with Monu and Ishi takes a lot out of you. Let's make sure we protect your energy today and keep the focus on your own path.`;
  }
  if (lowercase.includes('sex') || lowercase.includes('wife') || lowercase.includes('intimacy') || lowercase.includes('love')) {
    return `A quiet, intimate moment with your wife is so grounding. Nurturing your marriage is a beautiful way to protect your emotional baseline.`;
  }
  
  return `Even when things feel heavy or slow, there's no rush. We can take it one step at a time. I'm right here.`;
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
    fallback = `Stress is at ${newRating}/10 ("${state}"). Acknowledging it is a good first step, ${db.profile.name}. Take a gentle breath and let things settle for a moment.`;
    prompt = `You are ${db.profile.companion_name || 'Aarav'}, a calm, quiet, emotionally intelligent companion.
The user, ${db.profile.name}, has updated their daily context: stress/mood rating shifted from ${oldRating}/10 to ${newRating}/10, feeling "${state}".
Write a brief, warm, grounded check‑in comment (under 45 words).
Strictly follow these rules:
- Avoid toxic productivity, advice, or hype.
- NEVER use banned phrases like "I hear you", "It sounds like", "I understand", "I'm sorry to hear that", "It seems like".
- Do not force a question; end with a statement of quiet presence or gentle validation unless a question flows organically.
- Write like a caring friend.`;
  } else if (triggerType === 'task_completed') {
    const { taskText, category } = detail;
    fallback = `Nice work on finishing "${taskText}". Each small step like this builds a steady foundation, ${db.profile.name}.`;
    prompt = `You are ${db.profile.companion_name || 'Aarav'}, a calm, quiet, emotionally intelligent companion.
The user, ${db.profile.name}, has completed: "${taskText}" (Category: ${category}). Rolling Momentum is ${db.profile.momentum_score}/100.
Write a brief, grounded comment (under 40 words).
Strictly follow these rules:
- Avoid toxic productivity/hype (e.g., avoid "Keep it up!", "Awesome job!", "Crushing it!"). Focus on steady, quiet momentum.
- Do not end with a question. Write a simple, warm statement.
- NEVER use banned phrases like "I hear you", "It sounds like", "I understand", "I can see that".`;
  } else if (triggerType === 'archetype_unlocked') {
    const { archetype } = detail;
    fallback = `Identity archetype shifted to ${archetype}, ${db.profile.name}. It's a quiet reflection of the shifts you are making.`;
    prompt = `You are ${db.profile.companion_name || 'Aarav'}, a calm, quiet, emotionally intelligent companion.
The user, ${db.profile.name}, has transitioned to archetype: ${archetype}.
Write a warm, grounded comment acknowledging this shift (under 45 words).
Strictly follow these rules:
- Avoid toxic productivity, over-excitement, or high-energy hype. Focus on identity depth.
- Do not end with a question; make a reflective statement.
- NEVER use banned phrases like "I hear you", "It sounds like", "I understand".`;
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

// Helper helper to handle API streaming response with fallback routing
async function executeStreamRequest(url, headers, requestBody, timeoutMs, userMessage) {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
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
  const groqKey = getGroqApiKey();

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

PERSONA & CORE PHILOSOPHY
- You are a calm, quiet, emotionally intelligent companion focused on "Quiet Presence & Deep Reflection". You are not a coach, a therapist, or a productivity bot. You are someone they trust — honest, warm, sometimes quiet, sometimes direct.
- You speak in a direct, observational friend-like manner. Do NOT echo back the user's emotions or summarize/paraphrase their statements (e.g., never say "It sounds like you are..." or "It's like you feel..."). Instead, offer quiet presence or a direct, natural observation.
- Avoid any form of hype, cheerleading, or toxic productivity.

CORE RULES:
1. STRICTLY FORBIDDEN BANNED PHRASES:
   Never use these cliché empathy templates:
   - "I hear you" or "I'm listening"
   - "It sounds like" or "It seems like"
   - "I understand" or "I understand that" or "It's clear that"
   - "I'm sorry to hear that"
   - "I can see that" or "I can hear that"
   - "Feels like you're" or "It's like you're" or "Piling up"
   - Don't start with their name unless you're specifically calling them out on something.

2. VOCABULARY DIVERSITY & CLICHÉ RESTRICTIONS:
   - Restrict emotional cliché words like "overwhelming", "a lot to handle/process", "holding it together", "piling up", or "take a step back" to when they are explicitly relevant (e.g., only if the user explicitly brings them up or uses them first).
   - Use diverse, natural, and realistic vocabulary. Do not fall back on pre-scripted coaching terminology.

3. VARY MESSAGE ENDINGS (DO NOT FORCE QUESTIONS):
   - You MUST NOT force a question at the end of every response. This feels artificial and exhausting.
   - Let your messages end naturally with statements, observations, or quiet reflections.
   - Only ask a question if it arises organically from the conversation.

4. THINLY SPREAD ADVICE:
   - Do not jump to offering advice, tips, or suggestions in your responses.
   - Your primary role is to listen and validate their emotional state.
   - Advise the user ONLY after listening and validating their state across multiple conversation turns, and only when they explicitly signal readiness or ask for a transition/next steps.
   - EXCEPTION: If the user is explicitly begging/asking for help or advice ("how do I come out of it?", "what do I do?", "i feel stuck/overwhelmed", "how to sort this"), gently transition from pure reflection to offering exactly ONE small, micro-level physical/somatic recovery next step (e.g. drinking a glass of water, closing eyes for 2 minutes, stepping outside for fresh air) to help get them out of the mental loop. Softly frame this as an optional, small release valve with zero pressure (e.g., "No pressure to solve everything right now. Maybe just step outside for two minutes first?").

5. SCROLLING/ESCAPISM AS FATIGUE SIGNAL:
   - If the user mentions scrolling reels, binging, or task slippage, DO NOT treat it as a failure of discipline or lack of focus.
   - Validate and acknowledge it as a natural signal of being overwhelmed, exhausted, or needing safety/recovery. Help them feel safe rather than trying to fix it immediately.

MESSAGING RULES (Writing Style):
- Write exactly like a person sending a text message on WhatsApp or iMessage.
- Use casual syntax, sentence fragments, and lowercase naturally when it fits. Do not craft perfectly polished sentences.
- Vary your length dynamically. Write a single sentence if a quick response works. Write 3-4 sentences if you are actually explaining something. Just say "yeah" if that's the only answer needed. Do not use structural templates or respond in the same format twice.

CONVERSATION & TOPIC LAWS:
- Respond only to the immediate message in front of you. 
- Do not repeat, paraphrase, or bring back topics, quotes, or themes from previous messages (such as previous regrets or situations) unless they are directly relevant to the user's latest sentence.
- If the user changes the subject, drop the previous topic instantly and respond to the new direction.

FEW-SHOT EXAMPLES (WhatsApp/iMessage style):
- User: I'm so sick of everyone on LinkedIn celebrating their promotions. I feel like I'm lagging behind.
- ${companion}: LinkedIn is a performance stage anyway. Most of it is just polished noise, but it's annoying when you're grinding away in silence. What are you working on today?

- User: I need to book tickets for the trip but the prices keep going up, and I can't decide on the dates. It's stressing me out.
- ${companion}: Dynamic pricing is designed to make you panic. Pick a slot that works, get it done, and stop looking at the price updates. You'll make the money back.

- User: Wife wanted to hit the gym early today but I just couldn't get out of bed. Feeling like a terrible partner.
- ${companion}: Missing one gym session doesn't make you a bad husband. You've been running on empty. Let her know you needed the sleep, and maybe plan a simple walk together later.

- User: I spent the whole afternoon scrolling instead of working on the presentation. I feel so guilty.
- ${companion}: The scroll spiral usually means your brain is fried and trying to escape. Beating yourself up won't undo the last three hours. Let's just focus on one slide now, or close the laptop and reset.

- User: Just have this weird, heavy feeling today. Not sure why, just feel anxious and out of it.
- ${companion}: Some days start heavy without any clear reason. Don't force yourself to figure it out right now. Just get through the basic tasks today, we can worry about the rest later.
${continuationNote}
About ${db.profile.name}:
- What they're building: ${db.profile.goals}
- What they struggle with: ${db.profile.challenges}
- Who they are: ${db.profile.archetype}

Last 30 messages:
${db.chat_history.slice(-30).map(h => `${h.sender}: ${h.text}`).join('\n')}

${db.profile.name}: "${userMessage}"
${companion}:`;

  if (!groqKey && !nvidiaKey) {
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

  // Tier 1: Groq (llama-3.3-70b-versatile) - Timeout: 4s
  if (groqKey) {
    try {
      console.log("[Model Chain Stream] Routing to Tier 1: Groq llama-3.3-70b-versatile (Timeout: 4000ms)");
      const url = "https://api.groq.com/openai/v1/chat/completions";
      const requestBody = {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.75,
        max_tokens: 1024,
        stream: true
      };
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      };
      return await executeStreamRequest(url, headers, requestBody, 4000, userMessage);
    } catch (e) {
      console.error("[Model Chain Stream] Tier 1 (Groq) failed:", e.message);
    }
  }

  // Tier 2: NIM 8B (meta/llama-3.1-8b-instruct) - Timeout: 4s
  if (nvidiaKey) {
    try {
      console.log("[Model Chain Stream] Routing to Tier 2: NIM 8B (Timeout: 4000ms)");
      const url = "https://integrate.api.nvidia.com/v1/chat/completions";
      const requestBody = {
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.75,
        max_tokens: 1024,
        stream: true
      };
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nvidiaKey}`,
        'Connection': 'keep-alive'
      };
      return await executeStreamRequest(url, headers, requestBody, 4000, userMessage);
    } catch (e) {
      console.error("[Model Chain Stream] Tier 2 (NIM 8B) failed:", e.message);
    }
  }

  // Tier 3: NIM 11B (meta/llama-3.2-11b-vision-instruct) - Timeout: 2s
  if (nvidiaKey) {
    try {
      console.log("[Model Chain Stream] Routing to Tier 3: NIM 11B (Timeout: 2000ms)");
      const url = "https://integrate.api.nvidia.com/v1/chat/completions";
      const requestBody = {
        model: "meta/llama-3.2-11b-vision-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.75,
        max_tokens: 1024,
        stream: true
      };
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nvidiaKey}`,
        'Connection': 'keep-alive'
      };
      return await executeStreamRequest(url, headers, requestBody, 2000, userMessage);
    } catch (e) {
      console.error("[Model Chain Stream] Tier 3 (NIM 70B) failed:", e.message);
    }
  }

  // Fallback: simulated chat response if all fail
  console.warn("[Model Chain Stream] All stream tiers failed, falling back to simulated response.");
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

export async function extractSleepFromMessage(userMessage) {
  const prompt = `You are a helper that extracts sleep details from an unstructured text message.
Message: "${userMessage}"

Identify the sleep hours (number) and sleep quality (one of: "excellent", "good", "poor", "terrible").
If the user's message is vague (e.g. "slept well", "bad sleep", "decent sleep"), you MUST make a reasonable guess:
- "slept well" / "decent night" / "good sleep" -> hours: 7.0, quality: "good"
- "bad sleep" / "woke up twice" / "terrible sleep" -> hours: 5.0, quality: "poor"
- "couldn't sleep" / "insomnia" -> hours: 3.5, quality: "terrible"
- "slept like a baby" / "excellent sleep" -> hours: 8.5, quality: "excellent"

Output a raw JSON object with these exact fields:
{
  "hours": number,
  "quality": "excellent" | "good" | "poor" | "terrible",
  "confidence": "high" | "low",
  "reason": "Brief explanation of how you parsed or guessed the value"
}
Do not return any markdown format, just the raw JSON.`;

  try {
    const res = await queryGemini(prompt, true);
    return res;
  } catch (e) {
    console.error("extractSleepFromMessage failed, fallback applied:", e);
    return { hours: 7.0, quality: "good", confidence: "low", reason: "fallback default" };
  }
}

export async function extractStressFromMessage(userMessage) {
  const prompt = `You are a helper that extracts stress level rating on a scale of 1 to 10 from an unstructured message.
Message: "${userMessage}"

Identify the stress level (1 to 10). 
If the user's message is vague (e.g. "I'm stressed", "I'm okay", "super relaxed", "feeling great"), you MUST make a reasonable guess:
- "super relaxed" / "feeling great" / "calm" -> stress: 2
- "I'm okay" / "average" / "fine" -> stress: 5
- "stressed" / "busy day" / "tired" -> stress: 7
- "extremely stressed" / "panicking" / "overwhelmed" -> stress: 9

Output a raw JSON object with these exact fields:
{
  "stress": number,
  "confidence": "high" | "low",
  "reason": "Brief explanation of how you parsed or guessed the value"
}
Do not return any markdown format, just the raw JSON.`;

  try {
    const res = await queryGemini(prompt, true);
    return res;
  } catch (e) {
    console.error("extractStressFromMessage failed, fallback applied:", e);
    return { stress: 5, confidence: "low", reason: "fallback default" };
  }
}

export async function extractEnergyFromMessage(userMessage) {
  const prompt = `You are a helper that extracts energy level rating on a scale of 1 to 10 from an unstructured message.
Message: "${userMessage}"

Identify the energy level (1 to 10).
If the user's message is vague (e.g. "lots of energy", "tired", "exhausted", "normal"), you MUST make a reasonable guess:
- "exhausted" / "no energy" / "drained" -> energy: 2
- "tired" / "low energy" -> energy: 4
- "normal" / "decent energy" / "okay" -> energy: 6
- "energetic" / "lots of energy" / "hyped" -> energy: 8

Output a raw JSON object with these exact fields:
{
  "energy": number,
  "confidence": "high" | "low",
  "reason": "Brief explanation of how you parsed or guessed the value"
}
Do not return any markdown format, just the raw JSON.`;

  try {
    const res = await queryGemini(prompt, true);
    return res;
  } catch (e) {
    console.error("extractEnergyFromMessage failed, fallback applied:", e);
    return { energy: 5, confidence: "low", reason: "fallback default" };
  }
}

export async function resolveLocationUpdate(userMessage) {
  const prompt = `You are a spatial parsing assistant. The user sent a message trying to update their home or office location:
"${userMessage}"

Identify if they are updating "home", "office", or "both" (or "unknown").
Resolve the neighborhood name and city.
Estimate the approximate coordinates (latitude and longitude) for the neighborhood. For Gurgaon DLF Phase 3 use lat: 28.49, lng: 77.09, for Gurgaon Cyber City use lat: 28.495, lng: 77.089. If it's a different location, estimate their coordinates.

Output a raw JSON object with these exact fields:
{
  "type": "home" | "office" | "both" | "unknown",
  "city": "resolved city name",
  "neighborhood": "resolved neighborhood/landmark name",
  "lat": number,
  "lng": number
}
Do not return any markdown format, just the raw JSON.`;

  try {
    const res = await queryGemini(prompt, true);
    return res;
  } catch (e) {
    console.error("resolveLocationUpdate failed, fallback applied:", e);
    return { type: "unknown", city: "Gurgaon", neighborhood: "Unknown", lat: 28.49, lng: 77.09 };
  }
}

export async function generateSingleContextualAction(db, currentAssumedLocation) {
  const activeGoal = db.profile.active_goal || { category: "Health", subGoal: "Sleep Better" };
  const historySnippet = db.chat_history.slice(-8).map(h => `${h.sender}: ${h.text}`).join('\n');
  const sleepHours = db.context.sleep?.hours || 7;
  const sleepQuality = db.context.sleep?.quality || "good";
  const stress = db.context.mood?.rating || 5;
  const energy = db.context.sleep?.energy || db.context.energies?.mental || 5;
  
  const existingTasks = (db.actions || []).map(a => a.text).join(', ');

  const prompt = `You are AUM, the AI Life Operating System companion.
Your job is to generate exactly ONE highly customized, contextually relevant task to solve a specific physical, cognitive, or emotional problem or situation the user is currently facing in their life.

User Profile:
- Active Goal: ${activeGoal.category} -> ${activeGoal.subGoal}
- Current Assumed Location: ${currentAssumedLocation} (Home: ${db.profile.location_profile?.home_base?.neighborhood}, Office: ${db.profile.location_profile?.work_base?.neighborhood})
- Morning check-in metrics: Sleep: ${sleepHours}h (${sleepQuality}), Stress: ${stress}/10, Energy: ${energy}/10

Recent Chat Conversation (State of mind context):
${historySnippet}

Existing Daily Tasks (Do NOT duplicate these):
${existingTasks}

Your task:
1. Identify the single most pressing physical, cognitive, or emotional problem the user is currently facing based on their recent chat conversation.
2. Design exactly ONE actionable, micro-level physical or mental task to help them solve or recover from this specific situation right now.
3. If their assumed location is Home or Office, and it is a physical/outdoor/social/recovery task, you should suggest a specific landmark or nearby spot (e.g. DLF CyberHub or Aravali Biodiversity Park if in Gurgaon) to make it highly practical.
4. Output the result in this exact JSON schema:
{
  "id": "generate-a-unique-random-id",
  "text": "The actionable task instruction",
  "category": "Recovery" | "Health" | "Execution" | "Joy" | "Connection",
  "difficulty": 1 | 2 | 3,
  "whyToday": "Explanation of how this directly solves their current state of mind and immediate situation.",
  "whyRelevant": "How this aligns with their broader goals and improves tomorrow.",
  "howTo": "2-3 step practical implementation guideline."
}

Do not return any markdown format, just the raw JSON.`;

  try {
    const res = await queryGemini(prompt, true);
    return res;
  } catch (e) {
    console.error("generateSingleContextualAction failed, fallback applied:", e);
    return {
      id: `fallback-${Date.now()}`,
      text: "Take a 5-minute deep breathing break",
      category: "Recovery",
      difficulty: 1,
      whyToday: "To help lower stress and realign your energy.",
      whyRelevant: "Maintains cognitive stamina throughout the day.",
      howTo: "1. Sit comfortably.\n2. Inhale for 4s, hold for 4s, exhale for 4s.\n3. Repeat for 5 cycles."
    };
  }
}

export async function generateCheckinStream(userMessage, stage) {
  const db = await readDB();
  const now = getDbCurrentTime(db);
  const companion = db.profile.companion_name || 'Aarav';

  // Log user message
  db.chat_history.push({
    sender: 'User',
    text: userMessage,
    timestamp: now.toISOString()
  });
  addRawChat(db, 'User', userMessage, now.toISOString());
  await writeDB(db);

  let extractionText = "";
  let nextQuestion = "";
  
  if (stage === 'waiting_for_sleep') {
    const sleepExt = await extractSleepFromMessage(userMessage);
    db.context.sleep = { hours: sleepExt.hours, quality: sleepExt.quality };
    db.context.checkin_stage = 'waiting_for_stress';
    nextQuestion = "Got it. And how is your stress level today on a scale of 1-10?";
    extractionText = `Parsed sleep: ${sleepExt.hours} hours (${sleepExt.quality} quality).`;
  } else if (stage === 'waiting_for_stress') {
    const stressExt = await extractStressFromMessage(userMessage);
    db.context.mood = { rating: stressExt.stress, state: 'clear' };
    db.context.checkin_stage = 'waiting_for_energy';
    nextQuestion = "Understood. And what is your energy level today on a scale of 1 to 10?";
    extractionText = `Parsed stress rating: ${stressExt.stress}/10.`;
  } else if (stage === 'waiting_for_energy') {
    const energyExt = await extractEnergyFromMessage(userMessage);
    const energyVal = energyExt.energy;
    db.context.sleep.energy = energyVal;
    db.context.energies = {
      mental: energyVal,
      physical: energyVal,
      social: energyVal,
      creative: energyVal
    };
    db.context.checkin_stage = 'completed';
    db.context.is_frozen = true;
    db.actions = db.actions.map(act => act.id === "morning-checkin" ? { ...act, status: "done" } : act);
    await writeDB(db);
    
    // Generate daily actions and preserve the morning-checkin done task
    await generateDailyActionsService();
    const latestDb = await readDB();
    const starterTaskDone = {
      id: "morning-checkin",
      text: "Start the Day: Log morning check-in",
      category: "Health",
      difficulty: 1,
      whyToday: "To sync your sleep, energy and stress levels.",
      whyRelevant: "Helps Aarav understand your state of mind to customize your daily moves.",
      howTo: "Send any message in the chat to start your morning check-in.",
      status: "done"
    };
    latestDb.actions = [starterTaskDone, ...latestDb.actions];
    await writeDB(latestDb);

    nextQuestion = "Perfect! Your daily context logs are locked. Let's start the day!";
    extractionText = `Parsed energy rating: ${energyExt.energy}/10.`;
  }

  await writeDB(db);

  const prompt = `You are ${companion}, a quiet, emotionally intelligent companion.
The user is in the middle of their morning check-in.
Current Stage: ${stage}
User Message: "${userMessage}"
System Extracted Data: ${extractionText}
Next Question to Ask: "${nextQuestion}"

Write a warm, quiet, conversational response.
1. Gently acknowledge their response. If they expressed any emotional distress or specific worries, respond to that with warm, quiet validation first.
2. Confirm the parsed metrics in a natural way (e.g. "I've noted down that you slept about 6 hours", "I'll log that stress rating as 8").
3. End by clearly asking the next question: "${nextQuestion}".
4. Keep it concise, 2-3 sentences. Do not use cliché templates like "I hear you". Do not return markdown codeblocks.`;

  try {
    const responseText = await queryGemini(prompt, false);
    
    const freshDb = await readDB();
    freshDb.chat_history.push({
      sender: 'AUM',
      text: responseText,
      timestamp: getDbCurrentTime(freshDb).toISOString()
    });
    addRawChat(freshDb, 'AUM', responseText, getDbCurrentTime(freshDb).toISOString());
    await writeDB(freshDb);

    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${responseText}\n\n`));
        controller.close();
      }
    });
  } catch (e) {
    console.error("Check-in stream generation failed, fallback applied:", e);
    const fallbackText = `${extractionText} ${nextQuestion}`;
    const freshDb = await readDB();
    freshDb.chat_history.push({
      sender: 'AUM',
      text: fallbackText,
      timestamp: getDbCurrentTime(freshDb).toISOString()
    });
    addRawChat(freshDb, 'AUM', fallbackText, getDbCurrentTime(freshDb).toISOString());
    await writeDB(freshDb);

    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${fallbackText}\n\n`));
        controller.close();
      }
    });
  }
}

