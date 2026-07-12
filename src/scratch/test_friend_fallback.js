import { generateChatResponseService } from '../services/gemini.js';
import { readDB, writeDB } from '../services/db.js';
import assert from 'assert';

async function runChatFallbackTests() {
  console.log("=== RUNNING FRIEND CHAT FALLBACK TESTS ===");

  // 1. Force offline fallback mode by clearing key in process.env
  process.env.GEMINI_API_KEY = "";

  // 2. Setup mock DB state
  const db = await readDB();
  
  // Backup real database to restore later
  const originalProfile = JSON.parse(JSON.stringify(db.profile));
  const originalContext = JSON.parse(JSON.stringify(db.context));
  const originalHistory = JSON.parse(JSON.stringify(db.chat_history || []));
  const originalMemories = JSON.parse(JSON.stringify(db.semantic_memory || []));

  try {
    // Override profile for predictable testing
    db.profile.name = "Akash Tripathi";
    db.profile.role = "General Manager";
    db.profile.goals = "achieve inner freedom";
    db.profile.momentum_score = 75;
    
    // Add office-related semantic memory from yesterday
    db.semantic_memory = [
      {
        id: "m_test1",
        text: "conflict with masters union board on budget allocations",
        category: "insight",
        date: "2026-07-10"
      }
    ];

    // Set stress rating to High (9/10) to test adaptive peer mode
    db.context.mood = { rating: 9, state: "stressed" };
    db.context.sleep = { hours: 5.5, quality: "poor", energy: 3 };
    await writeDB(db);

    console.log("\n--- Scenario 1: Gym/Exercise keyword under High Stress ---");
    let response = await generateChatResponseService("going to gym for my physical grounding");
    console.log("Input: 'going to gym for my physical grounding'");
    console.log("Response:", response);
    let lowerRes = response.toLowerCase();
    assert(lowerRes.includes("gym"), "Response should reference gym");
    assert(lowerRes.includes("physically grounding"), "Response should acknowledge grounding");
    assert(lowerRes.includes("stress level is high"), "Response should notice high stress");

    console.log("\n--- Scenario 2: Office/Work under High Stress (with memory followup) ---");
    response = await generateChatResponseService("feeling anxious about work at the office today");
    console.log("Input: 'feeling anxious about work at the office today'");
    console.log("Response:", response);
    lowerRes = response.toLowerCase();
    assert(lowerRes.includes("work stress"), "Response should mention work stress");
    assert(lowerRes.includes("conflict with masters union board"), "Response should mention the semantic memory");

    // Change stress to Low (3/10) to test encouragement peer mode
    db.context.mood = { rating: 3, state: "confident" };
    await writeDB(db);

    console.log("\n--- Scenario 3: Gym/Exercise under Low Stress ---");
    response = await generateChatResponseService("i am heading to gym now");
    console.log("Input: 'i am heading to gym now'");
    console.log("Response:", response);
    lowerRes = response.toLowerCase();
    assert(lowerRes.includes("workout"), "Response should reference workout");
    assert(lowerRes.includes("momentum"), "Response should mention momentum score");

    console.log("\n--- Scenario 4: Task Win / Done completed ---");
    response = await generateChatResponseService("completed my reflection action!");
    console.log("Input: 'completed my reflection action!'");
    console.log("Response:", response);
    lowerRes = response.toLowerCase();
    assert(lowerRes.includes("building momentum"), "Response should celebrate building momentum");

    console.log("\n--- Scenario 5: Meta-Chat detection ('are you stuck?') ---");
    response = await generateChatResponseService("are you stuck?");
    console.log("Input: 'are you stuck?'");
    console.log("Response:", response);
    lowerRes = response.toLowerCase();
    assert(lowerRes.includes("local backup mode"), "Response should mention local backup mode");
    assert(lowerRes.includes("spending limit"), "Response should explain spending limits");

    console.log("\n--- Scenario 6: Greeting rotation (No consecutive repeats) ---");
    const greet1 = await generateChatResponseService("what's up companion?");
    console.log("Greet 1:", greet1);
    const greet2 = await generateChatResponseService("what's up companion?");
    console.log("Greet 2:", greet2);
    assert(greet1 !== greet2, "Consequent default greetings should rotate and vary");

    console.log("\n✅ ALL FRIEND CHAT FALLBACK TESTS PASSED!");
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err.message);
    throw err;
  } finally {
    // Restore original DB state
    const cleanDb = await readDB();
    cleanDb.profile = originalProfile;
    cleanDb.context = originalContext;
    cleanDb.chat_history = originalHistory;
    cleanDb.semantic_memory = originalMemories;
    await writeDB(cleanDb);
    console.log("\nOriginal database state restored.");
  }
}

runChatFallbackTests();
