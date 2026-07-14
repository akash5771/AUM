const fs = require('fs');
const path = require('path');

function getNvidiaApiKey() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^NVIDIA_API_KEY\s*=\s*(.+)$/m);
      if (match) {
        return match[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (error) {}
  return null;
}

async function main() {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) {
    console.error('No API Key');
    process.exit(1);
  }
  
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      console.error('Error status:', response.status);
      console.error(await response.text());
      return;
    }
    
    const data = await response.json();
    const filteredModels = data.data.filter(m => m.id.toLowerCase().includes('llama') || m.id.toLowerCase().includes('deepseek'));
    console.log(filteredModels.map(m => m.id));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
