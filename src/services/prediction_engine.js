/**
 * Prediction Engine service for AUM
 * Calculates Burnout Risk and Task-level Failure Probabilities based on historical trends and logs
 */

// Helper to calculate mean of last N items
function getAverageOfLastDays(history, key, daysCount = 3) {
  const slice = history.slice(-daysCount);
  if (slice.length === 0) return 0;
  
  const sum = slice.reduce((acc, log) => {
    let val = 0;
    if (key === 'sleep') {
      val = log.sleep_hours !== undefined ? log.sleep_hours : 0;
    } else if (key === 'stress') {
      val = log.stress !== undefined ? log.stress : (log.mood_state === 'stressed' ? 8 : 5);
    } else if (key === 'consumption') {
      val = log.consumption_minutes !== undefined ? log.consumption_minutes : (log.reels_consumption || 0);
    }
    return acc + val;
  }, 0);

  return sum / slice.length;
}

/**
 * Calculates Burnout Risk (0-100%) based on trailing 3-day trends
 */
export function calculateBurnoutRisk(history) {
  if (!Array.isArray(history) || history.length === 0) return 10; // Default baseline risk

  // Calculate 3-day averages
  const avgStress = getAverageOfLastDays(history, 'stress', 3);
  const avgSleep = getAverageOfLastDays(history, 'sleep', 3);
  const avgConsumption = getAverageOfLastDays(history, 'consumption', 3);

  let risk = 0;

  // Stress weight (up to 40%)
  if (avgStress >= 8) {
    risk += 40;
  } else if (avgStress >= 6.5) {
    risk += 25;
  } else if (avgStress >= 5) {
    risk += 10;
  }

  // Sleep weight (up to 30%)
  if (avgSleep < 5.5) {
    risk += 30;
  } else if (avgSleep < 6.5) {
    risk += 15;
  } else if (avgSleep < 7.5) {
    risk += 5;
  }

  // Reels/Consumption weight (up to 30%)
  if (avgConsumption >= 180) {
    risk += 30;
  } else if (avgConsumption >= 120) {
    risk += 15;
  } else if (avgConsumption >= 60) {
    risk += 5;
  }

  return Math.min(100, Math.max(0, risk));
}

/**
 * Computes the failure probability (0-100%) of a specific category under the current day and time context
 */
export function calculateCategoryFailureProbability(profile, dayOfWeek, timeOfDay, category) {
  const failureRepo = profile.failure_repository || [];
  if (failureRepo.length === 0) return 10; // Baseline low risk

  // Filter failures matching this category, day of week, and time of day
  const matches = failureRepo.filter(f => 
    f.category === category && 
    f.day_of_week === dayOfWeek && 
    f.time_of_day === timeOfDay
  );

  // Failure count logic
  if (matches.length >= 2) {
    return 85; // High probability of failure
  } else if (matches.length === 1) {
    return 50; // Moderate probability
  }
  
  return 10; // Low probability
}

/**
 * Compiles predictions for the current context
 */
export function getPredictions(profile, context, history) {
  const burnoutRisk = calculateBurnoutRisk(history || []);
  
  const dayOfWeek = context.environmental?.day_of_week || 'Monday';
  const timeOfDay = context.environmental?.time || 'Morning';
  
  const categories = ["Physical", "Recovery", "Social", "Creative", "Joy", "Learning", "Adventure", "Contribution"];
  const categoryFailures = {};
  
  categories.forEach(cat => {
    categoryFailures[cat] = calculateCategoryFailureProbability(profile, dayOfWeek, timeOfDay, cat);
  });

  return {
    burnout_risk: burnoutRisk,
    category_failure_risks: categoryFailures
  };
}
