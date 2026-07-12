/**
 * Automated test pipeline for AUM Version 6
 * Verifies all mathematical, statistical, predictive, and scoring algorithms.
 */

import { calculatePearsonCorrelation, calculateMean, computeStatisticalInsights } from '../services/statistics.js';
import { calculateBurnoutRisk, calculateCategoryFailureProbability, getPredictions } from '../services/prediction_engine.js';
import { getSeasonalEvents, getWorldEngineMetrics, buildUnifiedContext } from '../services/context_engine.js';
import { generateCandidates, scoreCandidates, simulateAndChooseDaySet, checkAndSwapBlockedActions } from '../services/recommendations.js';
import { orchestrateDayTransition } from '../services/day_transition.js';

async function runTests() {
  console.log("=== STARTING RIGOROUS TESTS FOR AUM V6 ===");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log(`[PASS] ${message}`);
    } else {
      failed++;
      console.error(`[FAIL] ${message}`);
    }
  }

  // --- Test Case 1: Pearson Correlation ---
  try {
    const x = [10, 20, 30, 40, 50];
    const y = [100, 90, 80, 70, 60]; // perfect negative correlation (-1.0)
    const corr = calculatePearsonCorrelation(x, y);
    assert(Math.abs(corr + 1.0) < 0.0001, `Pearson correlation should be -1.0 (got ${corr})`);

    const x2 = [1, 2, 3, 4, 5];
    const y2 = [2, 4, 6, 8, 10]; // perfect positive correlation (1.0)
    const corr2 = calculatePearsonCorrelation(x2, y2);
    assert(Math.abs(corr2 - 1.0) < 0.0001, `Pearson correlation should be 1.0 (got ${corr2})`);
  } catch (e) {
    failed++;
    console.error("Pearson correlation test error:", e);
  }

  // --- Test Case 2: Statistical Insights (14-day history) ---
  try {
    const mockHistory = [
      { date: "2026-07-01", sleep_hours: 5, consumption_minutes: 200, stress: 8, energy: 3, categories_completed: [] },
      { date: "2026-07-02", sleep_hours: 5, consumption_minutes: 180, stress: 8, energy: 3, categories_completed: [] },
      { date: "2026-07-03", sleep_hours: 8, consumption_minutes: 30, stress: 4, energy: 7, categories_completed: ["Physical", "Recovery"] },
      { date: "2026-07-04", sleep_hours: 8, consumption_minutes: 20, stress: 3, energy: 8, categories_completed: ["Physical", "Recovery"] },
    ];
    const insights = computeStatisticalInsights(mockHistory);
    
    // Check if correlation between Reels/Consumption and Sleep Hours was detected (it's negative)
    const reelsSleepInsight = insights.find(i => i.variableA === 'screen_time' && i.variableB === 'sleep_hours');
    assert(reelsSleepInsight !== undefined && reelsSleepInsight.coefficient < 0, "Should detect negative correlation between screen time and sleep.");
    
    // Check if stress group difference on Physical days was detected
    const stressDiffInsight = insights.find(i => i.category === 'Physical' && i.target === 'stress');
    assert(stressDiffInsight !== undefined && stressDiffInsight.difference < 0, "Should detect lower average stress on Physical days.");
  } catch (e) {
    failed++;
    console.error("Statistical insights test error:", e);
  }

  // --- Test Case 3: Burnout Risk Assessment ---
  try {
    const highStressHistory = [
      { stress: 9, sleep_hours: 4.5, consumption_minutes: 210 },
      { stress: 8.5, sleep_hours: 5.0, consumption_minutes: 190 },
      { stress: 8, sleep_hours: 5.2, consumption_minutes: 200 },
    ];
    const risk = calculateBurnoutRisk(highStressHistory);
    assert(risk >= 80, `Burnout risk should be high (>= 80%) for high stress and poor sleep (got ${risk}%)`);

    const goodHistory = [
      { stress: 3, sleep_hours: 8.0, consumption_minutes: 20 },
      { stress: 4, sleep_hours: 7.5, consumption_minutes: 30 },
      { stress: 3, sleep_hours: 8.2, consumption_minutes: 10 },
    ];
    const lowRisk = calculateBurnoutRisk(goodHistory);
    assert(lowRisk <= 20, `Burnout risk should be low (<= 20%) for good habits (got ${lowRisk}%)`);
  } catch (e) {
    failed++;
    console.error("Burnout risk test error:", e);
  }

  // --- Test Case 4: World Engine and Seasons ---
  try {
    // Test Salary Week
    const salaryDate = new Date("2026-07-02");
    const salaryEvents = getSeasonalEvents(salaryDate);
    assert(salaryEvents.includes("Salary Week"), "Should identify Salary Week on the 2nd of the month.");

    // Test IPL Season (April - May)
    const iplDate = new Date("2026-04-15");
    const iplEvents = getSeasonalEvents(iplDate);
    assert(iplEvents.includes("IPL Cricket Season"), "Should identify IPL Season in April.");

    // Test World Metrics for Gurgaon (Evening traffic spike)
    const gurgaonEvening = getWorldEngineMetrics("Gurgaon", "Evening");
    assert(gurgaonEvening.traffic === "Critical" && gurgaonEvening.aqi === 250, "Gurgaon evening should have Critical traffic and high AQI.");
  } catch (e) {
    failed++;
    console.error("World Engine test error:", e);
  }

  // --- Test Case 5: Unified Context Compiler ---
  let mockDb = {
    profile: {
      name: "Akash",
      role: "Engineer",
      city: "Bengaluru",
      location_profile: {
        home_base: { city: "Bengaluru", neighborhood: "Indiranagar", lat: 12.97, lng: 77.59 },
        work_base: { city: "Bengaluru", neighborhood: "Tech Park" },
        comfort_radius: 30,
        travel_mode: false,
        travel_city: ""
      },
      core_values: ["Family", "Health"],
      active_goal: { category: "Health", subGoal: "Sleep Better" },
      current_chapter: "New Parent",
      financial_stance: "saving_aggressively",
      relationships: ["Wife", "Kids"],
      momentum_score: 65,
      archetype: "The Rebuilder",
      life_timeline: [
        { type: "Family Illness", status: "active", date: "2026-07-05" }
      ]
    },
    context: {
      sleep: { hours: 6.5, quality: "good" },
      mood: { rating: 7, state: "stressed" },
      energies: { mental: 4, physical: 6, social: 3, creative: 5 },
      creation_minutes: 30,
      consumption_minutes: 90
    },
    actions: [],
    backups: [],
    chat_history: [],
    semantic_memory: [],
    insights: {
      behavioral_insights: ["Exercise drops stress"],
      current_risks: ["High reels usage"],
      current_wins: ["3-day stretch"]
    },
    history: []
  };

  try {
    const unifiedContext = buildUnifiedContext(mockDb, "2026-07-02T19:00:00.000Z");
    assert(unifiedContext.temporal.day_of_week === "Thursday", "Should parse correct day of week.");
    assert(unifiedContext.temporal.time_of_day === "Evening", "Should parse correct time of day (Evening at 19:00).");
    assert(unifiedContext.environmental.seasons.includes("Salary Week"), "Should resolve Salary Week in context.");
    assert(unifiedContext.user_state.energies.mental === 4, "Should correctly resolve 4-energy levels.");
    assert(unifiedContext.memory.active_life_events.length === 1, "Should correctly resolve active life timeline events.");
  } catch (e) {
    failed++;
    console.error("Context compiler test error:", e);
  }

  // --- Test Case 6: Recommendation Constraints & Scoring ---
  try {
    const context = buildUnifiedContext(mockDb, "2026-07-02T19:00:00.000Z");
    
    // Core values constraints test
    // "kb_phys_gym" has restricted_values ["Time-Sparing"]. None in user values, so it passes.
    // Let's check candidate generation
    const candidates = generateCandidates(mockDb, context, mockDb.profile.core_values, "Stage 1: Activation", 5);
    
    // Validate that 'kb_rec_massage' (premium) and 'kb_phys_gym' (premium) are filtered out or scored 0 under "saving_aggressively"
    const scored = scoreCandidates(candidates, context, mockDb.profile, mockDb, 5);
    const gymScored = scored.find(s => s.task.id === 'kb_phys_gym');
    const walkScored = scored.find(s => s.task.id === 'kb_phys_walk');
    
    assert(gymScored === undefined, "Premium gym task should be filtered out when saving aggressively.");
    assert(walkScored !== undefined && walkScored.ev > 0, "Brisk outdoor walk should be scored positively.");

    // Validate Family Sickness modifier (decreases readiness, which changes count and candidates)
    const recoveryTaskScored = scored.find(s => s.task.id === 'kb_rec_breathing');
    assert(recoveryTaskScored !== undefined && recoveryTaskScored.ev > 0, "Recovery task should be scored positively.");
  } catch (e) {
    failed++;
    console.error("Recommendation constraints test error:", e);
  }

  // --- Test Case 7: Diversity & Day Set Simulation ---
  try {
    const context = buildUnifiedContext(mockDb, "2026-07-02T19:00:00.000Z");
    const candidates = generateCandidates(mockDb, context, mockDb.profile.core_values, "Stage 1: Activation", 5);
    
    // Score without recency penalty
    mockDb.profile.last_recommended_timestamps = {};
    const scoredBefore = scoreCandidates(candidates, context, mockDb.profile, mockDb, 5);
    
    // Apply Diversity / Recency penalty
    mockDb.profile.last_recommended_timestamps = {
      "kb_phys_walk": "2026-07-02T19:00:00.000Z" // just recommended at the same time
    };
    const scoredAfter = scoreCandidates(candidates, context, mockDb.profile, mockDb, 5);
    
    const walkBefore = scoredBefore.find(s => s.task.id === 'kb_phys_walk');
    const walkAfter = scoredAfter.find(s => s.task.id === 'kb_phys_walk');
    
    assert(walkAfter !== undefined && walkBefore !== undefined && walkAfter.ev < walkBefore.ev, "Brisk walk should have a lower score due to recency penalty.");

    // Test Day Set Simulation selection
    const result = simulateAndChooseDaySet(scoredAfter, context, 5);
    assert(result.selected.length === 5, "Simulation should choose exactly 5 tasks.");
    assert(result.backups.length >= 1, "Simulation should select backup tasks.");
  } catch (e) {
    failed++;
    console.error("Diversity and simulation test error:", e);
  }

  // --- Test Case 8: Day Transition & Archetype Matrix ---
  try {
    // Setup actions for transition
    mockDb.actions = [
      { id: "kb_phys_walk", status: "done", category: "Physical" },
      { id: "kb_rec_breathing", status: "done", category: "Recovery" },
      { id: "kb_soc_family_dinner", status: "done", category: "Social" },
      { id: "kb_joy_read", status: "todo", category: "Joy" },
      { id: "kb_learn_podcast", status: "todo", category: "Learning" }
    ];

    // Mock queryGeminiFn to return static strings immediately
    const mockGemini = async (prompt, isJson = false) => {
      if (isJson) return ["Walks and sleep are correlated."];
      return "Yesterday completed 3 actions, stress dropped from 7 to 4.";
    };

    const transitionResult = await orchestrateDayTransition(mockDb, mockGemini);
    
    // Assert transition updates
    assert(transitionResult.intentional === true, "Day transition should log yesterday as Intentional (>= 3 actions, low screen time).");
    assert(mockDb.profile.momentum_score > 50, "Momentum should increase after 3 completed actions and stable parameters.");
    assert(mockDb.history.length === 1, "Should successfully append yesterday's log to history.");
    assert(mockDb.recent_summaries.length === 1, "Should compile a chat summary.");
  } catch (e) {
    failed++;
    console.error("Day transition test error:", e);
  }

  console.log("\n=== TEST RESULTS SUMMARY ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log("=========================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
