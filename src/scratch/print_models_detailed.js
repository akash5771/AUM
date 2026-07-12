async function printModelsDetailed() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    return;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.models) {
      console.log("=== SUPPORTED MODELS ===");
      data.models.forEach(m => {
        console.log(`- Name: ${m.name}`);
        console.log(`  Display: ${m.displayName}`);
        console.log(`  Supported Methods: ${m.supportedGenerationMethods.join(', ')}`);
      });
    } else {
      console.log("No models returned:", data);
    }
  } catch (err) {
    console.error(err);
  }
}

printModelsDetailed();
