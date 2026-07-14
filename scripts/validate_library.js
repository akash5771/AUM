const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = [
  'id', 'text', 'category', 'difficulty', 'defaultWhyToday',
  'defaultWhyRelevant', 'defaultHowTo', 'friction_score',
  'impact_score', 'recovery_score', 'identity_score',
  'novelty_score', 'momentum_multiplier', 'specifics_hint'
];

const VALID_CATEGORIES = [
  'Breathwork', 'Movement', 'Mindset', 'Journaling', 'Manifestation',
  'Learning', 'Sensory/Experiential', 'Social', 'Recovery', 'Spiritual'
];

function validateLibrary() {
  const libraryPath = path.join(__dirname, '..', 'data', 'tasks_library.json');
  console.log(`Loading task library from: ${libraryPath}`);
  
  if (!fs.existsSync(libraryPath)) {
    console.error('Error: tasks_library.json not found!');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(libraryPath, 'utf8');
  let tasks;
  try {
    tasks = JSON.parse(fileContent);
  } catch (e) {
    console.error('Error: Failed to parse tasks_library.json as JSON.', e);
    process.exit(1);
  }

  console.log(`Total tasks found: ${tasks.length}`);
  console.log('--------------------------------------------------');

  const errors = [];
  const warnings = [];
  const categoryCounts = {};
  const difficultyCoverage = {}; // cat -> Set of difficulties (1..5)
  const techniqueNames = new Set();
  const duplicateTechniques = new Set();

  VALID_CATEGORIES.forEach(cat => {
    categoryCounts[cat] = 0;
    difficultyCoverage[cat] = new Set();
  });

  tasks.forEach((task, index) => {
    const taskIdentifier = task.id || `Index_${index}`;
    
    // 1. Check required fields
    REQUIRED_FIELDS.forEach(field => {
      if (task[field] === undefined || task[field] === null || task[field] === '') {
        errors.push(`Task ${taskIdentifier}: Missing required field "${field}"`);
      }
    });

    // 2. Validate category
    if (task.category) {
      if (!VALID_CATEGORIES.includes(task.category)) {
        errors.push(`Task ${taskIdentifier}: Invalid category "${task.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
      } else {
        categoryCounts[task.category]++;
        if (task.difficulty) {
          difficultyCoverage[task.category].add(Number(task.difficulty));
        }
      }
    }

    // 3. Validate difficulty range
    if (task.difficulty !== undefined) {
      const diff = Number(task.difficulty);
      if (isNaN(diff) || diff < 1 || diff > 5) {
        errors.push(`Task ${taskIdentifier}: Invalid difficulty "${task.difficulty}". Must be 1-5.`);
      }
    }

    // 4. Validate office-safety for D1-D2 difficulty tasks
    if (task.difficulty === 1 || task.difficulty === 2) {
      if (task.requires_gym) {
        errors.push(`Task ${taskIdentifier} (D${task.difficulty}): Hard requirement for gym but difficulty is <= 2 (should be office-safe).`);
      }
      if (task.weather_restricted) {
        warnings.push(`Task ${taskIdentifier} (D${task.difficulty}): Weather restricted but difficulty is <= 2 (should ideally be office-safe/indoor).`);
      }
    }

    // 5. Check for duplicate techniques (by reading title/text)
    if (task.text) {
      const normalizedText = task.text.toLowerCase().trim();
      if (techniqueNames.has(normalizedText)) {
        duplicateTechniques.add(task.text);
      } else {
        techniqueNames.add(normalizedText);
      }
    }
  });

  // Check overall count
  if (tasks.length < 300) {
    warnings.push(`Overall task library size is ${tasks.length}. Plan recommends 300+ entries.`);
  }

  // Check per-category minimums and D1-D5 coverage
  VALID_CATEGORIES.forEach(cat => {
    const count = categoryCounts[cat];
    if (count < 30) {
      warnings.push(`Category "${cat}" has only ${count} tasks (Plan recommends 30).`);
    }
    
    // Check D1-D5 difficulty coverage
    const missingDiffs = [];
    for (let d = 1; d <= 5; d++) {
      if (!difficultyCoverage[cat].has(d)) {
        missingDiffs.push(d);
      }
    }
    if (missingDiffs.length > 0) {
      errors.push(`Category "${cat}": Missing D1-D5 coverage for difficulty levels: ${missingDiffs.join(', ')}`);
    }
  });

  // Report results
  if (duplicateTechniques.size > 0) {
    warnings.push(`Duplicate technique texts found:\n  - ${Array.from(duplicateTechniques).join('\n  - ')}`);
  }

  console.log('\n--- Validation Summary ---');
  console.log(`Errors found: ${errors.length}`);
  console.log(`Warnings found: ${warnings.length}`);
  
  console.log('\n--- Category Distribution ---');
  VALID_CATEGORIES.forEach(cat => {
    const coverage = Array.from(difficultyCoverage[cat]).sort().join(',');
    console.log(`- ${cat}: ${categoryCounts[cat]} tasks (Diff Coverage: [${coverage}])`);
  });

  if (errors.length > 0) {
    console.error('\n❌ Validation Failed with the following Errors:');
    errors.forEach(err => console.error(`  * ${err}`));
  } else {
    console.log('\n✅ Validation Passed! No errors found.');
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️ Warnings / Suggestions:');
    warnings.forEach(warn => console.warn(`  * ${warn}`));
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

validateLibrary();
