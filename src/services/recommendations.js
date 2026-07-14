/**
 * Recommendation Engine service for AUM
 * Contains the Interventions Knowledge Base, Local Places Database,
 * and the expected-value expected utility decider pipeline.
 */

import fs from 'fs';
import path from 'path';

// Load and normalize task library dynamically
let tasksLibrary = [];
try {
  const libraryPath = path.join(process.cwd(), 'data', 'tasks_library.json');
  const rawLib = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
  tasksLibrary = rawLib.map(t => {
    // Map friction_score -> friction, impact_score -> impact
    return {
      ...t,
      friction: t.friction_score !== undefined ? t.friction_score : t.friction,
      impact: t.impact_score !== undefined ? t.impact_score : t.impact,
      // Provide defaults for missing engine fields
      minimum_readiness: t.minimum_readiness !== undefined ? t.minimum_readiness : (t.difficulty ? Math.max(1, t.difficulty - 1) : 1),
      maximum_readiness: t.maximum_readiness !== undefined ? t.maximum_readiness : 10,
      cost_score: t.cost_score !== undefined ? t.cost_score : 0,
      restricted_values: t.restricted_values || [],
      weather_restricted: t.weather_restricted !== undefined ? t.weather_restricted : false,
      requires_day_off: t.requires_day_off !== undefined ? t.requires_day_off : false,
      applicable_days: t.applicable_days || [],
      applicable_times: t.applicable_times || ["Morning", "Afternoon", "Evening", "Night"],
      repeat_interval: t.repeat_interval !== undefined ? t.repeat_interval : 1
    };
  });
} catch (error) {
  console.error('Failed to read tasks library, using fallback empty list:', error);
}

export const INTERVENTIONS_KB = tasksLibrary;

// --- 2. Local Places Database ---
export const LOCAL_PLACES_DB = [
  // Gurgaon
  { city: "Gurgaon", name: "Aravali Biodiversity Park walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Gurgaon", name: "Tau Devi Lal Park jog", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Gurgaon", name: "Leisure Valley Park stroll", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Gurgaon", name: "Bahrisons Booksellers Galleria", category: "Adventure", cost: "cheap", weather_restricted: false },
  { city: "Gurgaon", name: "Quill and Canvas Bookstore South Point Mall", category: "Adventure", cost: "cheap", weather_restricted: false },

  // Bangalore
  { city: "Bangalore", name: "Cubbon Park nature walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Bangalore", name: "Lalbagh Botanical Garden walk", category: "Adventure", cost: "cheap", weather_restricted: true },
  { city: "Bangalore", name: "Blossom Book House Church Street", category: "Adventure", cost: "cheap", weather_restricted: false },
  { city: "Bangalore", name: "Bookworm Church Street", category: "Adventure", cost: "cheap", weather_restricted: false },

  // Ballia
  { city: "Ballia", name: "Surha Taal Lake walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Ballia", name: "Bhrigu Mandir library", category: "Learning", cost: "free", weather_restricted: false },
  { city: "Ballia", name: "Ganga River Ghat walk", category: "Adventure", cost: "free", weather_restricted: true },

  // Mumbai
  { city: "Mumbai", name: "Marine Drive walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Mumbai", name: "Sanjay Gandhi National Park", category: "Adventure", cost: "cheap", weather_restricted: true },
  { city: "Mumbai", name: "Kitab Khana Bookstore Fort", category: "Adventure", cost: "cheap", weather_restricted: false },

  // Delhi
  { city: "Delhi", name: "Lodhi Gardens Walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Delhi", name: "Sunder Nursery Park", category: "Adventure", cost: "cheap", weather_restricted: true },
  { city: "Delhi", name: "Bahrisons Booksellers Khan Market", category: "Adventure", cost: "cheap", weather_restricted: false }
];

