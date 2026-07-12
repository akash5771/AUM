import { queryGemini } from '../services/groq.js';
import fs from 'fs';
import path from 'path';

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
  console.warn("Could not load .env.local natively:", e);
}

async function runTest() {
  console.log("=== TESTING NVIDIA NIM DEEPSEEK INTEGRATION ===");
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    console.error("[ERROR] NVIDIA_API_KEY is not defined in .env.local.");
    process.exit(1);
  }
  console.log(`Using NVIDIA API Key ending in: ...${key.slice(-6)}`);

  try {
    console.log("\n--- TEST 1: Qwen Speed Mode (Fast Response) ---");
    const response1 = await queryGemini("Write a 5-word message greeting Akash.", false, 2, 1000, false);
    console.log("Response:", response1);

    console.log("\n--- TEST 2: Thinking Mode (High Reasoning Effort) ---");
    const response2 = await queryGemini("Explain why exercising reduces stress. Keep it to one short sentence.", false, 2, 1000, true);
    console.log("Response:", response2);

    console.log("\n--- TEST 3: JSON Mode Output ---");
    const response3 = await queryGemini(
      "Output a JSON object containing the fields 'success' (boolean) and 'message' (string). Respond with raw JSON.",
      true,
      2,
      1000,
      false
    );
    console.log("JSON Output:", response3);
    if (response3 && response3.success !== undefined) {
      console.log("[PASS] JSON successfully parsed!");
    } else {
      console.error("[FAIL] JSON structure invalid.");
    }
  } catch (e) {
    console.error("[FAIL] Integration test encountered an error:", e);
  }
}

runTest();
