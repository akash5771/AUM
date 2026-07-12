/**
 * Day Transition Service for AUM
 * Orchestrates daily reset, memory compression, statistical reflections,
 * identity evolution timeline updates, and dynamic momentum score updates.
 */

import { computeStatisticalInsights } from './statistics.js';

// Fallback simulator for day transition chat summaries
function simulateTransitionSummary(yesterdayLogs) {
  return "Yesterday was a stable day focused on building routine; you managed screen time well and locked in a breathing session.";
}

/**
 * Main coordinator for the 6 AM day transition
 */
export async function orchestrateDayTransition(db, queryGeminiFn) {
  const profile = db.profile || {};
  const context = db.context || {};
  const actions = db.actions || [];
  
  // 1. Calculate Checklist execution for yesterday
  const totalActions = actions.length;
  const completedCount = actions.filter(a => a.status === 'done').length;
  const skippedCount = actions.filter(a => a.status === 'skipped').length;
  const missedCount = totalActions - completedCount - skippedCount;
  
  // 2. Add uncompleted actions to the failure repository
  db.profile.failure_repository = db.profile.failure_repository || [];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = db.virtual_time ? new Date(db.virtual_time) : new Date();
  const dayOfWeek = days[now.getDay()];
  
  let timeOfDay = "Morning";
  const hours = now.getHours();
  if (hours >= 12 && hours < 17) timeOfDay = "Afternoon";
  else if (hours >= 17 && hours < 21) timeOfDay = "Evening";
  else if (hours >= 21 || hours < 5) timeOfDay = "Night";

  actions.forEach(act => {
    if (act.status !== 'done') {
      db.profile.failure_repository.push({
        day_of_week: dayOfWeek,
        time_of_day: timeOfDay,
        category: act.category,
        intervention_id: act.id,
        date: now.toISOString().split('T')[0]
      });
    }
  });

  // Limit Failure Repository to last 50 matches to keep DB size small
  if (db.profile.failure_repository.length > 50) {
    db.profile.failure_repository = db.profile.failure_repository.slice(-50);
  }

  // 3. Compute Momentum Debt accrual, payoff, and decay
  const prevMomentum = profile.momentum_score || 50;
  const consumptionMinutes = context.consumption_minutes || 0;
  const creationMinutes = context.creation_minutes || 0;
  const sleepHours = context.sleep?.hours || 7;
  const stress = context.mood?.rating || 5;

  // Accrual
  let debtAccrued = 0;
  if (sleepHours < 6.0) debtAccrued += 3.0;
  if (consumptionMinutes >= 120) debtAccrued += 2.0;
  if (completedCount === 0) debtAccrued += 4.0;

  profile.momentum_debt = (profile.momentum_debt || 0) + debtAccrued;

  // Payoff (Good day check: completed >= 3, sleep >= 7.5, stress < 5)
  const isGoodDay = (completedCount >= 3) && (sleepHours >= 7.5) && (stress < 5);
  if (isGoodDay) {
    profile.momentum_debt = Math.max(0, profile.momentum_debt - 5.0);
  }

  // Apply decay to momentum score based on current debt (debt * 0.25)
  let decay = 0;
  if (profile.momentum_debt > 0) {
    decay = profile.momentum_debt * 0.25;
    // Clamp maximum decay per day to 5.0 to avoid catastrophic crashes
    decay = Math.min(5.0, decay);
  }

  const finalMomentum = Math.min(100, Math.max(0, prevMomentum - decay));
  profile.momentum_score = Math.round(finalMomentum);
  
  // Reset daily accumulator
  profile.momentum_earned_today = 0;

  // 4. Determine North Star Metric: Intentional Day %
  // Intentional day definition: user completed at least 3 tasks aligned with their core values/goals and reels < 120m
  const isIntentional = (completedCount >= 3) && (consumptionMinutes < 120);
  if (isIntentional) {
    profile.intentional_days_count = (profile.intentional_days_count || 0) + 1;
  }
  
  let stats = [];
  db.history = db.history || [];
  const completedCategories = actions.filter(a => a.status === 'done').map(a => a.category);

  const yesterdayLog = {
    date: context.last_logged || now.toISOString().split('T')[0],
    sleep_hours: sleepHours,
    sleep_quality: context.sleep?.quality || 'good',
    energy: context.sleep?.energy || 7,
    stress: stress,
    consumption_minutes: consumptionMinutes,
    creation_minutes: creationMinutes,
    tasks_completed: completedCount,
    tasks_total: totalActions,
    categories_completed: completedCategories,
    intentional: isIntentional
  };

  db.history.push(yesterdayLog);
  if (db.history.length > 90) {
    db.history.shift(); // Capped 90 days
  }

  const totalDays = db.history.length;
  const intentionalDays = db.history.filter(h => h.intentional).length;
  profile.intentional_days_rate = totalDays > 0 ? Math.round((intentionalDays / totalDays) * 100) : 0;

  // 5. Memory Engine: Run the Consolidator (Layer 2 summaries, Layer 3 structured facts/threads/goals, Layer 5 Behavioral DNA, Layer 6 Life Timeline, Layer 7 Outcomes, and TTL)
  try {
    const { consolidateDailyMemory } = await import('./memory_engine/consolidator.js');
    await consolidateDailyMemory(db, actions, context, yesterdayLog.date, queryGeminiFn);
  } catch (err) {
    console.error("Failed to run next-gen memory consolidation:", err);
  }

  // 7. Reflection Engine (Statistical correlations - every 3 days)
  if (db.history.length % 3 === 0) {
    stats = computeStatisticalInsights(db.history);
    if (stats.length > 0 && queryGeminiFn) {
      const insightsPrompt = `
You are AUM's Reflection Engine.
Translate the following raw statistical correlation findings into warm, highly insightful natural language sentences for the user's dashboard (under 40 words each).
Help the user connect their habits with their emotional stress.

Raw Findings:
${stats.map(s => `- ${s.rawText}`).join('\n')}

Format your output as a raw JSON array of strings:
[
  "First insightful observation sentence",
  "Second insightful observation sentence"
]
Do not output markdown blocks. Return raw JSON.
`;
      try {
        const insightsList = await queryGeminiFn(insightsPrompt, true);
        if (Array.isArray(insightsList)) {
          db.insights = db.insights || {};
          db.insights.behavioral_insights = insightsList;
        }
      } catch (e) {
        console.error("Reflection engine explanation failed:", e);
      }
    }
  }

  // 8. 6-Dimensional Identity Engine sub-scores & archetype mapping
  profile.sub_scores = profile.sub_scores || { recovery: 50, execution: 50, connection: 50, curiosity: 50, courage: 50, consistency: 50 };
  
  // Recovery: 7-day average of (10 - stress) * 10
  const recentStress = db.history.slice(-7).map(h => h.stress || 5);
  const avgStressVal = recentStress.length > 0 ? recentStress.reduce((a,b)=>a+b,0)/recentStress.length : 5;
  profile.sub_scores.recovery = Math.round((10 - avgStressVal) * 10);

  // Execution: 7-day average task completion rate
  const recentCompletions = db.history.slice(-7).map(h => h.tasks_total > 0 ? h.tasks_completed / h.tasks_total : 0.5);
  const avgCompletion = recentCompletions.length > 0 ? recentCompletions.reduce((a,b)=>a+b,0)/recentCompletions.length : 0.5;
  profile.sub_scores.execution = Math.round(avgCompletion * 100);

  // Connection: completion of Social tasks in past 7 days
  const recentSocialCompletions = db.history.slice(-7).filter(h => h.categories_completed?.includes("Social")).length;
  profile.sub_scores.connection = Math.min(100, Math.round((recentSocialCompletions / 3) * 100)); // normalized to 3 social actions/week

  // Curiosity: completion of Learning/Adventure tasks in past 7 days
  const recentCuriosityCompletions = db.history.slice(-7).filter(h => h.categories_completed?.includes("Learning") || h.categories_completed?.includes("Adventure")).length;
  profile.sub_scores.curiosity = Math.min(100, Math.round((recentCuriosityCompletions / 3) * 100));

  // Courage: completion of difficulty >= 4 tasks in past 7 days
  const recentCourageLogs = db.history.slice(-7).filter(h => h.tasks_completed > 0); // simplifier for MVP
  profile.sub_scores.courage = Math.min(100, Math.round((profile.momentum_score * 0.8) + (profile.sub_scores.execution * 0.2)));

  // Consistency: streak calculation
  const streak = db.profile.streak || 0;
  profile.sub_scores.consistency = Math.min(100, Math.round(streak * 10 + 20));

  // Archetype Matrix mapping
  const recovery = profile.sub_scores.recovery;
  const execution = profile.sub_scores.execution;
  const connection = profile.sub_scores.connection;
  const consistency = profile.sub_scores.consistency;

  if (execution > 75 && consistency > 75 && recovery < 40) {
    profile.archetype = "The Burnout Builder";
  } else if (recovery > 70 && execution < 40) {
    profile.archetype = "The Relaxed Stabilizer";
  } else if (connection > 70 && recovery > 70 && execution > 50) {
    profile.archetype = "The Mindful Anchor";
  } else if (connection > 75 && execution > 75 && recovery > 75) {
    profile.archetype = "The Grounded Performer";
  } else {
    profile.archetype = "The Rebuilder";
  }

  // 9. Reset daily context
  db.context = {
    ...db.context,
    is_frozen: false,
    last_logged: "",
    creation_story: "",
    consumption_story: "",
    creation_minutes: 0,
    consumption_minutes: 0,
    energies: {
      mental: 7,
      physical: 7,
      social: 7,
      creative: 7
    },
    mood: {
      rating: 5,
      state: "clear"
    },
    sleep: {
      hours: 7.0,
      quality: "good"
    }
  };

  // 10. Generate Empathetic Day Transition notification comment
  let aumMessage = "";
  if (completedCount === totalActions && totalActions > 0) {
    aumMessage = `Akash, what a phenomenal showing yesterday! Ticking off all ${completedCount} actions has pushed your rolling Momentum to ${profile.momentum_score}/100. We logged this day as highly Intentional. Let's keep this momentum blazing today!`;
  } else if (completedCount > 0) {
    aumMessage = `Good morning, Akash. Yesterday we locked in ${completedCount} actions. Your rolling Momentum is stable at ${profile.momentum_score}/100. Today, tell me: what did you create, and how can we support your energy buffers?`;
  } else {
    aumMessage = `Good morning, Akash. Yesterday was a challenging day where we couldn't complete our checklist. That is completely okay—recovery is part of momentum. Your rolling Momentum sits at ${profile.momentum_score}/100. Let's focus on a single small win to start!`;
  }

  db.chat_history.push({
    sender: "AUM",
    text: aumMessage,
    timestamp: now.toISOString()
  });

  return {
    momentum_score: profile.momentum_score,
    archetype: profile.archetype,
    intentional: isIntentional,
    insights_generated: stats.length > 0
  };
}