// --- 3. Dynamic Readiness Score Calculator ---
export function calculateReadinessScore(db) {
  const context = db.context || {};
  const profile = db.profile || {};
  
  // 1. Sleep term (20%)
  const sleepHours = context.sleep?.hours || 7;
  const sleepQuality = context.sleep?.quality || "good";
  let sleepVal = (sleepHours / 8) * 1.5;
  if (sleepQuality === "excellent") sleepVal += 0.5;
  else if (sleepQuality === "good") sleepVal += 0.2;
  else if (sleepQuality === "poor") sleepVal -= 0.5;
  else if (sleepQuality === "terrible") sleepVal -= 1.0;
  const sleepScore = Math.max(0, Math.min(2.0, sleepVal));

  // 2. Stress term (20%)
  const stress = context.mood?.rating || 5;
  const stressScore = Math.max(0, Math.min(2.0, (10 - stress) * 0.2));

  // 3. Energy term (20%)
  const energies = context.energies || { mental: 7, physical: 7, social: 7, creative: 7 };
  const avgEnergy = (energies.mental + energies.physical + energies.social + energies.creative) / 4;
  const energyScore = Math.max(0, Math.min(2.0, avgEnergy * 0.2));

  // 4. Momentum term (20%)
  const momentum = profile.momentum_score || 50;
  const momentumScore = Math.max(0, Math.min(2.0, momentum * 0.02));

  // 5. Yesterday's Completion Rate (20%)
  let yesterdayCompletion = profile.completion_rate / 100;
  if (Array.isArray(db.history) && db.history.length > 0) {
    const lastDay = db.history[db.history.length - 1];
    if (lastDay.tasks_total > 0) {
      yesterdayCompletion = lastDay.tasks_completed / lastDay.tasks_total;
    }
  }
  const yesterdayScore = Math.max(0, Math.min(2.0, yesterdayCompletion * 2.0));

  // Sum terms (base out of 10)
  let rawReadiness = (sleepScore + stressScore + energyScore + momentumScore + yesterdayScore) * 5; // normalize to 10 scale

  // Apply active timeline event penalties
  const activeTimeline = (profile.life_timeline || []).filter(e => e.status === 'active');
  const hasIllness = activeTimeline.some(e => e.type === 'Family Illness' || e.text?.toLowerCase().includes("illness") || e.text?.toLowerCase().includes("sick"));
  const hasTravel = activeTimeline.some(e => e.type === 'Relocation' || e.text?.toLowerCase().includes("travel") || e.text?.toLowerCase().includes("trip"));
  
  if (hasIllness) rawReadiness -= 2.0;
  if (hasTravel) rawReadiness -= 1.5;

  // Weather penalty
  if (context.environmental?.weather === "Rainy") {
    rawReadiness -= 0.5;
  }

  const finalReadiness = Math.min(10, Math.max(1, Math.round(rawReadiness)));
  profile.readiness_score = finalReadiness;
  return finalReadiness;
}

// --- 4. Dynamic Momentum Stage Evaluator ---
export function determineMomentumStage(db) {
  const profile = db.profile || {};
  const history = db.history || [];
  
  let avgCompletion = profile.completion_rate / 100;
  let avgMomentum = profile.momentum_score || 50;

  if (history.length >= 3) {
    const recent = history.slice(-7);
    const sumC = recent.reduce((acc, h) => acc + (h.tasks_total > 0 ? h.tasks_completed / h.tasks_total : 0.5), 0);
    const sumM = recent.reduce((acc, h) => acc + (h.momentum_score || 50), 0);
    avgCompletion = sumC / recent.length;
    avgMomentum = sumM / recent.length;
  }

  let calculatedStage = "Stage 1: Activation";
  if (avgCompletion > 0.85 && avgMomentum > 80) {
    calculatedStage = "Stage 4: Expansion";
  } else if (avgCompletion > 0.80 && avgMomentum > 70) {
    calculatedStage = "Stage 3: Growth";
  } else if (avgCompletion > 0.75 && avgMomentum > 55) {
    calculatedStage = "Stage 2: Consistency";
  }

  // Demotion Check (Last 3 days check)
  const previousStage = profile.momentum_stage || "Stage 1: Activation";
  if (history.length >= 3) {
    const last3 = history.slice(-3);
    const avgM3 = last3.reduce((acc, h) => acc + (h.momentum_score || 50), 0) / 3;
    
    if (previousStage === "Stage 4: Expansion" && avgM3 < 80) {
      calculatedStage = "Stage 3: Growth";
    } else if (previousStage === "Stage 3: Growth" && avgM3 < 70) {
      calculatedStage = "Stage 2: Consistency";
    } else if (previousStage === "Stage 2: Consistency" && avgM3 < 55) {
      calculatedStage = "Stage 1: Activation";
    }
  }

  profile.momentum_stage = calculatedStage;
  return calculatedStage;
}

