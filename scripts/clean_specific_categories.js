// scripts/clean_specific_categories.js
const fs = require('fs');
const path = require('path');
const libraryPath = path.resolve(__dirname, '../data/tasks_library.json');

// Mapping of invalid categories to a valid one
const categoryMap = {
  'Self-Care': 'Recovery',
  'Nutrition': 'Recovery',
  'Sexual/Sensory': 'Sensory/Experiential'
};

function cleanSpecific() {
  const raw = fs.readFileSync(libraryPath, 'utf8');
  const tasks = JSON.parse(raw);
  let changed = 0;
  tasks.forEach(t => {
    if (!t.category) return;
    const mapped = categoryMap[t.category];
    if (mapped) {
      t.category = mapped;
      changed++;
    }
  });
  console.log(`Reassigned ${changed} task categories`);
  fs.writeFileSync(libraryPath, JSON.stringify(tasks, null, 2), 'utf8');
}

cleanSpecific();
