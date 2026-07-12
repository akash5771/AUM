import { 
  addEpochSummary, 
  getEpochSummaries, 
  archiveOldSummaries, 
  getMemory 
} from '../services/memory_engine/memory_db.js';
import { retrieveRelevantContext } from '../services/memory_engine/retrieval_engine.js';
import { generateEpochSummary } from '../services/memory_engine/summary_engine.js';

async function runEpochTests() {
  console.log("=== STARTING AUM EPOCH MEMORY ENGINE TESTS ===");

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

  // 1. Setup Mock DB
  const mockDb = {
    profile: {
      name: "Akash",
      active_goal: { category: "Health", subGoal: "Sleep Better" },
      relationships: [
        { name: "Monu", role: "Manager", status: "Active", relationship_history: [] }
      ]
    },
    context: {
      mood: { state: "Clear" }
    },
    memory: {
      raw_chat: [],
      summaries: [],
      epoch_summaries: [],
      archived_keywords: {},
      structured: {
        relationships: [
          { name: "Monu", role: "Manager", status: "Active", relationship_history: [] }
        ]
      }
    }
  };

  // 2. Test Epoch Summarization LLM Parser (Mock LLM)
  const mockGemini = async (prompt, isJson) => {
    if (prompt.includes("Had a fight with my boss Monu today")) {
      return {
        summary: "Had a dispute with my boss Monu about project ownership.",
        salience: "high",
        decisions: ["Stand firm on ownership"],
        people: ["Monu"],
        active_threads: ["Work Ownership"]
      };
    }
    return {
      summary: "Talked about routine stuff, weather, and simple code refactoring.",
      salience: "low",
      decisions: [],
      people: [],
      active_threads: []
    };
  };

  // Verify generateEpochSummary works
  const chatsHigh = [
    { sender: "User", text: "Had a fight with my boss Monu today" },
    { sender: "AUM", text: "Oh, what happened?" }
  ];
  const summaryHigh = await generateEpochSummary(mockDb, chatsHigh, mockGemini);
  assert(summaryHigh !== null, "generateEpochSummary returned summary");
  assert(summaryHigh.salience === "high", "High salience correctly detected");
  assert(summaryHigh.people.includes("Monu"), "Identified Monu in segment");

  const chatsLow = [
    { sender: "User", text: "How is the weather today?" },
    { sender: "AUM", text: "It is quite warm outside." }
  ];
  const summaryLow = await generateEpochSummary(mockDb, chatsLow, mockGemini);
  assert(summaryLow.salience === "low", "Low salience correctly detected for routine chat");

  // 3. Test Epoch Addition
  addEpochSummary(mockDb, {
    id: "epoch_test_1",
    timestamp: "2026-07-08T10:00:00Z",
    summary: "Had a dispute with my boss Monu about project ownership.",
    decisions: ["Stand firm on ownership"],
    people: ["Monu"]
  });
  
  assert(getEpochSummaries(mockDb).length === 1, "Epoch summary added to db");

  // 4. Test Synonym and Substring Search in retrieveRelevantContext
  // Check if "boss dispute" matches "Had a dispute with my boss Monu..."
  const context = await retrieveRelevantContext(mockDb, "I had a fight with my boss", mockGemini);
  assert(context.relevant_past_summaries.length > 0, "Found matching summary using synonyms (fight -> dispute, boss -> boss)");
  assert(context.relevant_past_summaries[0].includes("dispute"), "Matches correct summary content");

  // Check multi-term ranking (score boost for mentioning boss/Monu AND dispute/fight)
  // Let's add another epoch that matches only "fight" but doesn't mention Monu
  addEpochSummary(mockDb, {
    id: "epoch_test_2",
    timestamp: "2026-07-09T10:00:00Z",
    summary: "Got into a minor fight over chess rules.",
    decisions: []
  });

  const contextRanked = await retrieveRelevantContext(mockDb, "I had a fight with Monu", mockGemini);
  // Monu dispute should rank higher because it matches both "Monu" and "fight" (synonym of dispute)
  assert(contextRanked.relevant_past_summaries[0].includes("Monu"), "Monu dispute is ranked first due to multi-term scoring");

  // 5. Test Tiered Archiving
  // Let's make the first summary older than 30 days
  mockDb.memory.epoch_summaries[0].timestamp = "2026-06-01T10:00:00Z";
  mockDb.memory.epoch_summaries[1].timestamp = "2026-07-09T10:00:00Z"; // recent

  // Run archive process with a fixed current date
  await archiveOldSummaries(mockDb, "2026-07-12T12:00:00Z");

  assert(mockDb.memory.epoch_summaries.length === 1, "Older epoch summary archived (removed from active memory)");
  assert(mockDb.memory.archived_keywords["monu"].includes("epoch_test_1"), "Archived summary keyword 'monu' indexed in main DB");
  assert(mockDb.memory.archived_keywords["dispute"].includes("epoch_test_1"), "Archived summary keyword 'dispute' indexed in main DB");

  console.log(`=== TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runEpochTests().catch(err => {
  console.error(err);
  process.exit(1);
});