// --- 5. Candidate Generator (Hard filter) ---
export function generateCandidates(db, context, coreValues, stage, readiness) {
  const weather = context.environmental?.weather || "Clear";
  const aqi = context.environmental?.world?.aqi || 80;
  const dayOfWeek = context.temporal?.day_of_week || "Monday";
  const timeOfDay = context.temporal?.time_of_day || "Morning";
  const financialStance = context.user_state?.financial_stance || "balanced";

  // Map stage to max friction allowed
  let maxFriction = 2;
  if (stage === "Stage 4: Expansion") maxFriction = 10;
  else if (stage === "Stage 3: Growth") maxFriction = 7;
  else if (stage === "Stage 2: Consistency") maxFriction = 4;

  return INTERVENTIONS_KB.filter(task => {
    // 1. Friction boundary check (Momentum Stages)
    if (task.friction > maxFriction) return false;

    // 2. Readiness Bounds check
    const minR = task.minimum_readiness || 1;
    const maxR = task.maximum_readiness || 10;
    if (readiness < minR || readiness > maxR) return false;

    // 3. Financial check
    if (financialStance === "saving_aggressively" && task.cost_score === 2) return false;

    // 4. Core Values checks
    if (task.restricted_values && task.restricted_values.some(val => coreValues.includes(val))) return false;

    // 5. Weather checks
    if (task.weather_restricted && weather === "Rainy") return false;

    // 6. AQI checks
    if (task.weather_restricted && aqi > 200) return false;

    // 7. Action Windows
    // requires_day_off check
    if (task.requires_day_off && !context.temporal?.is_weekend) return false;
    
    // Day of week check
    if (task.applicable_days && task.applicable_days.length > 0) {
      if (!task.applicable_days.includes(dayOfWeek)) return false;
    }

    // Time of day check
    if (task.applicable_times && task.applicable_times.length > 0) {
      if (!task.applicable_times.includes(timeOfDay)) return false;
    }

    return true;
  });
}

// --- 6. Explanation Engine Helper ---
export function generateExplanationTag(task, context, db) {
  const stress = context.user_state?.stress || 5;
  const sleepHours = context.user_state?.sleep?.hours || 7;
  const aqi = context.environmental?.world?.aqi || 80;
  
  // Look up history for climbing stress patterns
  let isStressClimbing = false;
  const history = db.history || [];
  if (history.length >= 3) {
    const h1 = history[history.length - 1].stress || 5;
    const h2 = history[history.length - 2].stress || 5;
    const h3 = history[history.length - 3].stress || 5;
    if (h1 > h2 && h2 > h3) {
      isStressClimbing = true;
    }
  }

  if (stress >= 7 && (task.category === "Recovery" || task.category === "Joy" || task.category === "Spiritual")) {
    if (isStressClimbing) {
      return "Because your stress has been climbing for three days.";
    }
    return "Because your stress is currently high and we need to calm your nervous system.";
  }

  if (sleepHours < 6.5 && (task.category === "Recovery" || task.category === "Joy" || task.category === "Spiritual")) {
    return "Because protecting your sleep is the highest leverage recovery today.";
  }

  if (task.weather_restricted && aqi > 150) {
    return "Replaced with an indoor adaptation to protect you from the critical NCR air quality.";
  }

  const subGoal = context.user_state?.active_goal?.subGoal || "Sleep Better";
  if (task.applicable_goals && task.applicable_goals.includes(subGoal)) {
    return `To build consistent progress towards your focus: "${subGoal}".`;
  }

  return "Selected to sustain positive momentum without overloading your energy buffer.";
}

// --- 7. EV Scoring Pipeline (AUM's First Law) ---
export function scoreCandidates(candidates, context, profile, db, readiness) {
  const ledger = profile.intervention_memory || [];
  const rejectionLedger = profile.rejection_ledger || [];
  const recTimestamps = profile.last_recommended_timestamps || {};
  const timeOfDay = context.temporal?.time_of_day || "Morning";
  
  return candidates.map(task => {
    // 1. Completion Probability Score (Sigmoid-weighted base)
    // Base centered at 0.9. Penalty for friction. Bonus for readiness.
    let baseProb = 0.9;
    
    // Friction penalty
    baseProb -= (task.friction - 1) * 0.08;
    
    // Readiness boost
    baseProb += (readiness - 5) * 0.04;

    // Commute friendly boost (if Morning or Evening)
    if (task.commute_friendly && (timeOfDay === "Morning" || timeOfDay === "Evening")) {
      baseProb += 0.1;
    }

    // 2. Preference Score (completed vs rejected history)
    const completedCount = ledger.filter(l => l.actionId === task.id && l.completed).length;
    const rejectedCount = rejectionLedger.filter(r => r.actionId === task.id).length;
    
    let preferenceScore = 1.0;
    if (rejectedCount >= 8) {
      preferenceScore = 0.0; // Block completely
    } else if (completedCount > 0 || rejectedCount > 0) {
      preferenceScore = completedCount / (completedCount + rejectedCount + 1);
    }

    // 3. Novelty Score (checks last recommended timestamp vs repeat interval)
    let noveltyScore = 1.0;
    const lastRecIso = recTimestamps[task.id];
    if (lastRecIso) {
      const lastRecDate = new Date(lastRecIso);
      const diffMs = new Date(context.temporal.timestamp) - lastRecDate;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      if (diffDays < task.repeat_interval) {
        // scale down novelty score
        noveltyScore = Math.max(0.1, diffDays / task.repeat_interval);
      }
    } else {
      noveltyScore = 1.25; // Novelty boost
    }

    // Compute Probability
    let finalProb = Math.min(0.98, Math.max(0.05, baseProb * preferenceScore * noveltyScore));

    // 4. Expected Value (Impact * Probability * momentum_multiplier)
    const ev = task.impact * finalProb * (task.momentum_multiplier || 1.0);

    return {
      task,
      probability: finalProb,
      ev
    };
  }).filter(c => c.ev > 0);
}

