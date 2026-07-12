import fs from 'fs/promises';
import path from 'path';
import { readDB, writeDB, addMemory, addChatMessage, getDbCurrentTime, applyMomentumDelta } from './db.js';
import { buildUnifiedContext } from './context_engine.js';
import { analyzeConversation, BEHAVIORAL_SIGNALS } from './behavioral_signals.js';

// Helper to determine if we have a valid Gemini API Key configured
function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('YOUR_GEMINI_API') || key === '') {
    return null;
  }
  return key;
}

// Low-level fetch wrapper to query Gemini REST API
export async function queryGemini(prompt, isJson = false) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("No valid GEMINI_API_KEY configured.");
  }

  const model = "gemini-3.5-flash"; // Excellent speed and context handling
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {}
  };

  if (isJson) {
    requestBody.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
  }

  const result = await response.json();
  try {
    const textOutput = result.candidates[0].content.parts[0].text;
    return isJson ? JSON.parse(textOutput) : textOutput;
  } catch (e) {
    throw new Error("Failed to parse response from Gemini: " + e.message);
  }
}

// Read the tasks library JSON file
async function readTasksLibrary() {
  try {
    const libraryPath = path.join(process.cwd(), 'data', 'tasks_library.json');
    const data = await fs.readFile(libraryPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to read tasks library, using empty list:", error);
    return [];
  }
}

// Selecting 5 balanced tasks from the library based on user level
async function selectLibraryTasks(level) {
  const library = await readTasksLibrary();
  if (library.length === 0) return [];

  // Determine difficulty range based on Level
  let minDiff = 1;
  let maxDiff = 2;
  
  if (level >= 35) {
    minDiff = 4;
    maxDiff = 5;
  } else if (level >= 20) {
    minDiff = 3;
    maxDiff = 4;
  } else if (level >= 10) {
    minDiff = 2;
    maxDiff = 3;
  } else if (level >= 4) {
    minDiff = 1;
    maxDiff = 3;
  }

  const categories = ["Mindset", "Physical", "Relationships", "Work-Life", "Reflection"];
  const selectedTasks = [];

  for (const cat of categories) {
    // Filter tasks by category and difficulty
    let eligible = library.filter(t => t.category === cat && t.difficulty >= minDiff && t.difficulty <= maxDiff);
    
    // Fallback if no tasks match difficulty range
    if (eligible.length === 0) {
      eligible = library.filter(t => t.category === cat);
    }

    if (eligible.length > 0) {
      // Pick a random task in this category
      const randomIndex = Math.floor(Math.random() * eligible.length);
      selectedTasks.push(eligible[randomIndex]);
    }
  }

  return selectedTasks;
}

// FALLBACK SYSTEM: Customizes templates based on profile context when offline
function simulateDailyActions(selectedTasks, profile, context) {
  return selectedTasks.map((task, index) => {
    let text = task.text.replace("Akash", profile.name || "Akash");
    let whyToday = task.defaultWhyToday;
    let whyRelevant = task.defaultWhyRelevant;
    let howTo = task.defaultHowTo;

    // Inject custom details based on daily context state
    if (context.mood && context.mood.rating >= 7) {
      whyToday = `Given today's high stress score of ${context.mood.rating}/10 and feeling "${context.mood.state}", this was selected to immediately down-regulate your nervous system.`;
    } else if (context.sleep && context.sleep.energy <= 4) {
      whyToday = `With your energy logged at ${context.sleep.energy}/10 after ${context.sleep.hours} hrs of sleep, we selected a low-friction adaptation to keep your momentum alive.`;
    } else if (context.environmental && context.environmental.weather === "Rainy") {
      whyToday = `Since it's raining outside today, this serves as a great indoor-friendly option to maintain routine.`;
    } else {
      whyToday = `This fits your current status of feeling ${context.mood?.state || 'clear'} on a ${context.environmental?.day_of_week || 'today'}.`;
    }

    // Inject custom details based on broad context (profile)
    const roleStr = profile.role || profile.job || "working professional";
    const goalStr = profile.goals || profile.goal || "your aspirations";
    const challengeStr = profile.challenges || profile.problem || "your bottlenecks";
    
    if (task.category === "Work-Life") {
      whyRelevant = `As a ${roleStr}, managing the challenge of "${challengeStr}" requires structured energy separation.`;
    } else if (task.category === "Relationships") {
      if (profile.maritalStatus === "Married") {
        whyRelevant = `Nurturing your relationship with your wife is key to balancing professional stress with marital stability.`;
      } else if (profile.kids > 0) {
        whyRelevant = `Being present for your ${profile.kids} kids requires protecting your emotional reserves at the office.`;
      } else {
        whyRelevant = `Cultivating strong relational anchors directly supports your long-term goal of: "${goalStr}".`;
      }
    } else if (task.category === "Mindset" || task.category === "Reflection") {
      whyRelevant = `This helps build the inner freedom and stability needed to resolve your bottleneck: "${challengeStr}".`;
    } else {
      whyRelevant = `Physical health is the foundation for executing your role as a ${roleStr} without late-night burnout.`;
    }

    return {
      id: `act_${index + 1}`,
      text,
      category: task.category,
      difficulty: task.difficulty,
      whyToday,
      whyRelevant,
      howTo,
      status: "todo"
    };
  });
}

// FALLBACK SYSTEM: Simulates companion chat response when offline (e.g. API quota exceeded)
function simulateChatResponse(message, db) {
  const lowerMsg = message.toLowerCase();
  const profile = db.profile || {};
  const context = db.context || {};
  const name = profile.name || "Akash";
  const role = profile.role || "professional";
  const goal = profile.goals || "building stability";
  const stress = context.mood?.rating || 5;
  const momentum = profile.momentum_score || 50;

  // Scan semantic memory for recent office or work topics to follow up
  let workMemoryFollowup = "";
  const recentWorkMemories = (db.semantic_memory || []).filter(m => 
    m.text.toLowerCase().includes("office") || 
    m.text.toLowerCase().includes("work") || 
    m.text.toLowerCase().includes("union")
  );
  if (recentWorkMemories.length > 0) {
    const lastMemory = recentWorkMemories[recentWorkMemories.length - 1];
    workMemoryFollowup = ` I remember you mentioning: "${lastMemory.text}". How did that play out?`;
  }

  // Determine stress-based adaptive peer rules
  const isHighStress = stress >= 7;

  // 0. Detect meta-chat questions
  if (lowerMsg.includes("stuck") || lowerMsg.includes("loop") || lowerMsg.includes("repeat") || lowerMsg.includes("broken") || lowerMsg.includes("same thing") || lowerMsg.includes("offline")) {
    return `Yeah, my brain is running on local backup mode right now because our Gemini API key connection was reset or hit spending limit rules. I might sound a bit repetitive or basic until Next.js is fully re-synchronized, but I'm still tracking your tasks! What's happening?`;
  }

  // 1. Gym & Exercise
  if (lowerMsg.includes("gym") || lowerMsg.includes("exercise") || lowerMsg.includes("workout") || lowerMsg.includes("run") || lowerMsg.includes("training") || lowerMsg.includes("physical")) {
    if (isHighStress) {
      return `Hey ${name}, heading to the gym? Love that. Even though your stress level is high (${stress}/10) right now, physically grounding yourself is a perfect way to release tension. Don't push too hard—just move your body and let the nervous system reset. Let me know how it felt when you're back!`;
    } else {
      return `Heck yes, ${name}! Hit that workout! The weather today is perfect for getting moving. Your momentum is sitting strong at ${momentum}/100—let's stack another win and build that physical grounding. Let's get it!`;
    }
  }

  // 2. Office & Work
  if (lowerMsg.includes("office") || lowerMsg.includes("work") || lowerMsg.includes("manager") || lowerMsg.includes("boss") || lowerMsg.includes("meeting") || lowerMsg.includes("startup") || lowerMsg.includes("masters union")) {
    const followupStr = workMemoryFollowup ? workMemoryFollowup : " Remember to keep your boundaries firm today.";
    if (isHighStress) {
      return `I hear you, ${name}. Work stress is hitting hard today. As a ${role}, you carry a lot of weight.${followupStr} When things get overwhelming, focus strictly on what you can control. Let's make sure we shut down the laptop early. I'm here for you, dude. How can I help you decompress?`;
    } else {
      return `Alright, let's tackle it, ${name}. Being a ${role} at Masters Union means high demands, but you've got this. Your momentum is solid at ${momentum}/100. Let's focus on today's Work-Life action, nail it, and protect your evening. Go crush it!`;
    }
  }

  // 3. Sleep & Fatigue
  if (lowerMsg.includes("sleep") || lowerMsg.includes("tired") || lowerMsg.includes("exhausted") || lowerMsg.includes("fatigue") || lowerMsg.includes("rest") || lowerMsg.includes("burnout")) {
    return `Hey ${name}, I feel you. Your logs show you got ${context.sleep?.hours || 6} hours of sleep. When energy is low, our only job is to protect momentum, not force performance. Let's take it easy tonight. No late-night scrolling. What's one small thing we can drop from the schedule to let you rest?`;
  }

  // 4. Wins & Done
  if (lowerMsg.includes("done") || lowerMsg.includes("completed") || lowerMsg.includes("win") || lowerMsg.includes("finish") || lowerMsg.includes("success")) {
    return `Awesome job, ${name}! That's what building momentum is all about. Stacking these small wins is what shifts your identity. How did it feel to cross that off today?`;
  }

  // 5. Default Adaptive peer replies
  if (isHighStress) {
    const stressGreetings = [
      `Hey ${name}, it sounds like things are feeling pretty heavy right now (Stress: ${stress}/10). I'm in your corner. Let's not worry about being perfect today—just focus on one tiny positive action. Did you check out today's Reflection task? It might help you clear some mental space. How are you holding up?`,
      `Hey ${name}, take a deep breath. With stress at ${stress}/10, you don't need to force productivity. What is one small block we can clear off your plate today to let you decompress?`,
      `Yo ${name}, I see that stress rating (${stress}/10). When things get chaotic, we protect momentum by doing less, not more. Talk to me—how can we simplify your day?`
    ];
    const lastMsgText = db.chat_history && db.chat_history.length > 0 ? db.chat_history[db.chat_history.length - 1].text : "";
    const selected = stressGreetings.find(g => g !== lastMsgText) || stressGreetings[0];
    return selected;
  } else {
    const defaultGreetings = [
      `Hey ${name}! Hope your day is going well. Your rolling momentum is looking great at ${momentum}/100. What's on your mind today? Let's chat about what you're building or what we can optimize!`,
      `Hey ${name}! Momentum is sitting at ${momentum}/100. Let's keep stackin' those small wins today. What are we focusing on?`,
      `Yo ${name}! Just checking in on you. How's today's flow going? What's one thing you want to execute?`
    ];
    const lastMsgText = db.chat_history && db.chat_history.length > 0 ? db.chat_history[db.chat_history.length - 1].text : "";
    const selected = defaultGreetings.find(g => g !== lastMsgText) || defaultGreetings[0];
    return selected;
  }
}

/**
 * Generates the daily 5 momentum actions.
 * Integrates Gemini API to personalize static library templates or falls back to simulation.
 */
export async function generateDailyActionsService() {
  const db = await readDB();
  const apiKey = getApiKey();

  // 1. Build unified context using context_engine
  const { buildUnifiedContext } = await import('./context_engine.js');
  const { getRecommendedInterventions } = await import('./recommendations.js');
  const { getPredictions } = await import('./prediction_engine.js');
  
  const context = buildUnifiedContext(db);

  // 2. Query prediction engine to add predictions to context
  const predictions = getPredictions(db.profile, context, db.history || []);
  context.prediction = predictions;

  // 3. Select recommendations using our local decider pipeline (candidates -> scoring -> constraint -> diversity -> Day Set Simulation)
  const result = getRecommendedInterventions(db.profile, context, db.history || []);
  
  // Save recommendations and backups to DB
  db.actions = result.actions;
  db.backups = result.backups;
  db.profile.total_actions_generated = (db.profile.total_actions_generated || 0) + result.actions.length;
  await writeDB(db);

  if (!apiKey) {
    // Offline simulation mode (already finalized pre-selected actions)
    return result.actions;
  }

  // 4. Query Gemini to personalize and write custom explanations (Answering the 4 Constitution Questions)
  const purpose = db.profile.purpose || { whyItMatters: "", whoBenefits: "", futureBuilding: "" };
  const values = db.profile.core_values || [];

  const prompt = `
You are AUM, the AI Life Operating System for working professionals.
You are generating highly personalized daily momentum explanations for the following 5 pre-selected actions.

User Profile:
- Name: ${db.profile.name}
- Job: ${db.profile.role}
- Active Goal: ${db.profile.active_goal?.category} -> ${db.profile.active_goal?.subGoal}
- Active Chapter: ${db.profile.current_chapter}
- Stated Purpose / Why: ${purpose.whyItMatters} (Benefits: ${purpose.whoBenefits}, Future: ${purpose.futureBuilding})
- Core Values: ${values.join(', ')}
- Current Archetype: ${db.profile.archetype} (Momentum: ${db.profile.momentum_score}/100)

Today's Logged Context:
- Energies: Mental ${context.user_state.energies.mental}/10, Physical ${context.user_state.energies.physical}/10, Social ${context.user_state.energies.social}/10, Creative ${context.user_state.energies.creative}/10
- Mood: Stress rating ${context.user_state.stress}/10
- Environmental: Weather: ${context.environmental.weather}, Seasons: ${context.environmental.seasons.join(', ')}, City: ${db.profile.city}
- World Engine Layers: Commute/Traffic: ${context.environmental.world.traffic}, AQI: ${context.environmental.world.aqi}

Pre-selected Interventions:
${result.actions.map((act, idx) => `Action ${idx + 1}:
  - ID: ${act.id}
  - Text: ${act.text}
  - Category: ${act.category}
  - Difficulty: ${act.difficulty}
  - Why Today (Default): ${act.whyToday}
  - Why Relevant (Default): ${act.whyRelevant}
  - How To (Default): ${act.howTo}`).join('\n\n')}

For each action, customize and rewrite the "text", "whyToday", "whyRelevant", and "howTo" fields.
Your rewritten explanations MUST fulfill the AUM Constitution Rule by confidently answering these 4 questions for the user:
1. Why this person? (Weave in their active goal, life chapter, and core values).
2. Why today? (Directly reference today's weather, weekday, NCR AQI, or active seasonal event like IPL/Salary Week).
3. Why now? (Connect to their logged mental/physical/social/creative energy budget and stress score).
4. Why will this improve tomorrow? (Explain the downstream outcome causality, e.g., how doing this recovery task now reduces tomorrow's burnout and raises tomorrow's momentum).

Anchor explanations emotionally around their purpose: "${purpose.whyItMatters}".

Generate exactly 5 actions in a JSON array matching the schema below.
JSON Output Schema:
[
  {
    "id": "Matching ID",
    "text": "Rewritten clear action instruction",
    "category": "Matching Category",
    "difficulty": Matching Difficulty (number),
    "whyToday": "Answers: Why today? Why now?",
    "whyRelevant": "Answers: Why this person? Why will this improve tomorrow?",
    "howTo": "2-3 step practical implementation guideline."
  }
]
Do not output markdown codeblocks. Return raw JSON.
`;

  try {
    const rawActions = await queryGemini(prompt, true);
    const finalActions = rawActions.map(act => ({
      ...act,
      status: "todo"
    }));
    db.actions = finalActions;
    await writeDB(db);
    return finalActions;
  } catch (error) {
    console.error("Gemini personalization failed, using pre-selected actions:", error);
    return result.actions;
  }
}

/**
 * Generates empathetic companion chat responses.
 */
async function updateCurrentStateSummary(db) {
  const apiKey = getApiKey();
  if (!apiKey) return;
  const recentChats = db.chat_history.slice(-6).map(h => `${h.sender}: ${h.text}`).join('\n');
  const prompt = `
Based on the following recent chats, write a single-sentence "Current State Summary" for the user.
It should be a highly concise, 15-25 word description of their current state, emotional context, and immediate risk.
Example: "Akash is mentally exhausted after a demanding workday but still highly motivated to build AUM. Risk: sacrificing sleep."

Recent Chats:
${recentChats}

Respond ONLY with the single sentence summary. Do not use quotes, markdown formatting, or introductory text.
`;
  try {
    const summary = await queryGemini(prompt, false);
    db.context.current_state_summary = summary.trim();
  } catch (e) {
    console.error("Failed to update current state summary:", e);
  }
}

/**
 * Generates empathetic companion chat responses.
 */
export async function generateChatResponseService(userMessage) {
  let db = await readDB();
  const apiKey = getApiKey();

  // Save the user's message first
  await addChatMessage("User", userMessage);

  if (!apiKey) {
    const response = simulateChatResponse(userMessage, db);
    await addChatMessage("AUM", response);
    return response;
  }

  // Refresh DB to capture saved message
  db = await readDB();

  // Update current state summary and build context
  await updateCurrentStateSummary(db);
  const unifiedContext = buildUnifiedContext(db);
  const currentState = unifiedContext.current_state_object;

  const companionName = db.profile.companion_name || "Aarav";

  // Real Gemini mode
  const prompt = `
You are ${companionName}, a thoughtful, deeply empathetic, and highly intelligent AI companion helping working professionals build, protect, and recover momentum.
You are talking to ${db.profile.name}.

Current State Snapshot:
${JSON.stringify(currentState, null, 2)}

User Background:
- Long-term Vision: ${db.profile.goals}
- Personal Challenges: ${db.profile.challenges}
- Focus Areas: ${db.profile.lifeAreas ? db.profile.lifeAreas.join(', ') : 'General'}
- Archetype: ${db.profile.archetype}

Chat History:
${db.chat_history.slice(-12).map(h => `${h.sender}: ${h.text}`).join('\n')}

User's latest message: "${userMessage}"

Respond as ${companionName}.
Key guidelines:
1. Speak as a co-founder and trusted peer sitting in the same room. Keep it short, punchy, and conversational. Skip formal bot intros/outros.
2. Lens Rule: Your entire response should be filtered through this Current State Summary: "${currentState.current_state_summary}".
3. Keep the response short (under 60 words). Don't try to solve everything immediately unless they ask "What should I do?". If they are just venting, validate and listen.
`;

  try {
    const aiResponse = await queryGemini(prompt, false);
    let finalResponse = aiResponse;

    // Run Conversation Analyzer to extract behavioral signals and update active threads
    const analysis = await analyzeConversation(db, userMessage, aiResponse);
    
    // Apply behavioral signals to momentum score
    if (analysis && Array.isArray(analysis.signals)) {
      analysis.signals.forEach(sigId => {
        const signalDef = BEHAVIORAL_SIGNALS[sigId];
        if (signalDef) {
          applyMomentumDelta(db, signalDef.weight, signalDef.weight >= 0);
        }
      });
      
      db.insights = db.insights || {};
      db.insights.behavioral_insights = db.insights.behavioral_insights || [];
      db.insights.behavioral_insights.push({
        timestamp: getDbCurrentTime(db).toISOString(),
        user_message: userMessage,
        signals: analysis.signals,
        reason: analysis.reason
      });
      if (db.insights.behavioral_insights.length > 50) {
        db.insights.behavioral_insights.shift();
      }
    }

    // Update active threads
    db.profile.active_threads = db.profile.active_threads || [];
    if (analysis && Array.isArray(analysis.threads_to_add)) {
      analysis.threads_to_add.forEach(t => {
        if (!db.profile.active_threads.includes(t)) {
          db.profile.active_threads.push(t);
        }
      });
    }
    if (analysis && Array.isArray(analysis.threads_to_resolve)) {
      db.profile.active_threads = db.profile.active_threads.filter(t => !analysis.threads_to_resolve.includes(t));
    }

    // Check Travel Mode extraction in chat
    if (userMessage.toLowerCase().includes("traveling to") || userMessage.toLowerCase().includes("trip to")) {
      const travelMatch = userMessage.match(/(?:traveling|trip|going) to\s+([A-Za-z]+)/i);
      if (travelMatch && travelMatch[1]) {
        db.profile.location_profile = db.profile.location_profile || {};
        db.profile.location_profile.travel_mode = true;
        db.profile.location_profile.travel_city = travelMatch[1].charAt(0).toUpperCase() + travelMatch[1].slice(1);
      }
    }

    // Handle "Invisible Momentum" reflections
    if (analysis && analysis.invisible_momentum_triggered && analysis.invisible_momentum_message) {
      finalResponse += `\n\n*${analysis.invisible_momentum_message}*`;
    }

    await addChatMessage("AUM", finalResponse);
    await writeDB(db);

    // Asynchronously trigger memory extraction to keep the system learning
    extractAndSaveMemory(userMessage, finalResponse).catch(err => console.error("Memory extraction error:", err));

    return finalResponse;
  } catch (error) {
    console.error("Gemini chat failed, falling back to simulation:", error);
    const response = simulateChatResponse(userMessage, db);
    await addChatMessage("AUM", response);
    return response;
  }
}

/**
 * Generates automated check-ins or celebrations when events occur.
 */
export async function triggerCompanionComment(triggerType, detail) {
  const db = await readDB();
  const apiKey = getApiKey();
  const now = getDbCurrentTime(db);
  
  let prompt = "";
  let fallbackMessage = "";
  
  if (triggerType === 'context_updated') {
    const { oldRating, newRating, state } = detail;
    fallbackMessage = `I noticed your stress level changed to ${newRating}/10 and you are feeling "${state}". That sounds like a lot to navigate, ${db.profile.name}. What's on your mind today? Let's take a breath together.`;
    
    prompt = `
You are AUM, the AI Life Operating System companion.
The user, ${db.profile.name}, who is a ${db.profile.role}, has just updated their daily context.
Their mood rating changed from ${oldRating}/10 to ${newRating}/10, and their feeling state is "${state}".
Write a brief, highly personalized companion check-in comment (under 50 words).
Acknowledge the change warmth, ask a gentle question about what happened, and support them without being preachy.
`;
  } else if (triggerType === 'task_completed') {
    const { taskText, category } = detail;
    fallbackMessage = `Awesome job completing your task: "${taskText}"! Finishing this ${category} action is a powerful vote for the person you want to become, ${db.profile.name}. Keep it up!`;
    
    prompt = `
You are AUM, the AI Life Operating System companion.
The user, ${db.profile.name}, has just completed this task: "${taskText}" (Category: ${category}).
Their rolling Momentum is ${db.profile.momentum_score}/100.
Write a short, highly encouraging companion comment (under 45 words). Mention the task and how it helps their overall consistency or momentum. Keep it warm and personal.
`;
  } else if (triggerType === 'archetype_unlocked') {
    const { archetype } = detail;
    fallbackMessage = `New Archetype Unlocked! You've transitioned to: ${archetype}, ${db.profile.name}! Your behavior is shifting your core identity. Keep walking this path!`;
    
    prompt = `
You are AUM, the AI Life Operating System companion.
The user, ${db.profile.name}, has unlocked a new Identity Archetype: ${archetype}!
Write a warm, celebratory companion message (under 55 words). Express pride in their behavioral shifts and identity growth.
`;
  }

  let finalMessage = fallbackMessage;
  if (apiKey && prompt !== "") {
    try {
      finalMessage = await queryGemini(prompt, false);
    } catch (e) {
      console.error("Gemini companion comment failed, using fallback:", e);
    }
  }

  db.chat_history.push({
    sender: "AUM",
    text: finalMessage,
    timestamp: now.toISOString()
  });

  await writeDB(db);
  return finalMessage;
}

// Service to parse text check-in stories into estimated creation/consumption minutes
export async function parseCheckinStoryService(creationStory, consumptionStory) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      creation_minutes: creationStory ? 45 : 0,
      consumption_minutes: consumptionStory ? 60 : 0
    };
  }

  const prompt = `
You are AUM's daily story check-in parser.
Analyze these two text responses from the user's daily check-in:
Creation Story: "${creationStory || ''}" (What did you create today?)
Consumption Story: "${consumptionStory || ''}" (What pulled your attention today?)

Estimate the total time spent in minutes on each of these two categories based on their description.
If they mention specific times (e.g. "I coded for 2 hours", "Watched Reels for 45 mins"), map them exactly. If they describe it generally (e.g. "Just a quick run", "Binge-watched Netflix all evening"), estimate a realistic time (e.g. 20 mins for a quick run, 150 mins for binge-watching).

Output format:
{
  "creation_minutes": estimated_number_of_minutes_creation,
  "consumption_minutes": estimated_number_of_minutes_consumption
}
Do not output markdown codeblocks. Return raw JSON.
`;

  try {
    const result = await queryGemini(prompt, true);
    return {
      creation_minutes: parseInt(result.creation_minutes) || 0,
      consumption_minutes: parseInt(result.consumption_minutes) || 0
    };
  } catch (e) {
    console.error("Gemini story parsing failed, using defaults:", e);
    return {
      creation_minutes: creationStory ? 45 : 0,
      consumption_minutes: consumptionStory ? 60 : 0
    };
  }
}

