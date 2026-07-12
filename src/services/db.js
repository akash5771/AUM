import fs from 'fs/promises';
import path from 'path';
// Helper to determine target user database dynamically
export async function getUserId() {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const userId = cookieStore.get('aum_user_id')?.value;
    return userId || 'default';
  } catch (e) {
    // Outside request context (e.g. running scripts, tests)
    return 'default';
  }
}

export async function getDbPath() {
  const userId = await getUserId();
  return path.join(process.cwd(), 'data', `db_${userId}.json`);
}

// Default database structure
const DEFAULT_DB = {
  profile: {
    name: "",
    age: "",
    gender: "",
    job: "",
    workHours: "",
    workDays: 5,
    maritalStatus: "",
    kids: 0,
    active_goal: { category: "Health", subGoal: "Sleep Better" },
    current_chapter: "Stable Routine",
    financial_stance: "balanced",
    relationships: [],
    streak: 0,
    completion_rate: 0,
    total_actions_generated: 0,
    total_actions_completed: 0,
    archetype: "The Rebuilder",
    momentum_score: 50,
    momentum_earned_today: 0,
    active_threads: [],
    location_profile: {
      home_base: { city: "Gurgaon", neighborhood: "DLF Phase 3", lat: 28.49, lng: 77.09 },
      work_base: { city: "Gurgaon", neighborhood: "Cyber City" },
      comfort_radius: 30,
      travel_mode: false,
      travel_city: ""
    },
    sub_scores: { recovery: 50, execution: 50, connection: 50, curiosity: 50, courage: 50, consistency: 50 },
    behavioral_dna: { stress_resilience_factor: 1.0, preferred_recovery_categories: ["Recovery"], weekend_activity_multiplier: 1.0 },
    failure_repository: [],
    effectiveness_ledger: [],
    identity_evolution: [],
    intentional_days_count: 0,
    intentional_days_rate: 0,
    last_recommended_timestamps: {},
    companion_name: "Aarav",
    onboarding_completed: false
  },
  context: {
    sleep: { hours: 7.0, quality: "good" },
    mood: { rating: 5, state: "clear" },
    energies: { mental: 7, physical: 7, social: 7, creative: 7 },
    creation_story: "",
    consumption_story: "",
    creation_minutes: 0,
    consumption_minutes: 0,
    is_frozen: false,
    last_logged: ""
  },
  actions: [],
  backups: [],
  chat_history: [],
  semantic_memory: [],
  recent_summaries: [],
  insights: {
    behavioral_insights: [],
    current_risks: [],
    current_wins: [],
    current_experiments: []
  },
  history: [], // Capped 90-day progress history ledger
  virtual_time: null // Holds the virtual time override ISO string
};

