import fs from 'fs';
import path from 'path';
import { evaluateSignalTrigger } from '../services/signal_trigger.js';
import { readDB, writeDB, getSignalState } from '../services/db.js';
import { detectChatSignals, generateSingleContextualAction } from '../services/groq.js';

// Parse .env.local manually to load environment variables
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim();
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.warn("Failed to load .env.local:", e);
}

// Setup Mock DB for testing
async function runTests() {
  console.log("=== STARTING SIGNAL TRIGGER AND CONTEXTUAL TASK TESTS ===");
  
  const mockDb = {
    virtual_time: new Date("2026-07-17T12:00:00Z").toISOString(),
    profile: {
      active_goal: { category: "Health", subGoal: "Sleep Better" },
      location_profile: {
        home_base: { city: "Gurgaon", neighborhood: "DLF Phase 3" },
        work_base: { city: "Gurgaon", neighborhood: "Cyber City" }
      },
      total_actions_generated: 0
    },
    context: {
      sleep: { hours: 6.5, quality: "fair", energy: 5 },
      mood: { rating: 5, state: "clear" },
      checkin_stage: "completed"
    },
    actions: [],
    chat_history: [],
    signal_state: {
      date: "2026-07-17",
      last_triggered_at: null,
      counters: {
        stress: 0,
        anxiety: 0,
        joy: 0,
        happiness: 0,
        pride: 0,
        focus: 0
      }
    }
  };

  const todayStr = "2026-07-17";
  let now = new Date("2026-07-17T12:00:00Z");

  // Test Scenario 1: Casual Message (no signal)
  console.log("\n--- Scenario 1: Casual Message ---");
  const signal1 = { hasSignal: false, signalType: 'none', intensity: 0 };
  const res1 = evaluateSignalTrigger(mockDb, signal1, now, todayStr);
  console.log("Result shouldFire:", res1.shouldFire, "Reason:", res1.reason);
  console.log("Counters:", mockDb.signal_state.counters);

  // Test Scenario 2: First Stress message (intensity 7)
  console.log("\n--- Scenario 2: First Stress Message (Intensity 7) ---");
  const signal2 = { hasSignal: true, signalType: 'stress', intensity: 7 };
  const res2 = evaluateSignalTrigger(mockDb, signal2, now, todayStr);
  console.log("Result shouldFire:", res2.shouldFire, "Reason:", res2.reason);
  console.log("Counters:", mockDb.signal_state.counters);

  // Test Scenario 3: Second Stress message (intensity 8)
  console.log("\n--- Scenario 3: Second Stress Message (Intensity 8) ---");
  const signal3 = { hasSignal: true, signalType: 'stress', intensity: 8 };
  const res3 = evaluateSignalTrigger(mockDb, signal3, now, todayStr);
  console.log("Result shouldFire:", res3.shouldFire, "Reason:", res3.reason);
  console.log("Counters:", mockDb.signal_state.counters);

  // Test Scenario 4: Third Stress message (intensity 6) -> Counter goes to 21 -> Should Fire!
  console.log("\n--- Scenario 4: Third Stress Message (Intensity 6) ---");
  const signal4 = { hasSignal: true, signalType: 'stress', intensity: 6 };
  const res4 = evaluateSignalTrigger(mockDb, signal4, now, todayStr);
  console.log("Result shouldFire:", res4.shouldFire, "Reason:", res4.reason);
  console.log("Counters:", mockDb.signal_state.counters);
  console.log("Last Triggered At:", mockDb.signal_state.last_triggered_at);

  // Test Scenario 5: Fourth Stress message (intensity 8) but within 5 minutes -> Should block on cooldown
  console.log("\n--- Scenario 5: Stress Message 5 Mins Later (Cooldown check) ---");
  now = new Date("2026-07-17T12:05:00Z");
  // Accumulator should increase because we evaluate and add the intensity to counters first
  const signal5 = { hasSignal: true, signalType: 'stress', intensity: 8 };
  const res5 = evaluateSignalTrigger(mockDb, signal5, now, todayStr);
  console.log("Result shouldFire:", res5.shouldFire, "Reason:", res5.reason);
  console.log("Counters:", mockDb.signal_state.counters);

  // Test Scenario 6: Test prompt stripping of environmental and landmark context
  console.log("\n--- Scenario 6: Generate Contextual Action & Validate Prompt Sanitization ---");
  // Fill chat history with some stressful context
  mockDb.chat_history.push({ sender: 'User', text: "I have a massive presentation in 1 hour and my boss is breathing down my neck." });
  mockDb.chat_history.push({ sender: 'AUM', text: "Deep breath. We can get through this." });
  mockDb.chat_history.push({ sender: 'User', text: "I'm so stressed out, I don't know where to start." });

  console.log("Calling generateSingleContextualAction with signalType=stress...");
  const action = await generateSingleContextualAction(mockDb, "stress");
  console.log("Generated Action:", JSON.stringify(action, null, 2));

  // Check for violations
  const violations = ["weather", "aqi", "traffic", "gurgaon", "cyberhub", "clear", "moderate", "rainy", "pollution"];
  let violated = false;
  const whyTodayLower = (action.whyToday || "").toLowerCase();
  
  for (const keyword of violations) {
    if (whyTodayLower.includes(keyword)) {
      console.log(`❌ VIOLATION FOUND: whyToday contains the forbidden environmental keyword "${keyword}"!`);
      violated = true;
    }
  }

  if (!violated) {
    console.log("✅ SUCCESS: no environmental context found in generated action explanations!");
  }

  console.log("\n=== TESTS COMPLETED ===");
}

runTests().catch(console.error);
