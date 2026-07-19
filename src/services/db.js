import fs from 'fs/promises';
import path from 'path';
// Helper to determine target user database dynamically
export async function getUserId() {
  // Lock to the primary user's database for local development to prevent memory loss
  return 'a6b54c88-4bd6-45f6-8d64-ec1c5ba6398d';
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
    momentum_stage: "Stage 1: Activation",
    readiness_score: 5,
    pinned_mission: { title: "Lose 12% Body Fat", start_date: "2026-06-04" },
    rejection_ledger: [],
    last_greeting_date: "",
    birthday: "07-12",
    momentum_earned_today: 0,
    active_threads: [],
    location_profile: {
      home_base: { city: "Gurgaon", neighborhood: "DLF Phase 3", lat: 28.49, lng: 77.09 },
      work_base: { city: "Gurgaon", neighborhood: "Cyber City" },
      comfort_radius: 30,
      travel_mode: false,
      travel_city: ""
    },
    momentum_debt: 0,
    intervention_memory: [],
    sub_scores: { recovery: 50, execution: 50, connection: 50, curiosity: 50, courage: 50, consistency: 50 },
    behavioral_dna: { stress_resilience_factor: 1.0, preferred_recovery_categories: ["Recovery"], weekend_activity_multiplier: 1.0 },
    failure_repository: [],
    effectiveness_ledger: [],
    identity_evolution: [],
    intentional_days_count: 0,
    intentional_days_rate: 0,
    last_recommended_timestamps: {},
    rating_adjustments: {},
    companion_name: "Aarav",
    onboarding_completed: false,
    water_cups: 0
  },
  context: {
    sleep: { hours: 7.0, quality: "good", energy: 7 },
    mood: { rating: 5, state: "clear" },
    energies: { mental: 7, physical: 7, social: 7, creative: 7 },
    creation_story: "",
    consumption_story: "",
    creation_minutes: 0,
    consumption_minutes: 0,
    is_frozen: false,
    last_logged: "",
    checkin_stage: "completed"
  },
  actions: [],
  backups: [],
  chat_history: [],
  semantic_memory: [],
  recent_summaries: [],
  memory: {
    raw_chat: [], // Layer 1 (Capped 90 days)
    summaries: [], // Layer 2 (Forever)
    structured: { // Layer 3 (Forever until changed)
      identity: {},
      goals: [],
      projects: [],
      preferences: [],
      relationships: []
    },
    growth_signals: [], // Layer 4 (Forever)
    behavioral_dna: {}, // Layer 5 (Forever)
    timeline: [], // Layer 6 (Forever)
    outcome_memory: [] // Layer 7 (Forever)
  },
  insights: {
    behavioral_insights: [],
    current_risks: [],
    current_wins: [],
    current_experiments: []
  },
  history: [], // Capped 90-day progress history ledger
  virtual_time: null, // Holds the virtual time override ISO string
  signal_state: {
    date: "",
    last_triggered_at: null,
    pending_tasks: {},
    counters: {
      stress: 0,
      anxiety: 0,
      joy: 0,
      happiness: 0,
      pride: 0,
      focus: 0
    }
  }
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
    merged.signal_state = { ...DEFAULT_DB.signal_state, ...parsed.signal_state };
    if (!merged.signal_state.pending_tasks) merged.signal_state.pending_tasks = {};
    if (merged.signal_state && parsed.signal_state && parsed.signal_state.counters) {
      merged.signal_state.counters = { ...DEFAULT_DB.signal_state.counters, ...parsed.signal_state.counters };
    }
    
    // Merge memory sub-layer cleanly
    merged.memory = { ...DEFAULT_DB.memory, ...parsed.memory };
    merged.memory.structured = { ...DEFAULT_DB.memory.structured, ...(parsed.memory?.structured || {}) };

    if (!merged.insights) merged.insights = { ...DEFAULT_DB.insights };
    if (!merged.actions) merged.actions = [];
    if (!merged.backups) merged.backups = [];
    if (!merged.recent_summaries) merged.recent_summaries = [];
    if (!merged.chat_history) merged.chat_history = [];
    if (!merged.semantic_memory) merged.semantic_memory = [];
    if (!merged.history) merged.history = [];
    
    // Compatibility migration for intervention memory
    if (!merged.profile.intervention_memory || merged.profile.intervention_memory.length === 0) {
      merged.profile.intervention_memory = parsed.profile.effectiveness_ledger || [];
    }
    return merged;
  } catch (err) {
    await writeDB(DEFAULT_DB);
    return DEFAULT_DB;
  }
}

