import { queryGemini } from '../services/gemini.js';

async function testGemini() {
  console.log("=== DIAGNOSING GEMINI CONNECTION ===");
  console.log("Using API Key:", process.env.GEMINI_API_KEY ? "CONFIGURED (starts with " + process.env.GEMINI_API_KEY.slice(0, 5) + ")" : "NOT CONFIGURED");

  try {
    const response = await queryGemini("Hello, reply with exactly the word 'SUCCESS' if you receive this.");
    console.log("Response from Gemini:", response);
  } catch (e) {
    console.error("Gemini API Call Failed:", e.message);
  }
}

testGemini();
