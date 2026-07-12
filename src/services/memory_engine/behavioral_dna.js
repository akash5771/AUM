/**
 * Behavioral DNA Service
 * Manates Layer 5 Behavioral DNA. Dynamically updates patterns (burnout triggers,
 * motivation styles, etc.) based on historical logs and outcomes.
 */

import { getBehavioralDna, getOutcomeMemory } from './memory_db.js';

export async function updateBehavioralDna(db, queryGeminiFn) {
  const dna = getBehavioralDna(db);
  const outcomes = getOutcomeMemory(db);
  const history = db.history || [];

  // Deterministic rule-based triggers
  // 1. Sleep trigger check
  const badSleepDays = history.filter(h => h.sleep_hours < 6.0 && h.stress > 6);
  if (badSleepDays.length >= 2) {
    dna.burnout_trigger = "Sleep <6 hours";
  }

  // 2. High workload/consumption checks
  const screenSaturatedDays = history.filter(h => h.consumption_minutes >= 120 && h.stress > 6);
  if (screenSaturatedDays.length >= 3) {
    dna.common_failure = "Late Night Scrolling / Screen Over-saturation";
  }

  // Fallback defaults if they don't exist
  if (!dna.motivation_style) dna.motivation_style = "Purpose & Clear Downstream Impact";
  if (!dna.favorite_recovery) dna.favorite_recovery = "Slow walk or nature breathing";
  if (!dna.best_time_to_work) dna.best_time_to_work = "Morning";

  // Use LLM to refine Behavioral DNA every 7 transitions
  if (queryGeminiFn && history.length > 0 && history.length % 7 === 0) {
    const prompt = `
You are AUM's Behavioral DNA Engine.
Analyze the user's past habit history and outcome logs to identify patterns, triggers, and preferences.

History Logs:
${JSON.stringify(history.slice(-14), null, 2)}

Existing DNA:
${JSON.stringify(dna, null, 2)}

Identify and update the fields:
- best_time_to_work
- burnout_trigger
- motivation_style
- favorite_recovery
- common_failure

Respond strictly with a JSON object containing the updated fields:
{
  "best_time_to_work": "...",
  "burnout_trigger": "...",
  "motivation_style": "...",
  "favorite_recovery": "...",
  "common_failure": "..."
}
`;
    try {
      const refined = await queryGeminiFn(prompt, true);
      Object.assign(dna, refined);
    } catch (e) {
      console.error("Failed to run LLM behavioral DNA update, keeping current:", e);
    }
  }

  db.memory.behavioral_dna = dna;
  db.profile.behavioral_dna = {
    ...db.profile.behavioral_dna,
    ...dna
  };
}
