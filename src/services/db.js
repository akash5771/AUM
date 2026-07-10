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
    goal: "",
    problem: "",
    role: "",
    goals: "",
    aspirations: "",
    idealLife: "",
    lifeSatisfaction: 5,
    lifeAreas: [],
    streak: 0,
    completion_rate: 0,
    total_actions_generated: 0,
    total_actions_completed: 0,
    current_phase: "Stability",
    archetype: "Mindful Rookie",
    archetype_history: [],
    milestones: [],
    level: 0,
    xp: 0,
    level_up_celebration_pending: false,
    onboarding_completed: false
  },
  context: {
    sleep: { hours: 7.0, quality: "good", energy: 7 },
    mood: { rating: 6, state: "stressed" },
    behavioral: { consistency: 70, recovery_speed: "medium" },
    environmental: { time: "Morning", day_of_week: "Monday", weather: "Clear" },
    is_frozen: false,
    last_logged: ""
  },
  actions: [],
  chat_history: [],
  semantic_memory: [],
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
    if (!merged.actions) merged.actions = [];
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

// Toggle action status
export async function toggleActionStatus(actionId, status) {
  const db = await readDB();
  let statusChanged = false;
  let oldStatus = 'todo';

  if (Array.isArray(db.actions)) {
    db.actions = db.actions.map(act => {
      if (act.id === actionId) {
        if (act.status !== status) {
          oldStatus = act.status;
          statusChanged = true;
        }
        return { ...act, status };
      }
      return act;
    });
  }

  if (statusChanged) {
    // Math logic:
    // todo -> done: +20 XP, total_actions_completed++
    // done -> todo/skipped: -20 XP, total_actions_completed-- (reverse complete)
    // todo -> skipped: +0 XP
    // skipped -> done: +20 XP, total_actions_completed++
    // done -> skipped: -20 XP, total_actions_completed--
    let xpDiff = 0;
    let completedDiff = 0;

    if (status === 'done') {
      xpDiff = 20;
      completedDiff = 1;
    } else if (oldStatus === 'done' && (status === 'todo' || status === 'skipped')) {
      xpDiff = -20;
      completedDiff = -1;
    }

    db.profile.total_actions_completed = Math.max(0, (db.profile.total_actions_completed || 0) + completedDiff);
    await writeDB(db); // Save intermediate state
    
    if (xpDiff !== 0) {
      await addXp(xpDiff);
    }
  }

  // Re-read DB to capture level/xp changes
  const freshDb = await readDB();
  
  // Calculate completion rate
  const total = freshDb.profile.total_actions_generated || 0;
  const completed = freshDb.profile.total_actions_completed || 0;
  freshDb.profile.completion_rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  await writeDB(freshDb);
  return freshDb;
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

// Process day transition: expire tasks, calculate XP penalty, update streak, reset context
export async function processDayTransition(db) {
  const actions = db.actions || [];
  const completedCount = actions.filter(a => a.status === 'done').length;
  const incompleteCount = Math.max(0, 5 - completedCount);
  
  // 1. Expire uncompleted tasks: subtract 10 XP for each incomplete task
  const xpPenalty = incompleteCount * -10;
  
  let levelBefore = db.profile.level || 0;
  let xpBefore = db.profile.xp || 0;
  
  let currentLevel = levelBefore;
  let currentXp = xpBefore + xpPenalty;
  
  while (currentXp < 0) {
    if (currentLevel > 0) {
      currentLevel -= 1;
      currentXp += 100;
    } else {
      currentXp = 0;
      break;
    }
  }
  
  db.profile.level = currentLevel;
  db.profile.xp = currentXp;

  // 2. Streak calculations
  if (actions.length > 0) {
    if (completedCount === actions.length) {
      db.profile.streak = (db.profile.streak || 0) + 1;
    } else {
      db.profile.streak = 0;
    }
  }

  // 2.5 Log context metrics to history array
  const yesterdayLog = {
    date: db.context.last_logged || getMomentumDayString(getDbCurrentTime(db)),
    sleep_hours: db.context.sleep?.hours || 0,
    sleep_quality: db.context.sleep?.quality || 'unknown',
    energy: db.context.sleep?.energy || 0,
    stress: db.context.mood?.rating || 0,
    mood_state: db.context.mood?.state || 'unknown',
    weather: db.context.environmental?.weather || 'unknown',
    tasks_completed: completedCount,
    tasks_total: actions.length
  };
  db.history = db.history || [];
  db.history.push(yesterdayLog);
  if (db.history.length > 90) {
    db.history.shift(); // Cap at exactly 90 days
  }
  
  // 3. Reset context freeze
  db.context.is_frozen = false;
  
  // 4. Create automated empathetic notification from AUM
  let aumMessage = "";
  if (actions.length === 0) {
    aumMessage = `Welcome to a brand new day, Akash! Let's fill out your daily context so I can generate your customized Daily 5 tasks for today.`;
  } else if (completedCount === 5) {
    aumMessage = `Akash, what a phenomenal day yesterday! You completed all 5 actions, keeping your streak going at ${db.profile.streak} days. You've earned that +100 XP boost, and we are charging straight into today. Let's keep this momentum blazing!`;
  } else if (completedCount > 0) {
    aumMessage = `Good morning, Akash. Yesterday you completed ${completedCount} of 5 actions. We had to adjust your progress by ${xpPenalty} XP for the unfinished tasks, placing you at Level ${db.profile.level} (${db.profile.xp} XP). Today is a brand new page. Let's focus on a single small win to start!`;
  } else {
    aumMessage = `Akash, it looks like yesterday was a tough day and we couldn't complete our tasks. That's completely okay—recovery is part of momentum. We adjusted your progress by -50 XP. Today, let's keep things extremely simple. I've unfrozen your context so you can tell me how you are feeling right now.`;
  }
  
  db.chat_history.push({
    sender: "AUM",
    text: aumMessage,
    timestamp: getDbCurrentTime(db).toISOString()
  });

  return {
    xpDifference: xpPenalty,
    oldLevel: levelBefore,
    newLevel: currentLevel,
    streak: db.profile.streak
  };
}

// Get the momentum day string (shifting date back by 1 if before 6 AM)
export function getMomentumDayString(date) {
  const d = new Date(date);
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}


