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

const groqKey = process.env.GROQ_API_KEY;
const nvidiaKey = process.env.NVIDIA_API_KEY;

async function checkModel(name, provider, url, headers, body) {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body)
    });

    const duration = Date.now() - start;
    if (!response.ok) {
      const errText = await response.text();
      return {
        name,
        provider,
        healthy: false,
        error: `HTTP ${response.status}: ${errText.substring(0, 150)}`,
        duration
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || JSON.stringify(data);
    return {
      name,
      provider,
      healthy: true,
      duration,
      preview: content.trim().substring(0, 100).replace(/\n/g, ' ')
    };
  } catch (err) {
    return {
      name,
      provider,
      healthy: false,
      error: err.message,
      duration: Date.now() - start
    };
  }
}

async function run() {
  console.log("==================================================");
  console.log("          AUM MODEL HEALTH CHECKER                ");
  console.log("==================================================");
  console.log(`Groq API Key: ${groqKey ? 'PRESENT (ends with ' + groqKey.slice(-6) + ')' : 'MISSING'}`);
  console.log(`NVIDIA API Key: ${nvidiaKey ? 'PRESENT (ends with ' + nvidiaKey.slice(-6) + ')' : 'MISSING'}`);
  console.log("--------------------------------------------------\n");

  const results = [];

  // 1. Groq Model: llama-3.3-70b-versatile
  if (groqKey) {
    console.log("Testing Groq llama-3.3-70b-versatile...");
    const res = await checkModel(
      "llama-3.3-70b-versatile",
      "Groq",
      "https://api.groq.com/openai/v1/chat/completions",
      { 'Authorization': `Bearer ${groqKey}` },
      {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Ping! Say 'pong' in 1 word." }],
        max_tokens: 10
      }
    );
    results.push(res);
  } else {
    results.push({ name: "llama-3.3-70b-versatile", provider: "Groq", healthy: false, error: "API Key missing" });
  }

  // 2. NVIDIA Model: meta/llama-3.1-8b-instruct
  if (nvidiaKey) {
    console.log("Testing NVIDIA meta/llama-3.1-8b-instruct...");
    const res = await checkModel(
      "meta/llama-3.1-8b-instruct",
      "NVIDIA NIM",
      "https://integrate.api.nvidia.com/v1/chat/completions",
      { 'Authorization': `Bearer ${nvidiaKey}` },
      {
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: "Ping! Say 'pong' in 1 word." }],
        max_tokens: 10
      }
    );
    results.push(res);
  } else {
    results.push({ name: "meta/llama-3.1-8b-instruct", provider: "NVIDIA NIM", healthy: false, error: "API Key missing" });
  }

  // 3. NVIDIA Model: meta/llama-3.2-11b-vision-instruct
  if (nvidiaKey) {
    console.log("Testing NVIDIA meta/llama-3.2-11b-vision-instruct...");
    const res = await checkModel(
      "meta/llama-3.2-11b-vision-instruct",
      "NVIDIA NIM",
      "https://integrate.api.nvidia.com/v1/chat/completions",
      { 'Authorization': `Bearer ${nvidiaKey}` },
      {
        model: "meta/llama-3.2-11b-vision-instruct",
        messages: [{ role: "user", content: "Ping! Say 'pong' in 1 word." }],
        max_tokens: 10
      }
    );
    results.push(res);
  } else {
    results.push({ name: "meta/llama-3.2-11b-vision-instruct", provider: "NVIDIA NIM", healthy: false, error: "API Key missing" });
  }

  // 4. NVIDIA Model: deepseek-ai/deepseek-v4-flash
  if (nvidiaKey) {
    console.log("Testing NVIDIA deepseek-ai/deepseek-v4-flash...");
    const res = await checkModel(
      "deepseek-ai/deepseek-v4-flash",
      "NVIDIA NIM",
      "https://integrate.api.nvidia.com/v1/chat/completions",
      { 'Authorization': `Bearer ${nvidiaKey}` },
      {
        model: "deepseek-ai/deepseek-v4-flash",
        messages: [{ role: "user", content: "Ping! Say 'pong' in 1 word." }],
        max_tokens: 10
      }
    );
    results.push(res);
  } else {
    results.push({ name: "deepseek-ai/deepseek-v4-flash", provider: "NVIDIA NIM", healthy: false, error: "API Key missing" });
  }

  console.log("\n==================================================");
  console.log("                RESULTS SUMMARY                    ");
  console.log("==================================================");
  results.forEach(r => {
    const status = r.healthy ? "✅ HEALTHY" : "❌ UNHEALTHY";
    const time = r.duration ? `(${r.duration}ms)` : '';
    console.log(`- [${r.provider}] ${r.name}: ${status} ${time}`);
    if (r.healthy) {
      console.log(`  Response: "${r.preview}"`);
    } else {
      console.log(`  Error: ${r.error}`);
    }
    console.log("--------------------------------------------------");
  });
}

run();