/**
 * Extracts key patterns or goals from the interaction to save in semantic memory.
 */
async function extractAndSaveMemory(userMessage, aiResponse) {
  const apiKey = getApiKey();
  if (!apiKey) return;

  const prompt = `
Analyze this short conversation turn between user and AI.
User: "${userMessage}"
AI: "${aiResponse}"

We want to extract two types of structured data:
1. Behavioral patterns, triggers, goals, preferences (Declarative Memory).
2. Major life events or milestones (e.g., "Mother is sick", "Got promoted", "New baby born", "Relocated to Gurgaon").

Output format:
{
  "memories": [
    {
      "text": "Extracted memory text",
      "category": "One of: pattern, goal, insight, preference"
    }
  ],
  "life_events": [
    {
      "text": "Name of event",
      "type": "One of: Career Shift, Family Illness, Relocation, Milestone, Child born",
      "status": "active"
    }
  ]
}
Return raw JSON without markdown.
`;

  try {
    const result = await queryGemini(prompt, true);
    const db = await readDB();
    
    // Save memories
    if (Array.isArray(result.memories) && result.memories.length > 0) {
      db.semantic_memory = db.semantic_memory || [];
      result.memories.forEach(m => {
        const id = `m${db.semantic_memory.length + 1}`;
        db.semantic_memory.push({
          id,
          text: m.text,
          category: m.category,
          date: getDbCurrentTime(db).toISOString().split('T')[0]
        });
      });
    }

    // Save life events
    if (Array.isArray(result.life_events) && result.life_events.length > 0) {
      db.profile.life_timeline = db.profile.life_timeline || [];
      result.life_events.forEach(e => {
        db.profile.life_timeline.push({
          text: e.text,
          type: e.type,
          status: e.status,
          date: getDbCurrentTime(db).toISOString().split('T')[0]
        });
      });
    }

    await writeDB(db);
  } catch (err) {
    console.log("Memory extraction failed", err);
  }
}