export function getSignalState(db, todayStr) {
  if (!db.signal_state) {
    db.signal_state = {
      date: todayStr,
      last_triggered_at: null,
      pending_tasks: {},
      counters: { stress: 0, anxiety: 0, joy: 0, happiness: 0, pride: 0, focus: 0 }
    };
  } else if (db.signal_state.date !== todayStr) {
    db.signal_state.date = todayStr;
    db.signal_state.counters = { stress: 0, anxiety: 0, joy: 0, happiness: 0, pride: 0, focus: 0 };
    db.signal_state.pending_tasks = {};
  }
  if (!db.signal_state.pending_tasks) {
    db.signal_state.pending_tasks = {};
  }
  return db.signal_state;
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

export function getKolkataTime(date) {
  const str = new Date(date).toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(str);
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
  const impact = task.impact !== undefined ? task.impact : (task.impact_score || 5);
  const friction = task.friction !== undefined ? task.friction : (task.friction_score || 2);
  const repeatInterval = task.repeat_interval || 2;

  const stress = db.context.mood?.rating || 5;
  const sleepHours = db.context.sleep?.hours || 7;
  const energy = db.context.sleep?.energy || 5;
  const subGoal = db.profile.active_goal?.subGoal || "Sleep Better";

  let completionCoeff = 1.0; 

  // 1. Context coefficient: Stress & Energy match
  let contextCoeff = 1.0;
  if (stress >= 7 || energy <= 4) {
    if (task.category === "Recovery" || task.category === "Joy") {
      contextCoeff = 1.3;
    } else {
      contextCoeff = 0.7; // Penalize non-recovery when exhausted
    }
  }

  // 2. Identity coefficient: Goal alignment
  let identityCoeff = 1.0;
  if (task.applicable_goals && task.applicable_goals.includes(subGoal)) {
    identityCoeff = 1.25;
  }

  // 3. Novelty coefficient: Recency based
  let noveltyCoeff = 1.0;
  const lastRecIso = db.profile.last_recommended_timestamps?.[task.id];
  if (lastRecIso) {
    const lastRecDate = new Date(lastRecIso);
    const diffMs = new Date() - lastRecDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays >= repeatInterval) {
      noveltyCoeff = 1.2;
    } else {
      noveltyCoeff = Math.max(0.6, diffDays / repeatInterval);
    }
  } else {
    noveltyCoeff = 1.25; // Boost never completed/recommended
  }

  // 4. Recovery coefficient: sleep deprivation recovery
  let recoveryCoeff = 1.0;
  if (sleepHours < 6.5 && (task.category === "Recovery" || task.category === "Joy")) {
    recoveryCoeff = 1.4;
  }

  // 5. Preference coefficient: completion / rejection ratio
  let preferenceCoeff = 1.0;
  const ledger = db.profile.intervention_memory || [];
  const rejectionLedger = db.profile.rejection_ledger || [];
  const completedCount = ledger.filter(l => l.actionId === task.id && l.completed).length;
  const rejectedCount = rejectionLedger.filter(r => r.actionId === task.id).length;
  if (completedCount > 0 || rejectedCount > 0) {
    preferenceCoeff = 0.6 + (completedCount / (completedCount + rejectedCount + 1)) * 0.8;
  }

  // Calculate using rich Momentum Earned formula (base Impact scaled)
  const baseImpact = impact * 0.4; // scale so max is around 5.0
  let delta = baseImpact * completionCoeff * contextCoeff * identityCoeff * noveltyCoeff * recoveryCoeff * preferenceCoeff;

  // Clamp the rolling delta between 0.2 and 5.0
  delta = Math.min(5.0, Math.max(0.2, delta));
  
  return Math.round(delta * 10) / 10;
}

