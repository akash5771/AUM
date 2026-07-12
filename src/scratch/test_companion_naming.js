import { generateCompanionNameService } from '../services/gemini.js';
import assert from 'assert';

async function runNamingTests() {
  console.log("=== RUNNING COMPANION NAMING ENGINE TESTS ===");

  // 1. Force offline to verify robust alphabetical fallback
  process.env.GEMINI_API_KEY = "";

  try {
    const testCases = [
      { input: "Akash", expected: "Aarav" },
      { input: "Sarah", expected: "Samar" },
      { input: "John", expected: "Jai" },
      { input: "Rohan", expected: "Rohan" },
      { input: "Mei", expected: "Manav" }
    ];

    for (const tc of testCases) {
      const result = await generateCompanionNameService(tc.input);
      console.log(`Input: "${tc.input}" -> Generated Companion Name: "${result}"`);
      assert.strictEqual(result, tc.expected, `Fallback naming failed for ${tc.input}`);
    }

    console.log("\n✅ ALL COMPANION NAMING TESTS PASSED!");
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err.message);
    throw err;
  }
}

runNamingTests();
