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

// Helper to query LLM (Groq or NVIDIA)
async function queryLLM(prompt, provider = "groq", model = null, forceJson = false) {
  let apiKey, baseUrl;
  if (provider === "nvidia") {
    apiKey = process.env.NVIDIA_API_KEY;
    baseUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    if (!model) model = "meta/llama-3.3-70b-instruct";
  } else {
    apiKey = process.env.GROQ_API_KEY;
    baseUrl = "https://api.groq.com/openai/v1/chat/completions";
    if (!model) model = "llama-3.3-70b-versatile";
  }

  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY is not set. Please check your .env.local file.`);
  }

  let attempt = 0;
  const maxAttempts = 5;
  let delay = 5000; // start with 5s delay

  while (attempt < maxAttempts) {
    try {
      const payload = {
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      };
      if (forceJson) {
        payload.response_format = { type: "json_object" };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        attempt++;
        console.warn(`Rate limit reached (429). Retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // double the wait time
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API returned status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const textOutput = result.choices[0].message.content;
      return forceJson ? JSON.parse(textOutput) : textOutput;
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
  throw new Error("Max retries exceeded for LLM query.");
}

// Helper to get Embedding from NVIDIA
async function getEmbedding(text, inputType = "passage") {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not set. Please check your .env.local file.");
  }

  const cleanedText = (text || '').trim();
  if (cleanedText.length === 0) {
    return null;
  }

  // Remove non-ASCII characters to prevent token inflation on non-Latin text (e.g. Devanagari)
  const asciiText = cleanedText.replace(/[^\x00-\x7F]/g, " ");
  // nv-embedqa-e5-v5 has a 512-token limit. Truncate to 800 characters to be safe.
  const safeText = asciiText.length > 800 ? asciiText.substring(0, 800) : asciiText;

  let attempt = 0;
  const maxAttempts = 5;
  let delay = 2000;

  while (attempt < maxAttempts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "nvidia/nv-embedqa-e5-v5",
          input: [safeText],
          input_type: inputType
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        attempt++;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA Embeddings API returned status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      return result.data[0].embedding;
    } catch (err) {
      if (attempt >= maxAttempts - 1) {
        throw err;
      }
      attempt++;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Max retries exceeded for embeddings query.");
}

