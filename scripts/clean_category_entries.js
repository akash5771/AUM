// scripts/clean_category_entries.js
const fs = require('fs');
const path = require('path');
const libraryPath = path.resolve(__dirname, '../data/tasks_library.json');

function normalizeCategory(cat) {
  const allowed = [
    'Breathwork', 'Movement', 'Mindset', 'Journaling',
    'Manifestation', 'Learning', 'Sensory/Experiential',
    'Social', 'Recovery', 'Spiritual'
  ];
  const parts = cat.split('|').map(p => p.trim()).filter(p => p);
  for (const p of parts) {
    if (allowed.includes(p)) return p;
  }
  return parts[0] || '';
}

function cleanLibrary() {
  const raw = fs.readFileSync(libraryPath, 'utf8');
  const tasks = JSON.parse(raw);
  let changed = 0;
  tasks.forEach(t => {
    if (!t.category) return;
    const cleaned = normalizeCategory(t.category);
    if (cleaned !== t.category) {
      t.category = cleaned;
      changed++;
    }
  });
  console.log(`Cleaned ${changed} task categories`);
  fs.writeFileSync(libraryPath, JSON.stringify(tasks, null, 2), 'utf8');
}

cleanLibrary();
