const apiKey = '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';

async function main() {
  console.log('Sending request to NVIDIA API...');
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-ai/deepseek-v4-pro',
        messages: [{ role: 'user', content: 'Explain quantum computing in one sentence.' }],
        temperature: 0.6,
        top_p: 0.7,
        max_tokens: 50,
        stream: false
      })
    });

    console.log('Response status:', response.status);
    if (!response.ok) {
      console.error('Error body:', await response.text());
      return;
    }

    const data = await response.json();
    console.log('Content:');
    console.log(data.choices?.[0]?.message?.content);
  } catch (err) {
    console.error('Network/fetch error:', err.message);
  }
}

main();
