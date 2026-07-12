/**
 * Growth Signals Service for AUM
 * Responsible for extracting growth signals from chat messages and mapping them to momentum deltas
 */

import { queryGemini } from './groq.js';

export const GROWTH_SIGNALS = {
  // --- Courage (Large increase: +2.0 to +3.5) ---
  "showed_courage": { weight: 3.0, type: "Courage", label: "Showed Courage" },
  "asked_for_help": { weight: 2.0, type: "Courage", label: "Asked for Help" },
  "quitting_toxic_habit": { weight: 3.5, type: "Courage", label: "Quitting Toxic Habit" },
  "public_speaking": { weight: 2.5, type: "Courage", label: "Public Speaking" },
  "set_boundaries": { weight: 2.5, type: "Courage", label: "Set Boundaries" },
  "handled_conflict": { weight: 3.0, type: "Courage", label: "Handled Conflict" },

  // --- Recovery (Increase: +1.5 to +2.5) ---
  "didnt_spiral": { weight: 2.5, type: "Recovery", label: "Didn't Spiral After Failure" },
  "took_rest": { weight: 1.5, type: "Recovery", label: "Took Rest Instead of Burnout" },
  "managed_emotions": { weight: 2.0, type: "Recovery", label: "Managed Emotions" },
  "emotional_regulation": { weight: 2.0, type: "Recovery", label: "Emotional Regulation" },

  // --- Learning (Increase: +1.0 to +1.5) ---
  "learned_skill": { weight: 1.5, type: "Learning", label: "Learned Skill" },
  "read_book": { weight: 1.0, type: "Learning", label: "Read Book" },
  "understood_concept": { weight: 1.0, type: "Learning", label: "Understood Concept" },

  // --- Contribution (Increase: +1.2 to +2.2) ---
  "helped_someone": { weight: 2.2, type: "Contribution", label: "Helped Someone" },
  "mentored_colleague": { weight: 2.0, type: "Contribution", label: "Mentored a Colleague" },
  "cooked_for_family": { weight: 1.5, type: "Contribution", label: "Cooked for Family" },
  "practiced_gratitude": { weight: 1.2, type: "Contribution", label: "Practiced Gratitude" },
  "showed_empathy": { weight: 1.5, type: "Contribution", label: "Showed Empathy" },

  // --- Reflection (Increase: +0.8 to +1.5) ---
  "self_reflection": { weight: 0.8, type: "Reflection", label: "Self-Reflection" },
  "self_awareness": { weight: 1.0, type: "Reflection", label: "Self-Awareness" },
  "planned_ahead": { weight: 1.2, type: "Reflection", label: "Planned Ahead" },
  "created_something": { weight: 1.5, type: "Reflection", label: "Created Something" },
  "took_initiative": { weight: 1.5, type: "Reflection", label: "Took Initiative" },

  // --- Curiosity ---
  "curiosity_exploration": { weight: 1.2, type: "Curiosity", label: "Curiosity & Exploration" },

  // --- Negative Signals ---
  "avoidance": { weight: -1.5, type: "Negative", label: "Avoidance" },
  "catastrophizing": { weight: -2.0, type: "Negative", label: "Catastrophizing" },
  "rumination": { weight: -1.2, type: "Negative", label: "Rumination" },
  "emotional_eating": { weight: -2.5, type: "Negative", label: "Emotional Eating" },
  "doomscrolling": { weight: -2.0, type: "Negative", label: "Doomscrolling" },
  "isolation": { weight: -1.8, type: "Negative", label: "Isolation" },
  "self_criticism": { weight: -1.0, type: "Negative", label: "Self-Criticism" }
};

/**
 * Analyzes a conversation turn to extract growth signals and entity clues for the Thread Manager
 * @param {Object} db - The user's database
 * @param {string} userMessage - The user's last message
 * @param {string} aiResponse - Aarav's response
 * @returns {Object} { signals: Array, reason: string, confidence: number, extracted_entities: Array, resolve_intent: Array, invisible_momentum: Object }
 */
export async function analyzeConversation(db, userMessage, aiResponse) {
  const profile = db.profile || {};
  
  const prompt = `
You are AUM's behavioral analytics engine. Your job is to extract structured growth signals, detect entities (topics) for active threads, and identify milestone moments of personal growth.

Allowed Growth Signals (choose from this list ONLY if explicitly evidenced in the text):
- showed_courage: Difficult conversations, facing fears, trying new hard things.
- asked_for_help: Reaching out to others for assistance, vulnerability.
- quitting_toxic_habit: Resisting/stopping unhealthy habits.
- public_speaking: Speaking in front of others or publishing.
- set_boundaries: Saying no to work/people, protecting space.
- handled_conflict: Dealing with interpersonal friction calmly.
- didnt_spiral: Not failing catastrophically after a setback.
- took_rest: Resting instead of burning out, protecting sleep/buffers.
- managed_emotions / emotional_regulation: Regulating mood or stress.
- learned_skill / read_book / understood_concept: Gaining knowledge or skills.
- helped_someone / mentored_colleague / cooked_for_family / practiced_gratitude / showed_empathy: Prosocial contribution or connection.
- self_reflection / self_awareness / planned_ahead / created_something / took_initiative: Inner awareness, proactiveness.
- curiosity_exploration: Active exploration of new areas.

Negative Signals:
- avoidance: Procrastinating, escaping tasks, hiding from friction.
- catastrophizing: Imagining worst case scenarios unchecked.
- rumination: Constantly chewing over past mistakes or stress.
- emotional_eating: Eating due to stress or exhaustion.
- doomscrolling: Bingeing social media, late night scrolling.
- isolation: Shutting down, avoiding relationships or family.
- self_criticism: Harsh negative self-talk.

Thread Entity Detection:
Extract 1-2 major ongoing challenges, goals, or life contexts mentioned (e.g. "Work conflict", "Sleep routines", "Fat Loss").
Determine if the user's message indicates they have resolved or finished a topic.

Invisible Momentum:
Detect if the user has a "breakthrough" moment where they did something that represents a massive milestone compared to their old self (e.g., three months ago they would have avoided a conflict, but today they faced it calmly). If so, output a warm, highly-motivating invisible reflection comment under 30 words starting with "I noticed something important today...".

Latest Conversation:
User: "${userMessage}"
Aarav (AI Companion): "${aiResponse}"

Respond strictly with a JSON object formatted as:
{
  "signals": ["signal_id_1", "signal_id_2"],
  "reason": "Detailed, concise reason explaining the growth signal extraction.",
  "confidence": 0.0 to 1.0,
  "extracted_entities": ["Topic Name"],
  "resolve_intent": ["Topic Name to Close"],
  "invisible_momentum_triggered": true/false,
  "invisible_momentum_message": "I noticed something important today..." (only if triggered)
}
`;

  try {
    const analysis = await queryGemini(prompt, true);
    return analysis;
  } catch (error) {
    console.error("Behavioral analysis failed:", error);
    return {
      signals: [],
      reason: "Analysis failed or timed out",
      confidence: 0,
      extracted_entities: [],
      resolve_intent: [],
      invisible_momentum_triggered: false
    };
  }
}
