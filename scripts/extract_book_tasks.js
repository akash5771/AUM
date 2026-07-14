const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables from .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

// Helper to query Groq
async function queryGroq(prompt, model = "llama-3.3-70b-versatile") {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set. Please check your .env.local file.");
  }

  let attempt = 0;
  const maxAttempts = 5;
  let delay = 15000; // start with 15s delay

  while (attempt < maxAttempts) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          response_format: { type: "json_object" }
        })
      });

      if (response.status === 429) {
        attempt++;
        console.warn(`Rate limit reached (429). Retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // double the wait time
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API returned status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const textOutput = result.choices[0].message.content;
      return JSON.parse(textOutput);
    } catch (err) {
      if (attempt >= maxAttempts - 1) {
        throw err;
      }
      attempt++;
      console.warn(`Request failed: ${err.message}. Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Max retries exceeded for Groq query.");
}

// Generate a safe unique ID based on category and existing IDs
function generateTaskId(category, existingTasks) {
  const prefix = `lib_${category.toLowerCase()}_`;
  let maxNum = 0;
  existingTasks.forEach(task => {
    if (task.id && task.id.startsWith(prefix)) {
      const parts = task.id.split('_');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });
  return `${prefix}${maxNum + 1}`;
}

async function main() {
  const args = process.argv.slice(2);
  const book = getArgValue(args, '--book');
  const author = getArgValue(args, '--author') || 'Unknown';
  const pdfPath = getArgValue(args, '--pdf');
  const dryRun = args.includes('--dry-run');
  const model = getArgValue(args, '--model') || 'qwen/qwen3-32b'; // default to Qwen
  const limitChunksVal = getArgValue(args, '--limit-chunks');
  const limitChunks = limitChunksVal ? parseInt(limitChunksVal, 10) : null;

  if (!book || !pdfPath) {
    console.error("Usage: node scripts/extract_book_tasks.js --book \"Book Name\" --pdf \"/path/to/book.pdf\" [--author \"Author\"] [--dry-run] [--model \"model-name\"] [--limit-chunks <num>]");
    process.exit(1);
  }

  const absolutePdfPath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePdfPath)) {
    console.error(`Error: PDF file not found at ${absolutePdfPath}`);
    process.exit(1);
  }

  console.log(`Starting extraction for book: "${book}" by ${author}`);
  console.log(`PDF Path: ${absolutePdfPath}`);
  console.log(`Dry-run mode: ${dryRun ? 'ON' : 'OFF'}`);
  console.log(`Model: ${model}`);
  if (limitChunks) {
    console.log(`Chunk Limit: ${limitChunks}`);
  }

  // Dynamic import of pdf-parse
  let PDFParse;
  try {
    const imported = require('pdf-parse');
    PDFParse = imported.PDFParse;
  } catch (e) {
    console.error("Error: 'pdf-parse' package is not installed. Trying to install or proceed...");
    process.exit(1);
  }

  const dataBuffer = fs.readFileSync(absolutePdfPath);
  console.log("Parsing PDF text...");
  const parser = new PDFParse({ data: dataBuffer });
  const result = await parser.getText();
  await parser.destroy();
  const rawText = result.text;
  console.log(`PDF Parsed successfully. Total character length: ${rawText.length}`);

  // Chunk text: ~8000 characters per chunk, 1000 character overlap
  const chunkSize = 8000;
  const overlap = 1000;
  let chunks = [];
  let index = 0;
  while (index < rawText.length) {
    chunks.push(rawText.substring(index, index + chunkSize));
    index += chunkSize - overlap;
  }

  if (limitChunks && limitChunks < chunks.length) {
    console.log(`Limiting chunks from ${chunks.length} to the first ${limitChunks}.`);
    chunks = chunks.slice(0, limitChunks);
  }

  console.log(`Split text into ${chunks.length} chunks. Sending to Groq...`);

  const libraryPath = path.join(__dirname, '..', 'data', 'tasks_library.json');
  let existingTasks = [];
  if (fs.existsSync(libraryPath)) {
    try {
      existingTasks = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
    } catch (e) {
      console.warn("Could not load existing tasks library, starting fresh.", e);
    }
  }

  const extractedTasks = [];

  for (let i = 0; i < chunks.length; i++) {
    // Add a 2-second sleep between requests to play nice with rate limits
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
    const prompt = `You are an expert wellness coach and behavioral scientist building a task library for AUM.
BOOK: ${book} by ${author}
SOURCE TEXT:
---
${chunks[i]}
---

Extract every SPECIFIC, named technique or exercise from the source text.
Sticking strict to the rules:
1. MAX 10 minutes to complete if difficulty <= 3
2. Must be doable at a desk/office if difficulty is 1 or 2
3. Use the book's EXACT technique name
4. If this chunk has no specific doable technique, output: {"tasks": []}
5. Do not invent techniques not in the text

Output a JSON object matching this schema. Note: Do NOT copy the description string values literally. You must generate the actual custom texts based on the SOURCE TEXT above!

{
  "tasks": [
    {
      "text": "<Generate a concise one-line action sentence for the task, maximum 12 words. Example: 'Practice Nadi Shodhana alternate nostril breathing for 3 minutes.'>",
      "category": "Breathwork|Movement|Mindset|Journaling|Manifestation|Learning|Sensory/Experiential|Social|Recovery|Spiritual",
      "source_book": "${book}",
      "difficulty": 1-5,
      "defaultWhyToday": "<Write a 1-sentence description explaining why this is urgent or helpful TODAY for a stressed or tired professional.>",
      "defaultWhyRelevant": "<Write a 1-2 sentence description explaining the scientific or psychological mechanism behind the technique, naming specific body systems or cognitive processes involved.>",
      "defaultHowTo": "<Write a 3-5 sentence step-by-step instruction explaining exactly how to execute this technique. Be extremely specific and clear.>",
      "specifics_hint": "breathing_technique|music_track|ted_talk|yoga_pose|local_experience|podcast_episode|book_chapter|affirmation|journal_prompt|experiment",
      "friction_score": 1-10,
      "impact_score": 1-10,
      "recovery_score": 1-10,
      "identity_score": 1-10,
      "novelty_score": 1-10,
      "momentum_multiplier": 1.0-2.5
    }
  ]
}

Return ONLY raw JSON matching this format. No markdown fences, no extra notes.`;

    try {
      const responseObj = await queryGroq(prompt, model);
      if (responseObj && Array.isArray(responseObj.tasks)) {
        console.log(`Extracted ${responseObj.tasks.length} tasks from chunk ${i + 1}.`);
        responseObj.tasks.forEach(t => {
          extractedTasks.push(t);
        });
      }
    } catch (e) {
      console.error(`Error processing chunk ${i + 1}: ${e.message}`);
    }
  }

  console.log(`\nExtraction finished. Total extracted tasks: ${extractedTasks.length}`);

  if (extractedTasks.length === 0) {
    console.log("No tasks extracted. Exiting.");
    process.exit(0);
  }

  // Assign IDs and format
  const validatedTasks = extractedTasks.map(t => {
    // Basic verification and fallback values
    const cat = t.category || 'Mindset';
    return {
      id: generateTaskId(cat, existingTasks.concat(extractedTasks)),
      text: t.text || 'Perform technique.',
      category: cat,
      difficulty: Number(t.difficulty) || 2,
      source_book: book,
      defaultWhyToday: t.defaultWhyToday || 'Reset your focus and energy.',
      defaultWhyRelevant: t.defaultWhyRelevant || 'Maintains nervous system balance.',
      defaultHowTo: t.defaultHowTo || 'Follow the technique guidelines.',
      specifics_hint: t.specifics_hint || 'journal_prompt',
      friction_score: Number(t.friction_score) || 3,
      impact_score: Number(t.impact_score) || 5,
      recovery_score: Number(t.recovery_score) || 5,
      identity_score: Number(t.identity_score) || 5,
      novelty_score: Number(t.novelty_score) || 5,
      momentum_multiplier: Number(t.momentum_multiplier) || 1.0
    };
  });

  // Display dry-run preview
  console.log("\n--- Preview of Extracted Tasks ---");
  validatedTasks.slice(0, 5).forEach((t, idx) => {
    console.log(`[Preview ${idx + 1}] ID: ${t.id} | Category: ${t.category} | Diff: ${t.difficulty}`);
    console.log(`Text: ${t.text}`);
    console.log(`HowTo: ${t.defaultHowTo}`);
    console.log("-----------------------------------------");
  });
  if (validatedTasks.length > 5) {
    console.log(`... and ${validatedTasks.length - 5} more tasks.`);
  }

  if (dryRun) {
    console.log("\nDry-run mode complete. No files were modified.");
    process.exit(0);
  }

  const autoConfirm = args.includes('--yes');

  if (autoConfirm) {
    const merged = existingTasks.concat(validatedTasks);
    fs.writeFileSync(libraryPath, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`Successfully merged ${validatedTasks.length} tasks! Total library size: ${merged.length}`);
    process.exit(0);
  }

  // Ask for confirmation to merge
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(`\nDo you want to merge these ${validatedTasks.length} tasks into tasks_library.json? (y/n): `, (answer) => {
    rl.close();
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes' || answer === '') {
      const merged = existingTasks.concat(validatedTasks);
      fs.writeFileSync(libraryPath, JSON.stringify(merged, null, 2), 'utf8');
      console.log(`Successfully merged ${validatedTasks.length} tasks! Total library size: ${merged.length}`);
    } else {
      console.log("Merge cancelled. No changes made.");
    }
  });
}

function getArgValue(args, key) {
  const idx = args.indexOf(key);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
