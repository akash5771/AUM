/**
 * Statistics service for AUM
 * Calculates mathematical correlations and averages over trailing log data
 */

// Calculate Pearson Correlation Coefficient (r)
export function calculatePearsonCorrelation(x, y) {
  const n = x.length;
  if (n < 3 || n !== y.length) return 0;

  let sumX = 0, sumY = 0, sumXY = 0;
  let sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = (n * sumXY) - (sumX * sumY);
  const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

  if (den === 0) return 0;
  return num / den;
}

// Calculate mean of an array
export function calculateMean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Evaluates the trailing 14 days of history to extract correlative patterns
 * Returns structured statistical observations
 */
export function computeStatisticalInsights(history) {
  const observations = [];
  if (!Array.isArray(history) || history.length < 4) {
    return observations; // Not enough data points
  }

  // 1. Extract columns for correlation analysis
  const reels = [];
  const sleepHours = [];
  const stress = [];
  const energy = [];
  const creation = [];
  
  // Group metrics by whether a task category was completed
  const stressByPhysicalCompleted = [];
  const stressByPhysicalSkipped = [];
  const sleepByRecoveryCompleted = [];
  const sleepByRecoverySkipped = [];

  history.forEach(log => {
    const reelsMinutes = log.consumption_minutes || log.reels_consumption || 0;
    const sleep = log.sleep_hours || 0;
    const dailyStress = log.stress || 0;
    const dailyEnergy = log.energy || 0;
    const creationMinutes = log.creation_minutes || 0;
    const completedCats = log.categories_completed || [];

    reels.push(reelsMinutes);
    sleepHours.push(sleep);
    stress.push(dailyStress);
    energy.push(dailyEnergy);
    creation.push(creationMinutes);

    // Grouping checks
    if (completedCats.includes("Physical")) {
      stressByPhysicalCompleted.push(dailyStress);
    } else {
      stressByPhysicalSkipped.push(dailyStress);
    }

    if (completedCats.includes("Recovery")) {
      sleepByRecoveryCompleted.push(sleep);
    } else {
      sleepByRecoverySkipped.push(sleep);
    }
  });

  // 2. Compute Pearson correlations
  const reelsSleepCorr = calculatePearsonCorrelation(reels, sleepHours);
  if (Math.abs(reelsSleepCorr) >= 0.4) {
    observations.push({
      type: "correlation",
      variableA: "screen_time",
      variableB: "sleep_hours",
      coefficient: reelsSleepCorr,
      significance: Math.abs(reelsSleepCorr) > 0.7 ? "high" : "medium",
      rawText: `Screen time/Reels consumption has a correlation of ${reelsSleepCorr.toFixed(2)} with your sleep hours.`
    });
  }

  const reelsStressCorr = calculatePearsonCorrelation(reels, stress);
  if (Math.abs(reelsStressCorr) >= 0.4) {
    observations.push({
      type: "correlation",
      variableA: "screen_time",
      variableB: "stress",
      coefficient: reelsStressCorr,
      significance: Math.abs(reelsStressCorr) > 0.7 ? "high" : "medium",
      rawText: `Screen time/Reels consumption has a correlation of ${reelsStressCorr.toFixed(2)} with your stress rating.`
    });
  }

  const creationEnergyCorr = calculatePearsonCorrelation(creation, energy);
  if (Math.abs(creationEnergyCorr) >= 0.4) {
    observations.push({
      type: "correlation",
      variableA: "creation_minutes",
      variableB: "energy",
      coefficient: creationEnergyCorr,
      significance: Math.abs(creationEnergyCorr) > 0.7 ? "high" : "medium",
      rawText: `Time spent creating has a correlation of ${creationEnergyCorr.toFixed(2)} with your energy level.`
    });
  }

  // 3. Compute Group Differences
  if (stressByPhysicalCompleted.length >= 2 && stressByPhysicalSkipped.length >= 2) {
    const meanStressCompleted = calculateMean(stressByPhysicalCompleted);
    const meanStressSkipped = calculateMean(stressByPhysicalSkipped);
    const diff = meanStressCompleted - meanStressSkipped;
    
    if (Math.abs(diff) >= 1.0) {
      observations.push({
        type: "group_diff",
        category: "Physical",
        target: "stress",
        difference: diff,
        rawText: `Average stress rating is ${Math.abs(diff).toFixed(1)} points ${diff < 0 ? 'lower' : 'higher'} on days you complete a Physical task.`
      });
    }
  }

  if (sleepByRecoveryCompleted.length >= 2 && sleepByRecoverySkipped.length >= 2) {
    const meanSleepCompleted = calculateMean(sleepByRecoveryCompleted);
    const meanSleepSkipped = calculateMean(sleepByRecoverySkipped);
    const diff = meanSleepCompleted - meanSleepSkipped;

    if (Math.abs(diff) >= 0.5) {
      observations.push({
        type: "group_diff",
        category: "Recovery",
        target: "sleep_hours",
        difference: diff,
        rawText: `Average sleep duration is ${Math.abs(diff).toFixed(1)} hours ${diff > 0 ? 'longer' : 'shorter'} on days you complete a Recovery task.`
      });
    }
  }

  return observations;
}
