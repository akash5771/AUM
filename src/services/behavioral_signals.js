/**
 * Behavioral Signals and Conversation Analyzer Service for AUM
 * Responsible for extracting behavioral signals from chat messages and mapping them to momentum deltas
 */

import { queryGemini } from './gemini.js';

export const BEHAVIORAL_SIGNALS = {
  // --- Positive Signals ---
  // Courage Momentum (Large increase: +2.0 to +3.5)
  "showed_courage": { weight: 3.0, type: "Courage", label: "Showed Courage" },
  "asked_for_help": { weight: 2.0, type: "Courage", label: "Asked for Help" },
  "quitting_toxic_habit": { weight: 3.5, type: "Courage", label: "Quitting Toxic Habit" },
  "public_speaking": { weight: 2.5, type: "Courage", label: "Public Speaking" },
  "set_boundaries": { weight: 2.5, type: "Courage", label: "Set Boundaries" },
  "handled_conflict": { weight: 3.0, type: "Courage", label: "Handled Conflict" },

  // Recovery Momentum (Increase: +1.5 to +2.5)
  "didnt_spiral": { weight: 2.5, type: "Recovery", label: "Didn't Spiral After Failure" },
  "took_rest": { weight: 1.5, type: "Recovery", label: "Took Rest Instead of Burnout" },
  "managed_emotions": { weight: 2.0, type: "Recovery", label: "Managed Emotions" },
  "emotional_regulation": { weight: 2.0, type: "Recovery", label: "Emotional Regulation" },

  // Learning Momentum (Increase: +1.0 to +1.5)
  "learned_skill": { weight: 1.5, type: "Learning", label: "Learned Skill" },
  "read_book": { weight: 1.0, type: "Learning", label: "Read Book" },
  "understood_concept": { weight: 1.0, type: "Learning", label: "Understood Concept" },

  // Contribution Momentum (Increase: +1.2 to +2.2)
  "helped_someone": { weight: 2.2, type: "Contribution", label: "Helped Someone" },
  "mentored_colleague": { weight: 2.0, type: "Contribution", label: "Mentored a Colleague" },
  "cooked_for_family": { weight: 1.5, type: "Contribution", label: "Cooked for Family" },
  "practiced_gratitude": { weight: 1.2, type: "Contribution", label: "Practiced Gratitude" },
  "showed_empathy": { weight: 1.5, type: "Contribution", label: "Showed Empathy" },

  // Reflection Momentum (Increase: +0.8 to +1.5)
  "self_reflection": { weight: 0.8, type: "Reflection", label: "Self-Reflection" },
  "self_awareness": { weight: 1.0, type: "Reflection", label: "Self-Awareness" },
  "planned_ahead": { weight: 1.2, type: "Reflection", label: "Planned Ahead" },
  "created_something": { weight: 1.5, type: "Reflection", label: "Created Something" },
  "took_initiative": { weight: 1.5, type: "Reflection", label: "Took Initiative" },

  // Identity Momentum (Small increase: +0.5 to +1.0)
  "disciplined_identity": { weight: 1.0, type: "Identity", label: "Disciplined Identity" },
  "positive_self_concept": { weight: 0.8, type: "Identity", label: "Positive Self-Concept" },

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
 * Analyzes a conversation turn to extract behavioral signals and track active threads
 * @param {Object} db - The user's database
 * @param {string} userMessage - The user's last message
 * @param {string} aiResponse - Aarav's response
 * @returns {Object} { signals: Array, reason: string, confidence: number, active_threads_updates: Object, invisible_momentum: Object }
 */
export async function analyzeConversation(db, userMessage, aiResponse) {
  const profile = db.profile || {};
  const currentThreads = profile.active_threads || [];
  
  const prompt = `
You are AUM's behavioral analytics engine. Your job is to extract structured behavioral signals, detect changes in active life threads, and identify milestone moments of personal growth from the user's latest conversation with their companion.

Allowed Behavioral Signals (choose from this list ONLY if explicitly evidenced in the text):
Positive Signals:
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
- disciplined_identity / positive_self_concept: Affirming healthy discipline, shift in self-view (e.g. "I think I'm becoming more disciplined").

Negative Signals:
- avoidance: Procrastinating, escaping tasks, hiding from friction.
- catastrophizing: Imagining worst case scenarios unchecked.
- rumination: Constantly chewing over past mistakes or stress.
- emotional_eating: Eating due to stress or exhaustion.
- doomscrolling: Bingeing social media, late night scrolling.
- isolation: Shutting down, avoiding relationships or family.
- self_criticism: Harsh negative self-talk.

Active Life Threads context:
Current ongoing threads: ${JSON.stringify(currentThreads)}
Analyze if the conversation introduces a new thread, resolves/updates an existing thread, or is unrelated.

Invisible Momentum:
Detect if the user has a "breakthrough" moment where they did something that represents a massive milestone compared to their old self (e.g., three months ago they would have avoided a conflict, but today they faced it calmly). If so, output a warm, highly-motivating invisible reflection comment under 30 words starting with "I noticed something important today...".

Latest Conversation:
User: "${userMessage}"
Aarav (AI Companion): "${aiResponse}"

Respond strictly with a JSON object formatted as:
{
  "signals": ["signal_id_1", "signal_id_2"],
  "reason": "Detailed, concise reason explaining the behavioral signal extraction.",
  "confidence": 0.0 to 1.0,
  "threads_to_add": ["New Thread Name"],
  "threads_to_resolve": ["Old Thread Name"],
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
      threads_to_add: [],
      threads_to_resolve: [],
      invisible_momentum_triggered: false
    };
  }
}
