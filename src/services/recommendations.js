/**
 * Recommendation Engine service for AUM
 * Contains the Interventions Knowledge Base, Local Places Database,
 * and the decomposed decider pipeline.
 */

// --- 1. Interventions Knowledge Base ---
export const INTERVENTIONS_KB = [
  // Physical Category
  {
    id: "kb_phys_gym",
    text: "Perform a 45-minute strength workout at the gym.",
    category: "Physical",
    difficulty: 4,
    energy_cost: { mental: 2, physical: 5, social: 2, creative: 1 },
    financial_cost: "premium",
    restricted_values: ["Time-Sparing"],
    intensities: { emotional: "Medium", social_friction: "Medium", recovery_cost: "High" },
    applicable_goals: ["Lose Fat", "Build Muscle"],
    weather_restricted: false,
    duration_mins: 60,
    defaultWhyToday: "Physical loading triggers muscle protein synthesis and raises basal metabolic rate.",
    defaultWhyRelevant: "To support your fat loss goal, resistance training preserves lean mass while elevating calorie burn.",
    defaultHowTo: "Do 3 sets of squats, overhead presses, and lat pulldowns. Keep rest times around 90 seconds."
  },
  {
    id: "kb_phys_walk",
    text: "Go for a brisk 20-minute outdoor walk.",
    category: "Physical",
    difficulty: 1,
    energy_cost: { mental: 1, physical: 2, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Lose Fat", "Sleep Better", "Reduce Burnout"],
    weather_restricted: true,
    duration_mins: 20,
    defaultWhyToday: "Low-intensity physical movement under daylight supports circadian entrainment.",
    defaultWhyRelevant: "A quick walk lowers baseline cortisol, supporting stress recovery and weight control.",
    defaultHowTo: "Walk outside without looking at your phone. Maintain a brisk pace where you can talk but not sing."
  },
  {
    id: "kb_phys_stretch",
    text: "Complete a 15-minute full body mobility stretch.",
    category: "Physical",
    difficulty: 1,
    energy_cost: { mental: 1, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Sleep Better"],
    weather_restricted: false,
    duration_mins: 15,
    defaultWhyToday: "Physical stretching resets muscle spindles and alleviates desk-bound structural tension.",
    defaultWhyRelevant: "Lowering physical stiffness signals safety to the autonomic nervous system, aiding recovery.",
    defaultHowTo: "Hold gentle stretches for your hips, hamstrings, and chest for 30 seconds each, breathing slowly."
  },

  // Recovery Category
  {
    id: "kb_rec_breathing",
    text: "Practice a 5-minute box breathing cycle.",
    category: "Recovery",
    difficulty: 1,
    energy_cost: { mental: 1, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Sleep Better", "Build Startup"],
    weather_restricted: false,
    duration_mins: 5,
    defaultWhyToday: "Box breathing directly stimulates the vagus nerve to decrease heart rate and blood pressure.",
    defaultWhyRelevant: "To manage startup anxiety, this lowers amygdala arousal, keeping you logical under pressure.",
    defaultHowTo: "Inhale for 4 seconds, hold for 4, exhale for 4, hold for 4. Complete 10 full cycles."
  },
  {
    id: "kb_rec_massage",
    text: "Schedule a 60-minute recovery massage or wellness session.",
    category: "Recovery",
    difficulty: 3,
    energy_cost: { mental: 1, physical: 1, social: 2, creative: 1 },
    financial_cost: "premium",
    restricted_values: ["Saving Stance"],
    intensities: { emotional: "Low", social_friction: "Medium", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout"],
    weather_restricted: false,
    duration_mins: 75,
    defaultWhyToday: "Somatic therapy physically reduces deep-seated muscle tension and releases serotonin.",
    defaultWhyRelevant: "As a professional carrying intense work stress, structured recovery is a baseline necessity.",
    defaultHowTo: "Book a local sports massage or deep tissue treatment. Focus on breathing during the session."
  },
  {
    id: "kb_rec_early_sleep",
    text: "Turn off all screens by 9:30 PM and sleep early.",
    category: "Recovery",
    difficulty: 2,
    energy_cost: { mental: 2, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Sleep Better", "Reduce Burnout"],
    weather_restricted: false,
    duration_mins: 480,
    defaultWhyToday: "Sleeping early matches natural melatonin release peaks, increasing deep sleep proportion.",
    defaultWhyRelevant: "Optimizing your sleep architecture is the highest-leverage step to lowering stress and restoring focus.",
    defaultHowTo: "Put your phone in another room at 9:30 PM. Read a physical book or listen to white noise until asleep."
  },

  // Social Category
  {
    id: "kb_soc_family_dinner",
    text: "Have a phone-free dinner with your family.",
    category: "Social",
    difficulty: 2,
    energy_cost: { mental: 1, physical: 1, social: 3, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Parenting", "Marriage"],
    weather_restricted: false,
    duration_mins: 45,
    defaultWhyToday: "Intimate family connections act as a primary emotional buffer against career stress.",
    defaultWhyRelevant: "Nurturing your relationships keeps you grounded and provides critical perspective on work conflicts.",
    defaultHowTo: "Leave all phones in a drawer. Sit at the table and ask each person about one high and one low from their day."
  },
  {
    id: "kb_soc_call_friend",
    text: "Call a close friend for a 15-minute catch up.",
    category: "Social",
    difficulty: 2,
    energy_cost: { mental: 2, physical: 1, social: 3, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Medium", recovery_cost: "Low" },
    applicable_goals: ["Dating", "Dating/Social"],
    weather_restricted: false,
    duration_mins: 15,
    defaultWhyToday: "Relational conversations outside your work circle reduce professional isolation.",
    defaultWhyRelevant: "Maintaining strong social ties supports emotional balance and long-term satisfaction.",
    defaultHowTo: "Call a friend you haven't spoken to in a while. Ask them about their life first and listen actively."
  },

  // Creative Category
  {
    id: "kb_creat_write",
    text: "Write 500 words on a topic of interest (journal, post, code design).",
    category: "Creative",
    difficulty: 3,
    energy_cost: { mental: 4, physical: 1, social: 1, creative: 5 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Medium", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Build Startup", "Reading/Writing"],
    weather_restricted: false,
    duration_mins: 30,
    defaultWhyToday: "Writing forces cognitive structure, clarifying thoughts and training focus.",
    defaultWhyRelevant: "Developing a creation habit shifts your balance from screen consumption to constructive output.",
    defaultHowTo: "Open a clean document. Set a 20-minute timer. Write continuously without editing or checking details."
  },
  {
    id: "kb_creat_build",
    text: "Spend 45 minutes coding or designing a personal side project.",
    category: "Creative",
    difficulty: 4,
    energy_cost: { mental: 5, physical: 1, social: 1, creative: 5 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "High", social_friction: "Low", recovery_cost: "Medium" },
    applicable_goals: ["Build Startup"],
    weather_restricted: false,
    duration_mins: 45,
    defaultWhyToday: "Building feeds curiosity and builds technical agency outside your daily corporate role.",
    defaultWhyRelevant: "Taking action on your startup vision builds momentum towards career independence.",
    defaultHowTo: "Define one small feature (e.g. one API route or UI block). Build only that feature without distractions."
  },

  // Joy Category
  {
    id: "kb_joy_read",
    text: "Read 15 pages of a fiction or biography book.",
    category: "Joy",
    difficulty: 1,
    energy_cost: { mental: 2, physical: 1, social: 1, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Sleep Better", "Reduce Burnout", "Reading"],
    weather_restricted: false,
    duration_mins: 20,
    defaultWhyToday: "Reading narrative fiction lowers heart rate and provides healthy cognitive escapism.",
    defaultWhyRelevant: "This serves as a high-quality alternative to screen time, settling your brain before rest.",
    defaultHowTo: "Find a quiet corner. Set your phone to Do Not Disturb. Read 15 pages of your current physical book."
  },
  {
    id: "kb_joy_movie",
    text: "Watch a classic, high-rating movie without checking your phone.",
    category: "Joy",
    difficulty: 1,
    energy_cost: { mental: 1, physical: 1, social: 2, creative: 1 },
    financial_cost: "cheap",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout"],
    weather_restricted: false,
    duration_mins: 120,
    defaultWhyToday: "Engaging in structured, high-quality storytelling restores emotional energy.",
    defaultWhyRelevant: "Learning to enjoy leisure guilt-free is key to escaping professional burnout cycles.",
    defaultHowTo: "Pick a movie. Put your phone in another room. Let yourself fully sink into the film."
  },

  // Learning Category
  {
    id: "kb_learn_podcast",
    text: "Listen to a 20-minute educational podcast.",
    category: "Learning",
    difficulty: 2,
    energy_cost: { mental: 3, physical: 1, social: 1, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Build Startup", "Language/Learning"],
    weather_restricted: false,
    duration_mins: 20,
    defaultWhyToday: "Audio learning utilizes passive time (like commuting or cooking) for active mental enrichment.",
    defaultWhyRelevant: "Absorbing insights from fields like design or psychology feeds your professional curiosity.",
    defaultHowTo: "Listen to an episode on Spotify or Apple Podcasts while doing chores or light stretches."
  },

  // Adventure Category (Experiences)
  {
    id: "kb_adv_local_park",
    text: "Explore a nearby local park or biodiversity trail.",
    category: "Adventure",
    difficulty: 2,
    energy_cost: { mental: 1, physical: 3, social: 1, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Medium", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Lose Fat"],
    weather_restricted: true,
    duration_mins: 40,
    defaultWhyToday: "Time spent in natural green spaces resets attention pathways and lowers stress markers.",
    defaultWhyRelevant: "Relocating or exploring local outdoor spaces breaks routine and expands your reality.",
    defaultHowTo: "Check the local database for a park. Spend 30 minutes walking, observing trees, and listening to sounds."
  },
  {
    id: "kb_adv_bookstore",
    text: "Visit a local bookstore and browse the shelves silently.",
    category: "Adventure",
    difficulty: 2,
    energy_cost: { mental: 2, physical: 2, social: 2, creative: 3 },
    financial_cost: "cheap",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Medium", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Reading"],
    weather_restricted: false,
    duration_mins: 45,
    defaultWhyToday: "Physical bookstores trigger curiosity through tactile browsing and quiet spaces.",
    defaultWhyRelevant: "This gets you out of the house into an offline learning environment without high social demands.",
    defaultHowTo: "Go to a local bookstore. Browse sections you don't normally read. Pick up one book that intrigues you."
  },

  // Contribution Category
  {
    id: "kb_contrib_mentor",
    text: "Write a message offering help or mentorship to a junior colleague.",
    category: "Contribution",
    difficulty: 2,
    energy_cost: { mental: 3, physical: 1, social: 3, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Medium", social_friction: "High", recovery_cost: "Low" },
    applicable_goals: ["Build Startup", "Career Growth"],
    weather_restricted: false,
    duration_mins: 15,
    defaultWhyToday: "Altruistic actions stimulate dopamine release and provide a strong sense of purpose.",
    defaultWhyRelevant: "Investing in others builds positive circles, reinforcing your professional leadership.",
    defaultHowTo: "Send a message on LinkedIn or Slack to a junior peer offering a 15-minute call to answer questions."
  }
];

// --- 2. Local Places Database ---
export const LOCAL_PLACES_DB = [
  // Gurgaon
  { city: "Gurgaon", name: "Tau Devi Lal Biodiversity Park", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Gurgaon", name: "Quill and Canvas Bookstore", category: "Adventure", cost: "cheap", weather_restricted: false },
  { city: "Gurgaon", name: "Blue Tokai Café at Galleria", category: "Joy", cost: "cheap", weather_restricted: false },
  { city: "Gurgaon", name: "Leisure Valley Park", category: "Adventure", cost: "free", weather_restricted: true },

  // Bengaluru
  { city: "Bengaluru", name: "Cubbon Park Walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Bengaluru", name: "Blossom Book House on Church Street", category: "Adventure", cost: "cheap", weather_restricted: false },
  { city: "Bengaluru", name: "Lalbagh Botanical Garden", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Bengaluru", name: "Third Wave Coffee Indiranagar", category: "Joy", cost: "cheap", weather_restricted: false },

  // Ballia
  { city: "Ballia", name: "Surha Taal Lake walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Ballia", name: "Bhrigu Mandir library", category: "Learning", cost: "free", weather_restricted: false },
  { city: "Ballia", name: "Ganga River Ghat walk", category: "Adventure", cost: "free", weather_restricted: true },

  // Mumbai
  { city: "Mumbai", name: "Marine Drive walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Mumbai", name: "Sanjay Gandhi National Park", category: "Adventure", cost: "cheap", weather_restricted: true },
  { city: "Mumbai", name: "Kitab Khana Bookstore Fort", category: "Adventure", cost: "cheap", weather_restricted: false },

  // Delhi
  { city: "Delhi", name: "Lodhi Gardens Walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Delhi", name: "Sunder Nursery Park", category: "Adventure", cost: "cheap", weather_restricted: true },
  { city: "Delhi", name: "Bahrisons Booksellers Khan Market", category: "Adventure", cost: "cheap", weather_restricted: false }
];

// --- 3. Decomposed Recommendation Engines ---

/**
 * Stage 1: Candidate Generator
 * Filters the master list of interventions based on Goal, Values, Weather, and Chapter constraints
 */
export function generateCandidates(context, coreValues) {
  const weather = context.environmental?.weather || "Clear";
  const chapter = context.user_state.current_chapter || "Stable Routine";
  const aqi = context.environmental?.world?.aqi || 80;

  return INTERVENTIONS_KB.filter(task => {
    // 1. Core Values filtering (Constraint Engine - Hard filter)
    const valuesConflict = task.restricted_values.some(val => coreValues.includes(val));
    if (valuesConflict) return false;

    // 3. Weather constraints
    if (task.weather_restricted && weather === "Rainy") return false;

    // 4. AQI constraints (NCR health protection)
    if (task.weather_restricted && aqi > 200) return false; // Block outdoor physical tasks during hazardous air

    // 5. Chapter constraints
    if (chapter === "New Parent") {
      // New parents have severe time/energy limits. Exclude very long or high friction tasks
      if (task.duration_mins > 90 || task.difficulty > 4) return false;
    }

    return true;
  });
}

/**
 * Stage 2: Scoring Engine
 * Computes scores based on energy budgets, financial stances, opportunity engine states, effectiveness ledger and timeline events
 */
export function scoreCandidates(candidates, context, profile) {
  const financialStance = context.user_state.financial_stance || "balanced";
  const energyBudget = context.user_state.energies || { mental: 7, physical: 7, social: 7, creative: 7 };
  const stress = context.user_state.stress || 5;
  const activeTimeline = context.memory.active_life_events || [];
  
  // Load past completed ratings
  const ledger = profile.effectiveness_ledger || [];

  return candidates.map(task => {
    let score = 100; // Baseline score

    // 1. Financial filter
    if (financialStance === "saving_aggressively" && task.financial_cost === "premium") {
      score = 0;
      return { task, score };
    }

    // 2. Energy Budget calculations
    const mentalCost = task.energy_cost.mental;
    const physicalCost = task.energy_cost.physical;
    const socialCost = task.energy_cost.social;

    // Check if task exceeds energy bounds
    if (mentalCost > energyBudget.mental || physicalCost > energyBudget.physical || socialCost > energyBudget.social) {
      score -= 50; // Severe penalty for exhausting empty reserves
    } else {
      // Synergistic match: low mental cost when mental energy is low
      if (energyBudget.mental < 4 && mentalCost <= 2) {
        score += 15;
      }
      if (energyBudget.physical < 4 && physicalCost <= 2) {
        score += 15;
      }
    }

    // 3. Opportunity Engine
    // High performance days: high physical energy and low stress
    if (energyBudget.physical >= 8 && energyBudget.mental >= 8 && stress < 4) {
      if (task.difficulty >= 4 || task.category === "Creative") {
        score += 25; // Boost challenging tasks
      }
    }
    // Weekend social opportunities
    if (context.temporal.is_weekend) {
      if (task.category === "Social" || task.category === "Adventure") {
        score += 25;
      }
    }

    // 4. Effectiveness Ledger modifiers (Causality & Rating feedback)
    const taskLogs = ledger.filter(l => l.actionId === task.id);
    if (taskLogs.length > 0) {
      const avgRating = taskLogs.reduce((acc, log) => acc + log.rating, 0) / taskLogs.length;
      
      if (avgRating >= 4.0) {
        score = score * 1.20; // +20% preference boost
      } else if (avgRating <= 2.0) {
        score = score * 0.70; // -30% preference penalty
      }

      // Check if it successfully reduced stress historically
      const stressReducer = taskLogs.filter(l => l.stressDelta < 0).length;
      if (stressReducer > 0) {
        score = score * 1.15; // +15% effectiveness boost
      }
    }

    // 5. Active Timeline modifiers
    const isRelocated = activeTimeline.some(e => e.type === 'Relocated');
    if (isRelocated && task.category === "Adventure") {
      score += 35; // Boost exploration
    }

    const isFamilySick = activeTimeline.some(e => e.type === 'Family Illness');
    if (isFamilySick) {
      if (task.category === "Recovery" || (task.category === "Social" && task.id === "kb_soc_family_dinner")) {
        score += 40; // Boost recovery and close connections
      } else if (task.difficulty >= 4) {
        score -= 40; // Penalty on high challenge
      }
    }

    // 6. Active Goal Boost (Soft filter preference)
    const goalSub = context.user_state.active_goal?.subGoal || "Sleep Better";
    if (task.applicable_goals.includes(goalSub)) {
      score += 40;
    }

    // 7. Momentum ROI Scorer
    const userMomentum = profile.momentum_score || 50;
    const friction = task.friction_score !== undefined ? task.friction_score : (task.difficulty || 2);
    const impact = task.impact_score !== undefined ? task.impact_score : 5;
    const roi = friction > 0 ? (impact / friction) : impact;

    if (userMomentum < 40) {
      // Early-stage user: boost high-ROI tasks
      if (roi >= 2.5) {
        score += 35;
      }
    } else if (userMomentum >= 60) {
      // Consistent/Thriving user: boost high-impact tasks
      if (impact >= 7) {
        score += 25;
      }
    }

    return { task, score };
  }).filter(c => c.score > 0);
}

/**
 * Stage 3: Diversity Engine
 * Applies recency penalties, category fatigue multipliers, and novelty boosts
 */
export function applyDiversityRules(scoredCandidates, profile, history) {
  const lastRecMap = profile.last_recommended_timestamps || {};
  
  // Calculate rolling 7-day category frequency
  const categoryCounts = {};
  let totalLogs = 0;
  const recentHistory = history.slice(-7);
  
  recentHistory.forEach(log => {
    const cats = log.categories_completed || [];
    cats.forEach(cat => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      totalLogs++;
    });
  });

  return scoredCandidates.map(item => {
    let score = item.score;
    const task = item.task;

    // 1. Recency Penalty (based on last_recommended timestamp)
    const lastRecStr = lastRecMap[task.id];
    if (lastRecStr) {
      const lastRecDate = new Date(lastRecStr);
      const diffMs = new Date() - lastRecDate;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays <= 2) {
        score -= 80;
      } else if (diffDays <= 5) {
        score -= 40;
      }
    } else {
      score += 20; // Novelty Boost for never recommended tasks
    }

    // 2. Category Fatigue Penalty
    const catFreq = totalLogs > 0 ? (categoryCounts[task.category] || 0) / totalLogs : 0;
    if (catFreq > 0.40) {
      score -= 30; // Category is stale, penalize it
    } else if (catFreq < 0.10) {
      score += 20; // Underrepresented category boost
    }

    return { task, score };
  });
}

/**
 * Stage 4: Day Set Simulator
 * Assembles alternate combinations and simulates outcomes to select the best set, plus selects backups
 */
export function simulateAndChooseDaySet(scoredCandidates, context) {
  // Sort candidates by final score
  const sorted = [...scoredCandidates].sort((a, b) => b.score - a.score);
  
  if (sorted.length < 5) {
    // Fail-safe: return first 5 or whatever is left
    const tasks = sorted.map(s => s.task);
    return {
      selected: tasks,
      backups: []
    };
  }

  // Generate 3 alternate Day Sets representing different behavioral directions
  const candidates = sorted.map(s => s.task);
  
  // Set A: Focus heavily on high scoring general items
  const setA = candidates.slice(0, 5);

  // Set B: Force at least 1 Creative and 1 Learning task if available
  const setB = [];
  const creative = candidates.find(t => t.category === "Creative");
  const learning = candidates.find(t => t.category === "Learning");
  
  const rest = candidates.filter(t => t.id !== creative?.id && t.id !== learning?.id);
  if (creative) setB.push(creative);
  if (learning) setB.push(learning);
  setB.push(...rest.slice(0, 5 - setB.length));

  // Set C: Force at least 1 Social and 1 Recovery task if available
  const setC = [];
  const social = candidates.find(t => t.category === "Social");
  const recovery = candidates.find(t => t.category === "Recovery");
  
  const restC = candidates.filter(t => t.id !== social?.id && t.id !== recovery?.id);
  if (social) setC.push(social);
  if (recovery) setC.push(recovery);
  setC.push(...restC.slice(0, 5 - setC.length));

  // Simulation: Estimate predicted stress and momentum outcome for each set
  const sets = [setA, setB, setC];
  let bestIndex = 0;
  let maxPredictedScore = -Infinity;

  sets.forEach((set, index) => {
    // Heuristically calculate expected checklist completion and stress drop
    let expectedCompletions = 0;
    let expectedStressDrop = 0;

    set.forEach(task => {
      // Find candidate score
      const cand = sorted.find(s => s.task.id === task.id);
      const prob = cand ? Math.min(0.95, Math.max(0.20, cand.score / 150)) : 0.50; // Prob of completion
      
      expectedCompletions += prob;
      if (task.category === "Recovery" || task.category === "Joy") {
        expectedStressDrop += prob * 1.5; // Expected stress reduction
      }
    });

    const predictedTransitionDelta = (0.4 * expectedCompletions) + (0.3 * expectedStressDrop);
    if (predictedTransitionDelta > maxPredictedScore) {
      maxPredictedScore = predictedTransitionDelta;
      bestIndex = index;
    }
  });

  const selectedSet = sets[bestIndex];
  
  // Pick 2 backup interventions from remaining candidates that are weather-safe and low difficulty
  const activeIds = selectedSet.map(s => s.id);
  const remaining = candidates.filter(c => !activeIds.includes(c.id));
  
  const backups = remaining.filter(c => !c.weather_restricted && c.difficulty <= 3).slice(0, 2);

  return {
    selected: selectedSet,
    backups: backups
  };
}

/**
 * Mid-day Constraint Swap Handler
 * Triggers if context changes (e.g. rain start) and swaps out blocked tasks
 */
export function checkAndSwapBlockedActions(db, context) {
  const activeActions = db.actions || [];
  const backups = db.backups || [];
  
  if (activeActions.length === 0 || backups.length === 0) return { actions: activeActions, swapped: false };

  const weather = context.environmental?.weather || "Clear";
  const aqi = context.environmental?.world?.aqi || 80;
  
  let swappedOccurred = false;
  const updatedActions = activeActions.map(act => {
    // If task is completed or skipped, don't swap it
    if (act.status !== 'todo') return act;

    // Find original KB metadata
    const kbTask = INTERVENTIONS_KB.find(k => k.id === act.id);
    if (!kbTask) return act;

    // Check if constraints are violated now
    const weatherViolated = kbTask.weather_restricted && weather === "Rainy";
    const aqiViolated = kbTask.weather_restricted && aqi > 200;

    if (weatherViolated || aqiViolated) {
      // Find a clean backup that matches categories or is general
      const availableBackup = backups.shift(); // Consume a backup
      if (availableBackup) {
        swappedOccurred = true;
        
        // Inject local place name if needed
        let text = availableBackup.text;
        const city = context.location?.city || db.profile?.city || "Gurgaon";
        const localSpot = LOCAL_PLACES_DB.find(p => p.city === city && p.category === availableBackup.category);
        if (localSpot && text.includes("local")) {
          text = text.replace("local park or biodiversity trail", `${localSpot.name} in ${city}`);
          text = text.replace("local bookstore", `${localSpot.name} in ${city}`);
        }

        return {
          id: availableBackup.id,
          text: text,
          category: availableBackup.category,
          difficulty: availableBackup.difficulty,
          whyToday: `Adapted: Replaced outdoor task because weather became ${weather} / AQI became ${aqi}.`,
          whyRelevant: availableBackup.defaultWhyRelevant || "Sustaining momentum by shifting indoors.",
          howTo: availableBackup.defaultHowTo || "Complete this alternative task.",
          status: "todo",
          adapted: true
        };
      }
    }

    return act;
  });

  return {
    actions: updatedActions,
    backups: backups,
    swapped: swappedOccurred
  };
}

/**
 * Dynamic Local place injector helper
 */
export function injectLocalPlaceNames(actions, city) {
  return actions.map(act => {
    let text = act.text;
    const localSpot = LOCAL_PLACES_DB.find(p => p.city === city && p.category === act.category);
    if (localSpot && text.includes("local")) {
      text = text.replace("local park or biodiversity trail", `${localSpot.name} in ${city}`);
      text = text.replace("local bookstore", `${localSpot.name} in ${city}`);
    }
    return { ...act, text };
  });
}
export function getRecommendedInterventions(profile, context, history) {
  // 1. Generate Candidates
  const coreValues = profile.core_values || [];
  const candidates = generateCandidates(context, coreValues);

  // 2. Score Candidates
  const scored = scoreCandidates(candidates, context, profile);

  // 3. Apply Diversity Engines
  const diversified = applyDiversityRules(scored, profile, history || []);

  // 4. Run Day Set Simulation
  const result = simulateAndChooseDaySet(diversified, context);

  // Inject local city names based on context location
  const city = context.location?.city || profile.city || "Gurgaon";
  const finalizedActions = injectLocalPlaceNames(result.selected, city);

  return {
    actions: finalizedActions,
    backups: result.backups
  };
}