// --- 8. Diversity Engine & Day Set Simulation ---
export function simulateAndChooseDaySet(scoredCandidates, context, count) {
  // Sort candidates by EV score
  const sorted = [...scoredCandidates].sort((a, b) => b.ev - a.ev);
  
  if (sorted.length < count) {
    return {
      selected: sorted.map(s => s.task),
      backups: []
    };
  }

  // Pick top N candidates with category diversity constraint: no more than 2 tasks from the same category
  const selectedSet = [];
  const categoryCounts = {};

  for (const candidate of sorted) {
    if (selectedSet.length >= count) break;
    const cat = candidate.task.category || "Uncategorized";
    const currentCount = categoryCounts[cat] || 0;
    if (currentCount < 2) {
      selectedSet.push(candidate.task);
      categoryCounts[cat] = currentCount + 1;
    }
  }

  // Fallback to top remaining regardless of category if selectedSet count is insufficient
  if (selectedSet.length < count) {
    const selectedIds = selectedSet.map(s => s.id);
    for (const candidate of sorted) {
      if (selectedSet.length >= count) break;
      if (!selectedIds.includes(candidate.task.id)) {
        selectedSet.push(candidate.task);
      }
    }
  }
  
  // Pick 2 backups from remaining candidates
  const selectedIds = selectedSet.map(s => s.id);
  const remaining = sorted.filter(s => !selectedIds.includes(s.task.id));
  const backups = remaining.slice(0, 2).map(s => s.task);

  return {
    selected: selectedSet,
    backups
  };
}

// --- 9. Check and Swap Blocked Actions ---
export function checkAndSwapBlockedActions(db, context) {
  const activeActions = db.actions || [];
  const backups = db.backups || [];
  
  if (activeActions.length === 0 || backups.length === 0) return { actions: activeActions, swapped: false };

  const weather = context.environmental?.weather || "Clear";
  const aqi = context.environmental?.world?.aqi || 80;
  
  let swappedOccurred = false;
  const updatedActions = activeActions.map(act => {
    if (act.status !== 'todo') return act;

    const kbTask = INTERVENTIONS_KB.find(k => k.id === act.id);
    if (!kbTask) return act;

    const weatherViolated = kbTask.weather_restricted && weather === "Rainy";
    const aqiViolated = kbTask.weather_restricted && aqi > 200;

    if (weatherViolated || aqiViolated) {
      const availableBackup = backups.shift();
      if (availableBackup) {
        swappedOccurred = true;
        
        let text = availableBackup.text;
        const city = db.profile?.city || "Gurgaon";
        const localSpot = LOCAL_PLACES_DB.find(p => p.city === city && p.category === availableBackup.category);
        if (localSpot && text.includes("local")) {
          text = text.replace("local park or biodiversity trail", `${localSpot.name} in ${city}`);
          text = text.replace("local bookstore", `${localSpot.name} in ${city}`);
        }

        return {
          id: availableBackup.id,
          text: text,
          category: availableBackup.category,
          difficulty: availableBackup.difficulty,
          whyToday: `Adapted: Replaced outdoor task because weather became ${weather} / AQI became ${aqi}.`,
          whyRelevant: availableBackup.defaultWhyRelevant || "Sustaining momentum by shifting indoors.",
          howTo: availableBackup.defaultHowTo || "Complete this alternative task.",
          status: "todo",
          adapted: true
        };
      }
    }

    return act;
  });

  return {
    actions: updatedActions,
    backups,
    swapped: swappedOccurred
  };
}

