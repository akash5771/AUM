/**
 * Summary Engine Service
 * Generates daily summaries representing Layer 2 memory, including emotional trajectory,
 * key decisions, and active threads from yesterday's conversation logs.
 */

import { queryGemini } from '../groq.js';

export async function generateDailySummary(db, rawChats, yesterdayDateStr, queryGeminiFn = queryGemini) {
  if (!rawChats || rawChats.length === 0) {
    return {
      date: yesterdayDateStr,
      summary: "No conversation logged.",
      emotion: "Neutral",
      decisions: [],
      active_threads: []
    };
  }

  const rawChatsText = rawChats.map(c => `${c.sender}: ${c.text}`).join('\n');

  const prompt = `
You are AUM's Daily Memory Compression Engine.
Review the following conversation transcript from yesterday (${yesterdayDateStr}).
Generate a structured daily summary including user struggles, accomplishments, emotional state trajectory, decisions made, and active threads discussed.

Conversation Transcript:
${rawChatsText}

Respond strictly with a JSON object formatted as:
{
  "summary": "Concise 1-2 sentence behavioral summary of what they did, struggled with, or discussed.",
  "emotion": "E.g., Started frustrated, ended optimistic.",
  "decisions": ["Freeze architecture", "Improve recommendation engine"],
  "active_threads": ["AUM MVP", "Weight Loss"]
}
`;

  try {
    const result = await queryGeminiFn(prompt, true);
    return {
      date: yesterdayDateStr,
      summary: result.summary || "Conversation completed.",
      emotion: result.emotion || "Clear",
      decisions: result.decisions || [],
      active_threads: result.active_threads || []
    };
  } catch (e) {
    console.error("Daily summary generation failed, falling back:", e);
    return {
      date: yesterdayDateStr,
      summary: "Yesterday was a stable day focused on building routine.",
      emotion: "Stable",
      decisions: [],
      active_threads: []
    };
  }
}

export async function generateEpochSummary(db, rawChats, queryGeminiFn = queryGemini) {
  if (!rawChats || rawChats.length === 0) return null;
  const rawChatsText = rawChats.map(c => `${c.sender}: ${c.text}`).join('\n');
  
  const prompt = `
You are AUM's Chat Segment Episodic Memory Compression Engine.
Review the following recent chat segment.
Your job is to:
1. Summarize key actions, accomplishments, user struggles, and context.
2. Detect any "Big Events" (high salience).
3. Identify key decisions made.
4. List people/entities involved.

A "Big Event" (high salience) is defined as:
- Conflict or friction (arguments, disputes, workplace issues).
- Significant decisions (changing goals, quitting/starting habits, refactoring projects).
- Milestones or breakthroughs (realizations, landed job, completed project).
- Deep vulnerability or venting (stress, grief, seeking recovery support).
- Habit/routine failure patterns.

Chat segment:
${rawChatsText}

Respond strictly with a JSON object formatted as:
{
  "summary": "1-2 sentence behavioral summary of what they did, struggled with, or discussed.",
  "salience": "high",
  "decisions": ["Freeze architecture"],
  "people": ["Monu", "Boss"],
  "active_threads": ["AUM MVP"]
}
`;
  try {
    const result = await queryGeminiFn(prompt, true);
    return {
      summary: result.summary || "Segment completed.",
      salience: result.salience || "low",
      decisions: result.decisions || [],
      people: result.people || [],
      active_threads: result.active_threads || []
    };
  } catch (e) {
    console.error("Epoch summary generation failed:", e);
    return null;
  }
}
