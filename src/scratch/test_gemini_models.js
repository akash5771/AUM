async function testGeminiAlternativeModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key set in process.env");
    return;
  }
  
  const options = [
    { version: "v1beta", model: "gemini-1.5-flash-latest" },
    { version: "v1", model: "gemini-1.5-flash" },
    { version: "v1beta", model: "gemini-2.5-flash" }
  ];

  for (const opt of options) {
    const url = `https://generativelanguage.googleapis.com/${opt.version}/models/${opt.model}:generateContent?key=${apiKey}`;
    console.log(`\nTesting: ${opt.version} with model: ${opt.model}`);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hi" }] }]
        })
      });
      console.log(`Status: ${response.status}`);
      const bodyText = await response.text();
      console.log(`Response: ${bodyText.slice(0, 300)}...`);
    } catch (err) {
      console.error("Failed:", err);
    }
  }
}

testGeminiAlternativeModels();
