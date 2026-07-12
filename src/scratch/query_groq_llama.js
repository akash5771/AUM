const fs = require('fs');
const path = require('path');

// Helper to get Groq API Key from .env.local
function getGroqApiKey() {
  if (process.env.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY;
  }
  
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^GROQ_API_KEY\s*=\s*(.+)$/m);
      if (match) {
        return match[1].trim().replace(/^["']|["']$/g, ''); // strip quotes
      }
    }
  } catch (error) {
    console.error('[Error] Failed to read .env.local:', error.message);
  }
  return null;
}

// Read input prompt (args, file, or stdin)
async function getPrompt() {
  const args = process.argv.slice(2);
  
  // Case 1: --file parameter
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = path.resolve(args[fileIdx + 1]);
    return fs.readFileSync(filePath, 'utf-8');
  }
  
  // Case 2: Direct argument
  if (args.length > 0 && !args[0].startsWith('-')) {
    return args.join(' ');
  }
  
  // Case 3: Read from stdin
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
    // If no data is coming in, resolve empty after 5 seconds to prevent hanging
    setTimeout(() => {
      if (!data) {
        resolve('');
      }
    }, 5000);
  });
}

async function main() {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    console.error('[Error] GROQ_API_KEY is not defined in process.env or .env.local');
    process.exit(1);
  }
  
  const prompt = await getPrompt();
  if (!prompt) {
    console.error('[Error] No prompt provided. Provide it as argument, via --file <path>, or via stdin.');
    process.exit(1);
  }
  
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const requestBody = {
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    top_p: 0.7,
    max_tokens: 4096,
    stream: false
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (content) {
      console.log(content);
    } else {
      console.error('[Error] No content returned in choices:', JSON.stringify(result));
    }
  } catch (error) {
    console.error('[Error] Request failed:', error.message);
    process.exit(1);
  }
}

main();
