/**
 * Memory Engine Verification Script
 * Validates consolidation, structured facts merger, and two-stage context retrieval.
 */

import { addRawChat, getRawChat, getStructured, getSummaries } from '../services/memory_engine/memory_db.js';
import { mergeStructuredFacts } from '../services/memory_engine/structured_memory.js';
import { updateActiveThreads } from '../services/memory_engine/thread_manager.js';
import { updateGoals } from '../services/memory_engine/goal_manager.js';
import { addTimelineEvent } from '../services/memory_engine/timeline_manager.js';
import { recordInterventionOutcomes } from '../services/memory_engine/outcome_memory.js';
import { enforceDynamicRetention } from '../services/memory_engine/ttl_manager.js';
import { retrieveRelevantContext, searchMemory } from '../services/memory_engine/retrieval_engine.js';
import { consolidateDailyMemory } from '../services/memory_engine/consolidator.js';

async function runMemoryTests() {
  console.log("=== STARTING AUM MEMORY ENGINE v1.0 TESTS ===");

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

  // Helper: Mock Database Instance
  const mockDb = {
    profile: {
      name: "Akash",
      active_goal: { category: "Health", subGoal: "Sleep Better" },
      active_threads: [],
      relationships: [],
      identity_evolution: [],
      momentum_score: 50,
      behavioral_dna: {}
    },
    context: {
      sleep: { hours: 7.5, quality: "good", energy: 7 },
      mood: { rating: 4, state: "clear" }
    },
    chat_history: [],
    history: [],
    recent_summaries: [],
    memory: {
      raw_chat: [],
      summaries: [],
      structured: {
        identity: {},
        goals: [],
        projects: [],
        preferences: [],
        relationships: []
      },
      growth_signals: [],
      behavioral_dna: {},
      timeline: [],
      outcome_memory: []
    }
  };

  // Mock Gemini LLM output
  const mockGemini = async (prompt, isJson) => {
    if (isJson) {
      if (prompt.includes("Behavioral DNA Engine")) {
        return {
          best_time_to_work: "Morning",
          burnout_trigger: "Sleep <6 hours",
          motivation_style: "Purpose",
          favorite_recovery: "Slow Walk",
          common_failure: "Late Night Scrolling"
        };
      }
      if (prompt.includes("Daily Memory Compression Engine")) {
        return {
          summary: "Discussed work friction with Monu and Ishi, and decided to drop the project case with Aakriti.",
          emotion: "Frustrated then Optimistic",
          decisions: ["Dropped case with Aakriti"],
          active_threads: ["Monu friction", "Ishi workload"]
        };
      }
      if (prompt.includes("Behavioral and Cognitive Analytics Engine")) {
        return {
          signals: ["showed_courage", "set_boundaries"],
          reason: "Set boundaries with Aakriti by dropping case.",
          confidence: 0.95,
          extracted_entities: ["Monu friction", "Ishi workload"],
          resolve_intent: ["Aakriti case"],
          invisible_momentum_triggered: true,
          invisible_momentum_message: "I noticed something important today: You set a clear boundary by dropping the case with Aakriti.",
          extracted_facts: {
            identity: { maritalStatus: "Married", occupation: "Growth Hacker" },
            goals: [{ goal: "12% Body Fat", status: "Active", deadline: "2027-01", priority: "High" }],
            projects: [{ project: "AUM", status: "Building" }],
            preferences: ["Morning workouts", "Vegetarian"],
            relationships: [
              { name: "Ishi", role: "Colleague", status: "Active", context: "Work conflict" },
              { name: "Monu", role: "Manager", status: "Active", context: "Friction at work" },
              { name: "Aakriti", role: "Colleague", status: "Dropped", context: "Dropped conflict case" }
            ],
            relationship_history: [
              { name: "Monu", type: "work", emotion: "angry", importance: 6, summary: "Disagreement on work tasks", thread: "Monu friction" }
            ],
            life_experiences: [
              { type: "Exercise", activity: "5K Run", location: "Aravali Biodiversity Park", people: [], emotion_after: "happy", importance: 5, summary: "Went jogging in the park" }
            ]
          }
        };
      }
      if (prompt.includes("Context Retrieval Engine")) {
        // Mocking retrieval indices selection: return 0 for first summary
        return [0];
      }
    } else {
      // String outputs
      if (prompt.includes("Identity Evolution Engine")) {
        return "You successfully navigated interpersonal conflict with Ishi and Monu.";
      }
    }
    return "";
  };

  // --- Test Case 1: Raw Chat Logging & Retrieval ---
  try {
    addRawChat(mockDb, "User", "I am having friction with Monu and Ishi. Also dropped case with Aakriti.", "2026-07-12T10:00:00Z");
    addRawChat(mockDb, "AUM", "Understood. Boundaries are important.", "2026-07-12T10:01:00Z");

    const chats = getRawChat(mockDb);
    assert(chats.length === 2, "Raw chat logging should successfully record messages.");
    assert(chats[0].sender === "User", "First sender should be User.");
  } catch (e) {
    failed++;
    console.error("Test Case 1 failed:", e);
  }

  // --- Test Case 2: Consolidation & Fact Extraction ---
  try {
    const yesterdayActions = [
      { id: "act_1", text: "Walk 15 mins", status: "done" },
      { id: "act_2", text: "Gym Session", status: "skipped" }
    ];
    
    // Run consolidation
    await consolidateDailyMemory(mockDb, yesterdayActions, mockDb.context, "2026-07-12", mockGemini);

    const structured = getStructured(mockDb);
    assert(structured.relationships.length === 3, "Should extract exactly 3 relationships (Ishi, Monu, Aakriti).");
    
    const aakritiRel = structured.relationships.find(r => r.name === "Aakriti");
    assert(aakritiRel !== undefined && aakritiRel.status === "Dropped", "Aakriti's status should be updated to Dropped.");
    
    assert(structured.preferences.includes("Vegetarian"), "Should merge preferences like Vegetarian.");
    
    const timeline = getMemory(mockDb).timeline;
    assert(timeline.length > 0, "Milestone breakthrough should be saved in Life Timeline.");
  } catch (e) {
    failed++;
    console.error("Test Case 2 failed:", e);
  }

  // --- Test Case 3: Two-Stage Retrieval Engine ---
  try {
    // 1. Context query mentioning Aakriti
    const queryResultAakriti = await retrieveRelevantContext(mockDb, "Do you remember about Aakriti?", mockGemini);
    
    assert(queryResultAakriti.relevant_relationships.some(r => r.name === "Aakriti"), "Should deterministically retrieve relationship info about Aakriti.");
    assert(queryResultAakriti.relevant_past_summaries.length > 0, "Should retrieve relevant daily summaries.");
    assert(queryResultAakriti.relevant_past_summaries[0].includes("Aakriti"), "Retrieved daily summary should mention Aakriti.");

    // 2. Context query mentioning Monu
    const queryResultMonu = await retrieveRelevantContext(mockDb, "What is my status with Monu?", mockGemini);
    assert(queryResultMonu.relevant_relationships.some(r => r.name === "Monu"), "Should retrieve relationship info about Monu.");
  } catch (e) {
    failed++;
    console.error("Test Case 3 failed:", e);
  }

  // --- Test Case 4: TTL Policy Pruning ---
  try {
    const originalCount = mockDb.memory.raw_chat.length;
    // Inject ancient message
    mockDb.memory.raw_chat.push({
      sender: "User",
      text: "Ancient message",
      timestamp: "2025-01-01T00:00:00Z"
    });
    
    enforceDynamicRetention(mockDb, "2026-07-12T12:00:00Z");
    
    assert(mockDb.memory.raw_chat.length === originalCount, "TTL pruning should delete messages older than 90 days.");
  } catch (e) {
    failed++;
    console.error("Test Case 4 failed:", e);
  }

  // --- Test Case 5: Life Graph, Relationship History, and searchMemory ---
  try {
    // Verify that life_experiences was merged in Test Case 2 consolidation
    const structured = getStructured(mockDb);
    const monuRel = structured.relationships.find(r => r.name === "Monu");
    
    assert(monuRel !== undefined, "Monu relationship should be stored.");
    assert(monuRel.relationship_history.length > 0, "Monu relationship history should have been merged.");
    assert(monuRel.relationship_history[0].summary === "Disagreement on work tasks", "Monu history summary matches.");
    assert(monuRel.relationship_history[0].importance === 6, "Monu history importance matches.");

    // Verify experiences are logged
    assert(mockDb.memory.life_experiences.length > 0, "Life experiences array contains items.");
    assert(mockDb.memory.life_experiences[0].activity === "5K Run", "First experience activity matches.");
    assert(mockDb.memory.life_experiences[0].stress_delta === -2, "First experience has stress_delta -2 for happy emotion.");

    // Verify synonym search: searching "jogging" should match "5K Run"
    const results = searchMemory(mockDb, "I want to start jogging again", "experiences");
    assert(results.length > 0 && results[0].activity === "5K Run", "searchMemory synonym search successfully resolves jogging ⇆ run.");

    // Verify 90-day pruning compression
    // Add an ancient moment (100 days ago)
    const ancientTime = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    monuRel.relationship_history.push({
      id: "rel_hist_ancient",
      type: "work",
      emotion: "neutral",
      importance: 5,
      timestamp: ancientTime,
      summary: "Old discussion about design rules",
      thread: "General"
    });
    mockDb.memory.life_experiences.push({
      id: "exp_ancient",
      type: "Exercise",
      activity: "Old Walk",
      location: "",
      people: [],
      emotion_after: "happy",
      importance: 3,
      timestamp: ancientTime,
      source: "chat",
      stress_delta: 0,
      summary: "Old Walk in park"
    });

    // Run mergeStructuredFacts with empty extracted facts to trigger TTL compaction
    mergeStructuredFacts(mockDb, { relationships: [] });

    assert(monuRel.relationship_history.every(h => h.id !== "rel_hist_ancient"), "Ancient relationship moment pruned.");
    assert(monuRel.history_archive.some(a => a.includes("Old discussion about design rules")), "Ancient moment archived in history_archive.");
    assert(mockDb.memory.life_experiences.every(e => e.id !== "exp_ancient"), "Ancient life experience pruned.");
    assert(mockDb.memory.life_experiences_archive.some(a => a.includes("Exercise: Old Walk")), "Ancient experience archived in experiences archive.");
  } catch (e) {
    failed++;
    console.error("Test Case 5 failed:", e);
  }

  console.log(`=== TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Inline helper to resolve getMemory
function getMemory(db) {
  return db.memory;
}

runMemoryTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