// --- 10. Inject Local Place Names ---
export function injectLocalPlaceNames(actions, city) {
  return actions.map(act => {
    let text = act.text;
    const localSpot = LOCAL_PLACES_DB.find(p => p.city === city && p.category === act.category);
    if (localSpot && text.includes("local")) {
      text = text.replace("local park or biodiversity trail", `${localSpot.name} in ${city}`);
      text = text.replace("local bookstore", `${localSpot.name} in ${city}`);
    }
    return { ...act, text };
  });
}

// --- 11. Main Recommended Action Fetcher ---
export function getRecommendedInterventions(profile, context, history, db) {
  // 1. Calculate Readiness and Stage
  const readiness = calculateReadinessScore(db);
  const stage = determineMomentumStage(db);

  // 2. Decide move count (Dynamic Moves Scaling)
  let count = 4;
  if (readiness < 4) count = 3;
  else if (readiness > 7) count = 5;

  // 3. Generate Candidates
  const coreValues = profile.core_values || [];
  let candidates = generateCandidates(db, context, coreValues, stage, readiness);

  // 4. Score Candidates
  let scored = scoreCandidates(candidates, context, profile, db, readiness);

  // 5. Choose Day Set
  let result = simulateAndChooseDaySet(scored, context, count);

  // Calculate AUM Confidence (average success probability of chosen set)
  let avgProbability = 0.8;
  if (result.selected.length > 0) {
    const sumProb = result.selected.reduce((acc, act) => {
      const match = scored.find(s => s.task.id === act.id);
      return acc + (match ? match.probability : 0.8);
    }, 0);
    avgProbability = sumProb / result.selected.length;
  }
  let confidence = Math.round(avgProbability * 100);

  // 6. Low Confidence Override / Conservative Mode
  if (confidence < 45) {
    count = 3; // Force fewer recommendations
    // Filter candidates strictly for low friction recovery / joy tasks
    candidates = generateCandidates(db, context, coreValues, stage, readiness).filter(t => 
      t.friction <= 3 && (t.category === "Recovery" || t.category === "Joy" || t.category === "Spiritual")
    );
    scored = scoreCandidates(candidates, context, profile, db, readiness);
    result = simulateAndChooseDaySet(scored, context, count);
    
    // Recalculate confidence
    if (result.selected.length > 0) {
      const sumProb = result.selected.reduce((acc, act) => {
        const match = scored.find(s => s.task.id === act.id);
        return acc + (match ? match.probability : 0.8);
      }, 0);
      avgProbability = sumProb / result.selected.length;
    }
    confidence = Math.round(avgProbability * 100);
  }

  // 7. Inject Local Place Names
  const city = profile.city || "Gurgaon";
  let finalizedActions = injectLocalPlaceNames(result.selected, city);

  // 8. Inject structured explanation why (Explanation Engine)
  finalizedActions = finalizedActions.map(act => {
    const matchingKb = INTERVENTIONS_KB.find(k => k.id === act.id);
    const explanation = matchingKb ? generateExplanationTag(matchingKb, context, db) : "Selected to support momentum.";
    
    // Inject success probability for internal engine logic
    const matchingScored = scored.find(s => s.task.id === act.id);
    const successProb = matchingScored ? Math.round(matchingScored.probability * 100) : 80;

    return {
      ...act,
      whyToday: explanation,
      success_probability: successProb
    };
  });

  db.context = db.context || {};
  const gaps = calculateCategoryGaps(db);
  db.context.category_gaps = gaps;

  return {
    actions: finalizedActions,
    backups: result.backups,
    readiness_score: readiness,
    momentum_stage: stage,
    confidence_score: confidence
  };
}

export function calculateCategoryGaps(db) {
  const categories = [
    "Breathwork", "Movement", "Mindset", "Journaling", "Manifestation",
    "Learning", "Sensory/Experiential", "Social", "Recovery", "Spiritual"
  ];
  const gaps = {};
  const now = new Date();
  
  categories.forEach(cat => {
    gaps[cat] = 999; // Default representing Never
  });

  if (db && db.memory) {
    const exps = db.memory.life_experiences || [];
    if (Array.isArray(exps)) {
      exps.forEach(exp => {
        const cat = exp.type;
        if (categories.includes(cat) && exp.timestamp) {
          const diffMs = now - new Date(exp.timestamp);
          const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          if (diffDays < gaps[cat]) {
            gaps[cat] = diffDays;
          }
        }
      });
    }
  }
  return gaps;
}