export function applyMomentumDelta(db, delta, isAddition = true) {
  const profile = db.profile || {};
  
  if (isAddition) {
    profile.momentum_earned_today = Math.round(((profile.momentum_earned_today || 0) + delta) * 10) / 10;
    profile.momentum_score = Math.min(100, (profile.momentum_score || 50) + delta);
  } else {
    profile.momentum_earned_today = Math.max(0, Math.round(((profile.momentum_earned_today || 0) - delta) * 10) / 10);
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
    const delta = calculateTaskPoints(matchedAction, db);

    if (status === 'done') {
      completedDiff = 1;
      db.actions = db.actions.map(act => act.id === actionId ? { ...act, raw_points: delta } : act);
      applyMomentumDelta(db, delta, true);
    } else if (oldStatus === 'done' && (status === 'todo' || status === 'skipped')) {
      completedDiff = -1;
      const rawPoints = matchedAction.raw_points || delta;
      applyMomentumDelta(db, rawPoints, false);
      db.actions = db.actions.map(act => act.id === actionId ? { ...act, raw_points: undefined } : act);
    }

    db.profile.total_actions_completed = Math.max(0, (db.profile.total_actions_completed || 0) + completedDiff);
    
    const todayStr = getMomentumDayString(getDbCurrentTime(db));
    
    if (status === 'done') {
      const stress = db.context.mood?.rating || 5;
      const lastLog = db.history.slice(-1)[0] || {};
      const stressBefore = lastLog.stress || 5;
      const stressDelta = stress - stressBefore;

      db.profile.intervention_memory = db.profile.intervention_memory || [];
      db.profile.intervention_memory.push({
        actionId,
        rating: 4, 
        date: todayStr,
        stressDelta,
        completed: true
      });

      db.profile.last_recommended_timestamps = db.profile.last_recommended_timestamps || {};
      db.profile.last_recommended_timestamps[actionId] = getDbCurrentTime(db).toISOString();
    } else if (status === 'skipped' || status === 'ignored') {
      db.profile.rejection_ledger = db.profile.rejection_ledger || [];
      db.profile.rejection_ledger.push({
        actionId,
        date: todayStr,
        status: status
      });

      db.profile.intervention_memory = db.profile.intervention_memory || [];
      db.profile.intervention_memory.push({
        actionId,
        completed: false,
        outcome: status,
        date: todayStr
      });
    }

    if (db.signal_state && db.signal_state.pending_tasks && db.signal_state.pending_tasks[actionId]) {
      if (status === 'done') {
        const signalType = db.signal_state.pending_tasks[actionId];
        if (db.signal_state.counters && db.signal_state.counters[signalType] !== undefined) {
          db.signal_state.counters[signalType] = Math.max(0, db.signal_state.counters[signalType] - 20);
        }
        delete db.signal_state.pending_tasks[actionId];
      } else if (status === 'skipped' || status === 'ignored') {
        delete db.signal_state.pending_tasks[actionId];
      }
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
  
  db.actions = (db.actions || []).map(act => {
    if (act.id === actionId) {
      return { ...act, rating };
    }
    return act;
  });

  const todayStr = getMomentumDayString(getDbCurrentTime(db));
  db.profile.intervention_memory = db.profile.intervention_memory || [];
  
  let memoryUpdated = false;
  db.profile.intervention_memory = db.profile.intervention_memory.map(log => {
    if (log.actionId === actionId && log.date === todayStr) {
      memoryUpdated = true;
      return { ...log, rating };
    }
    return log;
  });

  if (!memoryUpdated) {
    const stress = db.context.mood?.rating || 5;
    const lastLog = db.history.slice(-1)[0] || {};
    const stressBefore = lastLog.stress || 5;
    const stressDelta = stress - stressBefore;

    db.profile.intervention_memory.push({
      actionId,
      rating,
      date: todayStr,
      stressDelta,
      completed: true
    });
  }

  await writeDB(db);
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
  const oldTime = getKolkataTime(oldTimeStr);
  const newTime = getKolkataTime(newTimeStr);
  
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
  // Dynamically import orchestrator and groq to avoid circular imports
  const { orchestrateDayTransition } = await import('./day_transition.js');
  const { queryGemini } = await import('./groq.js');

  const transitionSummary = await orchestrateDayTransition(db, queryGemini);
  return transitionSummary;
}

// Get the momentum day string (shifting date back by 1 if before 6 AM)
export function getMomentumDayString(date) {
  const d = getKolkataTime(date);
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


