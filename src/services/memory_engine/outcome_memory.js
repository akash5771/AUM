/**
 * Outcome Memory Service
 * Manages Layer 7 Outcome Memory. Records intervention outcome logs
 * (stress changes, energy changes, completion rates) to build diagnostic data.
 */

import { getOutcomeMemory } from './memory_db.js';

export function recordInterventionOutcomes(db, yesterdayActions, yesterdayContext, dateStr) {
  const outcomes = getOutcomeMemory(db);
  const date = dateStr || new Date().toISOString().split('T')[0];

  const stressAfter = yesterdayContext.mood?.rating || 5;
  const sleepEnergy = yesterdayContext.sleep?.energy || 7;

  yesterdayActions.forEach(act => {
    // Avoid duplicate records for the same action on the same day
    const exists = outcomes.some(o => o.task === act.text && o.date === date);
    if (exists) return;

    outcomes.push({
      task: act.text,
      completed: act.status === 'done',
      stress_before: 5, // baseline fallback
      stress_after: stressAfter,
      energy_before: 5,
      energy_after: sleepEnergy,
      enjoyment: act.status === 'done' ? 6 : 0,
      date: date
    });
  });

  db.memory.outcome_memory = outcomes;

  // Sync to db.profile.intervention_memory for compatibility
  db.profile.intervention_memory = outcomes.map(o => ({
    actionId: o.task,
    completed: o.completed,
    outcome: o.completed ? 'completed' : 'skipped',
    stress_delta: o.stress_before - o.stress_after,
    date: o.date
  }));
}
