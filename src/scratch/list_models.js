async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key set in process.env");
    return;
  }
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  console.log("Listing models with URL:", url);
  try {
    const response = await fetch(url);
    const bodyText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${bodyText.slice(0, 1000)}...`);
  } catch (err) {
    console.error("Failed:", err);
  }
}

listModels();