// SERVICE: Generates a matching companion name of the same cultural origin and warm tone.
export async function generateCompanionNameService(userName) {
  const firstName = userName.split(' ')[0];
  const firstLetter = firstName.charAt(0).toUpperCase();
  const apiKey = getApiKey();

  if (apiKey) {
    try {
      const prompt = `Given the user first name "${firstName}", generate a matching companion name. The companion name MUST:
1. Be of the same cultural origin/ethnicity (e.g. Indian/Hindi for Indian names like Akash, Western/English for Western names like Sarah).
2. Have a similar length and syllable structure if possible.
3. Sound authentic, warm, and friendly.
4. Return ONLY the name itself, capitalized, with no punctuation or explanation.`;
      const response = await queryGemini(prompt, false);
      const cleanName = response.trim().replace(/[^\w]/g, '');
      if (cleanName && cleanName.length > 1) {
        return cleanName;
      }
    } catch (e) {
      console.error("Gemini companion naming failed, using offline fallback:", e);
    }
  }

  // Robust alphabetical fallback map
  const fallbacks = {
    'A': 'Aarav', 'B': 'Balin', 'C': 'Chetan', 'D': 'Dev', 'E': 'Eshwar',
    'F': 'Farhan', 'G': 'Gautam', 'H': 'Hari', 'I': 'Ishan', 'J': 'Jai',
    'K': 'Karan', 'L': 'Laksh', 'M': 'Manav', 'N': 'Naman', 'O': 'Ojas',
    'P': 'Pranav', 'Q': 'Qasim', 'R': 'Rohan', 'S': 'Samar', 'T': 'Tanay',
    'U': 'Uday', 'V': 'Vihaan', 'W': 'Wasim', 'X': 'Xavier', 'Y': 'Yash', 'Z': 'Zayn'
  };

  return fallbacks[firstLetter] || 'Mitra';
}