// Concurrency helper for embeddings
async function getEmbeddingsForPages(pages, concurrency = 15) {
  const results = new Array(pages.length);
  let index = 0;

  async function worker() {
    while (index < pages.length) {
      const currentIdx = index++;
      const pageText = pages[currentIdx].text;
      try {
        results[currentIdx] = await getEmbedding(pageText, "passage");
      } catch (err) {
        console.error(`Error embedding page ${pages[currentIdx].num}: ${err.message}`);
        results[currentIdx] = null;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, pages.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// Local Cosine Similarity helper
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
  const provider = getArgValue(args, '--provider') || 'groq';
  
  let defaultModel = provider === 'nvidia' ? 'meta/llama-3.3-70b-instruct' : 'llama-3.1-8b-instant';
  const model = getArgValue(args, '--model') || defaultModel;
  
  const thresholdVal = getArgValue(args, '--threshold');
  const threshold = thresholdVal ? parseFloat(thresholdVal) : 0.35;

  if (!book || !pdfPath) {
    console.error("Usage: node scripts/extract_book_tasks.js --book \"Book Name\" --pdf \"/path/to/book.pdf\" [--author \"Author\"] [--provider nvidia|groq] [--model \"model-name\"] [--threshold <number>] [--dry-run] [--yes]");
    process.exit(1);
  }

  const absolutePdfPath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePdfPath)) {
    console.error(`Error: PDF file not found at ${absolutePdfPath}`);
    process.exit(1);
  }

  console.log(`Starting extraction for book: "${book}" by ${author}`);
  console.log(`PDF Path: ${absolutePdfPath}`);
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${model}`);
  console.log(`Threshold: ${threshold}`);
  console.log(`Dry-run mode: ${dryRun ? 'ON' : 'OFF'}`);

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
  
  if (!result || !Array.isArray(result.pages)) {
    console.error("Error: Failed to parse PDF pages array.");
    process.exit(1);
  }

  const totalPages = result.pages.length;
  console.log(`PDF Parsed successfully. Total pages: ${totalPages}`);

  // Pass 1: Compute indexPagesLimit or parse manual keywords
  const indexPagesLimit = Math.max(5, Math.ceil(totalPages * 0.05));
  let keywords = getArgValue(args, '--keywords');

  if (keywords) {
    console.log(`Bypassing Pass 1 Table of Contents scan. Using manually provided keywords: "${keywords}"`);
  } else {
    console.log(`Pass 1: Reading index pages (1 to ${indexPagesLimit}) for technique keywords...`);
    let indexPagesText = result.pages.slice(0, indexPagesLimit).map(p => p.text).join('\n');
    if (indexPagesText.length > 12000) {
      console.log(`Index text is too large (${indexPagesText.length} chars). Truncating to 12000 characters to stay under rate/token limits.`);
      indexPagesText = indexPagesText.substring(0, 12000);
    }
    const keywordPrompt = `You are a specialized behavioral science and wellness assistant. Analyze the following Table of Contents / Index / Intro text from the book "${book}" by "${author}":

---
${indexPagesText}
---

Extract a comma-separated list of 10-15 core technique keywords, Sanskrit terminology, or exercise types that are central to this book (e.g. Asana, Pranayama, Mudra, Bandha, Shatkarma, Kundalini). Return ONLY the comma-separated list of terms. Do not include any markdown formatting, explanations, numbering, or intro text.`;

    const keywordsOutput = await queryLLM(keywordPrompt, provider, model, false);
    keywords = keywordsOutput.trim();
    console.log(`Extracted Keywords: ${keywords}`);
  }

  // Build target query
  const targetQuery = `instructions on how to perform ${keywords}, step-by-step yogic exercises, physical execution steps`;
  console.log(`Target Query: "${targetQuery}"`);

  // Pass 2: Generate embedding for target query
  console.log("Generating embedding for target query...");
  const queryEmbedding = await getEmbedding(targetQuery, "query");

  const remainingPages = result.pages.slice(indexPagesLimit);
  console.log(`Generating embeddings for ${remainingPages.length} remaining pages...`);
  
  const pageEmbeddings = await getEmbeddingsForPages(remainingPages, 15);
  
  console.log("Computing similarity scores...");
  const matchedPages = [];
  for (let i = 0; i < remainingPages.length; i++) {
    const page = remainingPages[i];
    const embedding = pageEmbeddings[i];
    if (!embedding) continue;
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity >= threshold) {
      matchedPages.push({
        page,
        similarity
      });
    }
  }

  console.log(`\n--- Semantic Filtering Statistics ---`);
  console.log(`Total PDF Pages: ${totalPages}`);
  console.log(`Index Pages: ${indexPagesLimit}`);
  console.log(`Remaining Pages Filtered: ${remainingPages.length}`);
  console.log(`Threshold applied: ${threshold}`);
  console.log(`Matched Pages: ${matchedPages.length}`);

  if (matchedPages.length === 0) {
    console.log("No pages matched the similarity threshold. Exiting.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\nDry-run mode: Matching pages preview:");
    matchedPages.slice(0, 10).forEach(m => {
      console.log(`- Page ${m.page.num} (Similarity: ${m.similarity.toFixed(4)}): "${m.page.text.substring(0, 100).replace(/\n/g, ' ')}..."`);
    });
    if (matchedPages.length > 10) {
      console.log(`... and ${matchedPages.length - 10} more pages.`);
    }
    console.log("\nDry-run mode complete. No files were modified.");
    process.exit(0);
  }

  console.log(`\nStarting generation phase on ${matchedPages.length} matched pages...`);

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
  const delayMs = provider === 'nvidia' ? 1600 : 6500; // paced delay (1.6s for Nvidia, 6.5s for Groq to stay under TPM limits)

  for (let i = 0; i < matchedPages.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    const { page, similarity } = matchedPages[i];
    console.log(`[${i + 1}/${matchedPages.length}] Extracting tasks from page ${page.num} (Similarity: ${similarity.toFixed(4)})...`);

    const prompt = `You are an expert wellness coach and behavioral scientist building a task library for AUM.
BOOK: ${book} by ${author}
SOURCE TEXT (PAGE ${page.num}):
---
${page.text}
---

Extract every SPECIFIC, named technique or exercise from the source text.
Sticking strict to the rules:
1. MAX 10 minutes to complete if difficulty <= 3
2. Must be doable at a desk/office if difficulty is 1 or 2
3. Use the book's EXACT technique name
4. If this page has no specific doable technique, output: {"tasks": []}
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
      const responseObj = await queryLLM(prompt, provider, model, true);
      if (responseObj && Array.isArray(responseObj.tasks)) {
        console.log(`Extracted ${responseObj.tasks.length} tasks from page ${page.num}.`);
        responseObj.tasks.forEach(t => {
          extractedTasks.push(t);
        });
      }
    } catch (e) {
      console.error(`Error processing page ${page.num}: ${e.message}`);
    }
  }

  console.log(`\nExtraction finished. Total extracted tasks: ${extractedTasks.length}`);

  if (extractedTasks.length === 0) {
    console.log("No tasks extracted. Exiting.");
    process.exit(0);
  }

  // Assign IDs and format
  const validatedTasks = [];
  const tempAllTasks = [...existingTasks];

  extractedTasks.forEach(t => {
    const cat = t.category || 'Mindset';
    const validated = {
      id: generateTaskId(cat, tempAllTasks),
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
    validatedTasks.push(validated);
    tempAllTasks.push(validated);
  });

  // Display dry-run/preview
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
