async function testGeminiStandardModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key set in process.env");
    return;
  }
  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  console.log("Testing with standard model:", model);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Say hello!" }] }]
      })
    });
    const status = response.status;
    const bodyText = await response.text();
    console.log(`Response Status: ${status}`);
    console.log(`Response Body: ${bodyText}`);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testGeminiStandardModel();