// Ensure the data directory exists
async function ensureDir() {
  try {
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

// Read the database, creating default if missing
export async function readDB() {
  await ensureDir();
  const dbPath = await getDbPath();
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    const parsed = JSON.parse(data);
    
    // Merge schema to handle older structures cleanly
    const merged = { ...DEFAULT_DB, ...parsed };
    merged.profile = { ...DEFAULT_DB.profile, ...parsed.profile };
    merged.context = { ...DEFAULT_DB.context, ...parsed.context };
    if (!merged.insights) merged.insights = { ...DEFAULT_DB.insights };
    if (!merged.actions) merged.actions = [];
    if (!merged.backups) merged.backups = [];
    if (!merged.recent_summaries) merged.recent_summaries = [];
    if (!merged.chat_history) merged.chat_history = [];
    if (!merged.semantic_memory) merged.semantic_memory = [];
    if (!merged.history) merged.history = [];
    return merged;
  } catch (err) {
    await writeDB(DEFAULT_DB);
    return DEFAULT_DB;
  }
}

// Write the database
export async function writeDB(db) {
  await ensureDir();
  const dbPath = await getDbPath();
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

// Get the current virtual or system time
export function getDbCurrentTime(db) {
  if (db && db.virtual_time) {
    return new Date(db.virtual_time);
  }
  return new Date();
}

// Update profile fields
export async function updateProfile(updates) {
  const db = await readDB();
  db.profile = { ...db.profile, ...updates };
  await writeDB(db);
  return db.profile;
}

// Update context fields
export async function updateContext(updates) {
  const db = await readDB();
  db.context = { ...db.context, ...updates };
  await writeDB(db);
  return db.context;
}

// Add XP and process leveling (100 XP per level, min level 0, supports leveling down)
export async function addXp(amount) {
  const db = await readDB();
  let currentLevel = db.profile.level || 0;
  let currentXp = db.profile.xp || 0;
  let levelUpOccurred = false;

  currentXp += amount;

  while (currentXp >= 100) {
    currentLevel += 1;
    currentXp -= 100;
    levelUpOccurred = true;
    db.profile.level_up_celebration_pending = true;
  }

  while (currentXp < 0) {
    if (currentLevel > 0) {
      currentLevel -= 1;
      currentXp += 100;
    } else {
      currentXp = 0;
      break;
    }
  }

  // Update milestones if they leveled up
  if (levelUpOccurred) {
    const timestamp = getDbCurrentTime(db).toISOString();
    db.profile.milestones.push({
      type: "level_up",
      text: `Reached Level ${currentLevel}`,
      date: timestamp.split('T')[0]
    });
  }

  db.profile.level = currentLevel;
  db.profile.xp = currentXp;

  await writeDB(db);
  return { level: currentLevel, xp: currentXp, levelUpOccurred };
}

// Real-time Momentum Calculator helper
export async function updateRealtimeMomentum(db) {
  // Safe write-sync, rolling momentum score is updated dynamically
  await writeDB(db);
}

export function calculateTaskPoints(task, db) {
  const difficulty = task.difficulty || 2;
  const friction = task.friction_score !== undefined ? task.friction_score : difficulty;
  const impact = task.impact_score !== undefined ? task.impact_score : 5;
  const recovery = task.recovery_score !== undefined ? task.recovery_score : 2;
  const identity = task.identity_score !== undefined ? task.identity_score : 5;
  const novelty = task.novelty_score !== undefined ? task.novelty_score : 3;
  const multiplier = task.momentum_multiplier !== undefined ? task.momentum_multiplier : 1.0;

  const stress = db.context.mood?.rating || 5;
  const energy = db.context.sleep?.energy || 5;

  let rawPoints = impact;

  // Context-based scaling
  if (stress >= 7 || energy <= 4) {
    if (task.category === "Recovery" || recovery >= 6) {
      rawPoints += (stress * 1.2) + (5 - energy);
    }
  }

  if (energy >= 8 && stress < 5) {
    if (friction >= 5 || task.category === "Creative" || novelty >= 6) {
      rawPoints += (energy - 5) + friction * 0.5;
    }
  }

  rawPoints = rawPoints * multiplier;
  return Math.min(25, Math.max(1, Math.round(rawPoints * 10) / 10));
}

export function applyMomentumDelta(db, rawPoints, isAddition = true) {
  const profile = db.profile || {};
  
  let delta = rawPoints * 0.15;
  delta = Math.min(5.0, Math.max(0.2, delta));
  
  if (isAddition) {
    profile.momentum_earned_today = Math.round(((profile.momentum_earned_today || 0) + rawPoints) * 10) / 10;
    profile.momentum_score = Math.min(100, (profile.momentum_score || 50) + delta);
  } else {
    profile.momentum_earned_today = Math.max(0, Math.round(((profile.momentum_earned_today || 0) - rawPoints) * 10) / 10);
    profile.momentum_score = Math.max(0, (profile.momentum_score || 50) - delta);
  }
  profile.momentum_score = Math.round(profile.momentum_score);
}

// Toggle action status
export async function toggleActionStatus(actionId, status) {
  const db = await readDB();
  let statusChanged = false;
  let oldStatus = 'todo';
  let matchedAction = null;

  if (Array.isArray(db.actions)) {
    db.actions = db.actions.map(act => {
      if (act.id === actionId) {
        if (act.status !== status) {
          oldStatus = act.status;
          statusChanged = true;
          matchedAction = act;
        }
        return { ...act, status };
      }
      return act;
    });
  }

  if (statusChanged && matchedAction) {
    let completedDiff = 0;
    if (status === 'done') {
      completedDiff = 1;
      
      // Calculate dynamic points and store them
      const rawPoints = calculateTaskPoints(matchedAction, db);
      db.actions = db.actions.map(act => act.id === actionId ? { ...act, raw_points: rawPoints } : act);
      applyMomentumDelta(db, rawPoints, true);

    } else if (oldStatus === 'done' && (status === 'todo' || status === 'skipped')) {
      completedDiff = -1;
      
      // Revert dynamic points
      const rawPoints = matchedAction.raw_points || 5.0; // fallback if missing
      applyMomentumDelta(db, rawPoints, false);
      db.actions = db.actions.map(act => act.id === actionId ? { ...act, raw_points: undefined } : act);
    }

    db.profile.total_actions_completed = Math.max(0, (db.profile.total_actions_completed || 0) + completedDiff);
    
    // Add default rating of 4 stars to ledger if done
    if (status === 'done') {
      const todayStr = getMomentumDayString(getDbCurrentTime(db));
      const stress = db.context.mood?.rating || 5;
      const lastLog = db.history.slice(-1)[0] || {};
      const stressBefore = lastLog.stress || 5;
      const stressDelta = stress - stressBefore;

      db.profile.effectiveness_ledger = db.profile.effectiveness_ledger || [];
      db.profile.effectiveness_ledger.push({
        actionId,
        rating: 4, // Default to 4-star, can be updated by rateAction
        date: todayStr,
        stressDelta,
        completed: true
      });

      // Update last recommended timestamp
      db.profile.last_recommended_timestamps = db.profile.last_recommended_timestamps || {};
      db.profile.last_recommended_timestamps[actionId] = getDbCurrentTime(db).toISOString();
    }

    await writeDB(db);
  }

  // Re-read DB
  const freshDb = await readDB();
  const total = freshDb.profile.total_actions_generated || 0;
  const completed = freshDb.profile.total_actions_completed || 0;
  freshDb.profile.completion_rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  await writeDB(freshDb);
  return freshDb;
}

// Save specific task star ratings
export async function rateAction(actionId, rating) {
  const db = await readDB();
  
  // Find in actions
  db.actions = (db.actions || []).map(act => {
    if (act.id === actionId) {
      return { ...act, rating };
    }
    return act;
  });

  // Find and update inside effectiveness ledger for the current day
  const todayStr = getMomentumDayString(getDbCurrentTime(db));
  db.profile.effectiveness_ledger = db.profile.effectiveness_ledger || [];
  
  let ledgerUpdated = false;
  db.profile.effectiveness_ledger = db.profile.effectiveness_ledger.map(log => {
    if (log.actionId === actionId && log.date === todayStr) {
      ledgerUpdated = true;
      return { ...log, rating };
    }
    return log;
  });

  if (!ledgerUpdated) {
    const stress = db.context.mood?.rating || 5;
    const lastLog = db.history.slice(-1)[0] || {};
    const stressBefore = lastLog.stress || 5;
    const stressDelta = stress - stressBefore;

    db.profile.effectiveness_ledger.push({
      actionId,
      rating,
      date: todayStr,
      stressDelta,
      completed: true
    });
  }

  await writeDB(db);
  await updateRealtimeMomentum(db);
  return await readDB();
}

// Add a chat message
export async function addChatMessage(sender, text) {
  const db = await readDB();
  db.chat_history.push({
    sender,
    text,
    timestamp: getDbCurrentTime(db).toISOString()
  });
  await writeDB(db);
}

// Add a memory entry
export async function addMemory(text, category) {
  const db = await readDB();
  const id = `m${db.semantic_memory.length + 1}`;
  db.semantic_memory.push({
    id,
    text,
    category,
    date: getDbCurrentTime(db).toISOString().split('T')[0]
  });
  await writeDB(db);
}

// Helper to determine if we crossed the 6 AM day boundary between oldTime and newTime
export function hasCrossed6AM(oldTimeStr, newTimeStr) {
  if (!oldTimeStr || !newTimeStr) return false;
  const oldTime = new Date(oldTimeStr);
  const newTime = new Date(newTimeStr);
  
  if (newTime <= oldTime) return false;
  
  // Find the next 6 AM boundary after oldTime
  const next6AM = new Date(oldTime);
  if (next6AM.getHours() < 6) {
    next6AM.setHours(6, 0, 0, 0);
  } else {
    next6AM.setDate(next6AM.getDate() + 1);
    next6AM.setHours(6, 0, 0, 0);
  }
  
  // If the next 6 AM boundary is less than or equal to newTime, a boundary was crossed
  return next6AM <= newTime;
}

// Process day transition: reset trackers, compile summaries, correlations, and update rolling momentum
export async function processDayTransition(db) {
  // Dynamically import orchestrator and gemini to avoid circular imports
  const { orchestrateDayTransition } = await import('./day_transition.js');
  const { queryGemini } = await import('./gemini.js');

  const transitionSummary = await orchestrateDayTransition(db, queryGemini);
  return transitionSummary;
}

// Get the momentum day string (shifting date back by 1 if before 6 AM)
export function getMomentumDayString(date) {
  const d = new Date(date);
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}


