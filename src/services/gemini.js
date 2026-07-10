import fs from 'fs/promises';
import path from 'path';
import { readDB, writeDB, addMemory, addChatMessage, getDbCurrentTime } from './db.js';

// Helper to determine if we have a valid Gemini API Key configured
function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('YOUR_GEMINI_API') || key === '') {
    return null;
  }
  return key;
}

// Low-level fetch wrapper to query Gemini REST API
async function queryGemini(prompt, isJson = false) {
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

// FALLBACK SYSTEM: Simulates companion chat response when offline
function simulateChatResponse(message, history, profile, context) {
  const lowerMsg = message.toLowerCase();
  const name = profile.name || "Akash";
  const role = profile.role || profile.job || "professional";
  const goal = profile.goals || profile.goal || "building stability";
  const challenge = profile.challenges || profile.problem || "work stress";
  const status = profile.maritalStatus || "Single";
  const kids = parseInt(profile.kids) || 0;
  
  if (lowerMsg.includes("stress") || lowerMsg.includes("setback") || lowerMsg.includes("anxious") || lowerMsg.includes("reputation") || lowerMsg.includes("office") || lowerMsg.includes("colleague") || lowerMsg.includes("manager") || lowerMsg.includes("tl") || lowerMsg.includes("board")) {
    let familyNote = "";
    if (status === "Married") {
      familyNote = " Between tricky relationship dynamics with your wife and unstable demands at work, it's a lot to manage.";
    }
    return `I hear you, ${name}. Navigating that conflict at the office and feeling anxious about your reputation is incredibly heavy, especially when you're striving for an executive path as a ${role}.${familyNote} 

But remember your long-term goal: "${goal}". You want to build inner freedom so the external environment doesn't dictate your state of mind. Setbacks happen to everyone. What if we treat today as a recovery day? Let's take a deep breath. Have you looked at today's Mindset action? Focus on that small 5-minute breathing session to reset. How does that feel?`;
  }
  
  if (lowerMsg.includes("tired") || lowerMsg.includes("sleep") || lowerMsg.includes("exhaust") || lowerMsg.includes("fatigue") || lowerMsg.includes("energy")) {
    return `I completely understand, ${name}. Your logs show an energy level of ${context.sleep.energy}/10 and ${context.sleep.hours} hours of sleep. When energy is low, our only goal is to *protect* momentum, not force performance. Let's make sure we shut down work laptops early today. Let's let your nervous system recover. How can we support that boundary tonight?`;
  }
  
  if (lowerMsg.includes("done") || lowerMsg.includes("completed") || lowerMsg.includes("win") || lowerMsg.includes("finished")) {
    return `That is fantastic, ${name}! Completing a task builds your identity, vote by vote, toward a person of high stability. Your progress has been updated (+20 XP). How did it feel to step away and make that happen?`;
  }

  return `Thanks for reflecting with me, ${name}. Navigating your goals as a ${role} while carrying responsibilities (including your family and ${kids} kids) is a journey. I'm keeping track of your goal: "${goal}". Tell me more about what's occupying your thoughts right now, and let's find a small step forward together.`;
}

/**
 * Generates the daily 5 momentum actions.
 * Integrates Gemini API to personalize static library templates or falls back to simulation.
 */
export async function generateDailyActionsService() {
  const db = await readDB();
  const apiKey = getApiKey();
  const level = db.profile.level || 0;

  // 1. Select the base 5 tasks from our library
  const selectedLibraryTasks = await selectLibraryTasks(level);

  if (!apiKey) {
    // Offline simulation mode
    return simulateDailyActions(selectedLibraryTasks, db.profile, db.context);
  }

  const historySummary = db.history && db.history.length > 0
    ? db.history.slice(-90).map(h => `- Date: ${h.date}, Sleep: ${h.sleep_hours} hrs (${h.sleep_quality}), Stress: ${h.stress}/10, Weather: ${h.weather}, Completed: ${h.tasks_completed}/${h.tasks_total}`).join('\n')
    : "No historical logged data yet.";

  // Real Gemini mode: Customize the selected library templates
  const prompt = `
You are AUM, the AI Life Operating System for working professionals.
You are generating exactly 5 personalized daily momentum actions for the user based on templates selected from our library.

User Profile:
- Name: ${db.profile.name}
- Age: ${db.profile.age}
- Role/Job: ${db.profile.role}
- Family: Marital Status: ${db.profile.maritalStatus}, Kids: ${db.profile.kids}
- Long-term Goal: ${db.profile.goals}
- Core Bottleneck/Problem: ${db.profile.challenges}
- Focus Areas: ${db.profile.lifeAreas ? db.profile.lifeAreas.join(', ') : 'General'}
- Current Archetype: ${db.profile.archetype} (Level ${level})

Today's Logged Context:
- Sleep: ${db.context.sleep.hours} hours, Quality: ${db.context.sleep.quality}, Energy: ${db.context.sleep.energy}/10
- Mood: Rating: ${db.context.mood.rating}/10, State: ${db.context.mood.state}
- Environmental: Weather: ${db.context.environmental.weather}, Day: ${db.context.environmental.day_of_week}, Time: ${db.context.environmental.time}

Recent Semantic Memory Insights:
${db.semantic_memory.map(m => `- [${m.category}] ${m.text}`).join('\n')}

Recent Chat Companion Conversation:
${db.chat_history.slice(-8).map(h => `${h.sender}: ${h.text}`).join('\n')}

3-Month Context & Consistency Ledger:
${historySummary}

Selected Library Templates (Base Tasks):
${selectedLibraryTasks.map((t, idx) => `Template ${idx + 1}:
  - ID: ${t.id}
  - Text: ${t.text}
  - Category: ${t.category}
  - Difficulty: ${t.difficulty}
  - Default Why Today: ${t.defaultWhyToday}
  - Default Why Relevant: ${t.defaultWhyRelevant}
  - Default How To: ${t.defaultHowTo}`).join('\n\n')}

Generate exactly 5 actions in a JSON array matching the schema below.
For each action, customize and rewrite the "text", "whyToday", "whyRelevant", and "howTo" fields to be deeply specific to this user's profile, goals, stressors, family setup, and recent context.
CRITICAL: Actively read the recent chat companion conversation history and the 3-Month Consistency Ledger. If they frequently skip tasks in a specific category or show a pattern of low momentum when sleep is Poor or stress is high, adapt the difficulty and howTo steps. If they recently expressed feeling anxious, work stress, conflicts, or fatigue, customize the actions to directly address those specific occurrences. Clearly explain in the "whyToday" and "whyRelevant" fields why they are receiving this task today and how it links directly to their emotional state or expressed situations.

JSON Output Schema:
[
  {
    "id": "Matching Template ID (e.g. lib_mindset_1_1)",
    "text": "Rewritten task instruction, clear, short and actionable",
    "category": "Matching Template Category",
    "difficulty": Matching Template Difficulty (number),
    "whyToday": "Tailored sentence explaining why this specific intervention is critical given today's logged mood, sleep, stress, or weather.",
    "whyRelevant": "Tailored sentence explaining how this connects to their specific goals (e.g. inner freedom), job/role, or family situation.",
    "howTo": "2-3 step practical implementation guideline."
  }
]

Do not output markdown codeblocks. Return raw JSON.
`;

  try {
    const rawActions = await queryGemini(prompt, true);
    return rawActions.map(act => ({
      ...act,
      status: "todo"
    }));
  } catch (error) {
    console.error("Gemini failed, falling back to simulated actions:", error);
    return simulateDailyActions(selectedLibraryTasks, db.profile, db.context);
  }
}

/**
 * Generates empathetic companion chat responses.
 */
export async function generateChatResponseService(userMessage) {
  const db = await readDB();
  const apiKey = getApiKey();

  // Save the user's message first
  await addChatMessage("User", userMessage);

  if (!apiKey) {
    const response = simulateChatResponse(userMessage, db.chat_history, db.profile, db.context);
    await addChatMessage("AUM", response);
    return response;
  }

  // Real Gemini mode
  const prompt = `
You are AUM, a thoughtful, deeply empathetic, and highly intelligent AI companion helping working professionals build, protect, and recover momentum.
You are chatting with ${db.profile.name}, who is a ${db.profile.role}.

User Background:
- Family: Marital Status: ${db.profile.maritalStatus}, Kids: ${db.profile.kids}
- Working Days: ${db.profile.workDays} days/week, Working Hours: ${db.profile.workHours} hrs/day
- Long-term Vision: ${db.profile.goals}
- Personal Challenges: ${db.profile.challenges}
- Focus Areas: ${db.profile.lifeAreas ? db.profile.lifeAreas.join(', ') : 'General'}
- Current Level: Level ${db.profile.level} (XP: ${db.profile.xp}/100), Streak: ${db.profile.streak} days
- Archetype: ${db.profile.archetype}

Logged Context Today:
- Sleep: ${db.context.sleep.hours} hrs, Quality: ${db.context.sleep.quality}, Energy: ${db.context.sleep.energy}/10
- Mood state: ${db.context.mood.state} (Rating: ${db.context.mood.rating}/10)
- Environmental: Weather: ${db.context.environmental.weather}, Day: ${db.context.environmental.day_of_week}

Daily Actions:
${db.actions.map(a => `- [${a.status}] ${a.text} (${a.category})`).join('\n')}

Retrieved Semantic Memory / Historical Patterns:
${db.semantic_memory.map(m => `- ${m.text}`).join('\n')}

3-Month Context & Consistency Ledger:
${db.history && db.history.length > 0 ? db.history.slice(-90).map(h => `- Date: ${h.date}, Sleep: ${h.sleep_hours} hrs, Stress: ${h.stress}/10, Completed: ${h.tasks_completed}/${h.tasks_total}`).join('\n') : "No historical logged data yet."}

Chat History:
${db.chat_history.slice(-8).map(h => `${h.sender}: ${h.text}`).join('\n')}

User's latest message: "${userMessage}"

Respond as AUM.
Key guidelines:
1. Speak as a trusted companion and close friend—warm, empathetic, and authentic.
2. Avoid generic platitudes. Directly reference their goals, work constraints, relationship details, or past insights when relevant.
3. Keep the response concise and conversational (under 100-120 words).
4. If they share a struggle, offer immediate validation. If they share a win, celebrate it genuinely.
5. Reference patterns from their 3-Month Consistency Ledger if they are relevant to what they are sharing. Emphasize their long-term growth and consistency trends to help them build resilience.
`;

  try {
    const aiResponse = await queryGemini(prompt, false);
    await addChatMessage("AUM", aiResponse);

    // Asynchronously trigger memory extraction to keep the system learning
    extractAndSaveMemory(userMessage, aiResponse).catch(err => console.error("Memory extraction error:", err));

    return aiResponse;
  } catch (error) {
    console.error("Gemini chat failed, falling back to simulation:", error);
    const response = simulateChatResponse(userMessage, db.chat_history, db.profile, db.context);
    await addChatMessage("AUM", response);
    return response;
  }
}

/**
 * Generates automated check-ins or celebrations when events occur (completion, context logs, level-up).
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
Acknowledge the change in stress/mood warmly, ask a gentle question about what happened, and support them without being preachy.
`;
  } else if (triggerType === 'task_completed') {
    const { taskText, category } = detail;
    fallbackMessage = `Awesome job completing your task: "${taskText}"! Finishing this ${category} action is a powerful vote for the person you want to become, ${db.profile.name}. Keep it up!`;
    
    prompt = `
You are AUM, the AI Life Operating System companion.
The user, ${db.profile.name}, has just completed this task: "${taskText}" (Category: ${category}).
Their current level is ${db.profile.level} (${db.profile.xp} XP).
Write a short, highly encouraging companion comment (under 45 words). Mention the task and how it helps their overall consistency or momentum. Keep it warm and personal.
`;
  } else if (triggerType === 'level_up') {
    const { level } = detail;
    fallbackMessage = `Level Up! You've reached Level ${level}, ${db.profile.name}! That is an incredible milestone. Your consistent efforts are paying off. Let's celebrate this achievement!`;
    
    prompt = `
You are AUM, the AI Life Operating System companion.
The user, ${db.profile.name}, has just leveled up to Level ${level}!
Write a warm, celebratory companion message (under 55 words). Express pride in their consistency and milestones, and encourage them to continue building this momentum.
`;
  }

  let finalMessage = fallbackMessage;
  if (apiKey) {
    try {
      finalMessage = await queryGemini(prompt, false);
    } catch (e) {
      console.error("Gemini companion comment failed, using fallback:", e);
    }
  }

  // Save AUM's message to chat history
  db.chat_history.push({
    sender: "AUM",
    text: finalMessage,
    timestamp: now.toISOString()
  });
  
  // Reset level up pending flag if that was the trigger
  if (triggerType === 'level_up') {
    db.profile.level_up_celebration_pending = false;
  }

  await writeDB(db);
  return finalMessage;
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

If the user reveals a new key behavior pattern, habit trigger, personal goal, preference, or structural shift in their life, extract it into a short declarative statement (e.g., "User struggles with late-night snack triggers when sleep is under 6 hours" or "User decided to allocate Saturday mornings for family walks").
If nothing notable is revealed, return an empty JSON array.

Output format:
[
  {
    "text": "Extracted declarative memory text",
    "category": "One of: pattern, goal, insight, preference"
  }
]
Return raw JSON without markdown blocks.
`;

  try {
    const extracted = await queryGemini(prompt, true);
    if (Array.isArray(extracted) && extracted.length > 0) {
      for (const item of extracted) {
        await addMemory(item.text, item.category);
      }
    }
  } catch (err) {
    // Fail silently in background
    console.log("Memory extraction failed", err);
  }
}
