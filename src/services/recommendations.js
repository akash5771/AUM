/**
 * Recommendation Engine service for AUM
 * Contains the Interventions Knowledge Base, Local Places Database,
 * and the expected-value expected utility decider pipeline.
 */

// --- 1. Interventions Knowledge Base ---
export const INTERVENTIONS_KB = [
  {
    id: "kb_phys_gym",
    text: "Perform a 45-minute strength workout at the gym.",
    category: "Physical",
    difficulty: 4,
    friction: 7,
    impact: 8,
    minimum_readiness: 5,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 2, // premium
    repeat_interval: 2, // days
    duration_mins: 60,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 5, social: 2, creative: 1 },
    financial_cost: "premium",
    restricted_values: ["Time-Sparing"],
    intensities: { emotional: "Medium", social_friction: "Medium", recovery_cost: "High" },
    applicable_goals: ["Lose Fat", "Build Muscle"],
    weather_restricted: false,
    defaultWhyToday: "Physical loading triggers muscle protein synthesis and raises basal metabolic rate.",
    defaultWhyRelevant: "To support your fat loss goal, resistance training preserves lean mass while elevating calorie burn.",
    defaultHowTo: "Do 3 sets of squats, overhead presses, and lat pulldowns. Keep rest times around 90 seconds."
  },
  {
    id: "kb_phys_walk",
    text: "Go for a brisk 20-minute outdoor walk.",
    category: "Physical",
    difficulty: 1,
    friction: 2,
    impact: 5,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 0, // free
    repeat_interval: 1,
    duration_mins: 20,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 2, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Lose Fat", "Sleep Better", "Reduce Burnout"],
    weather_restricted: true,
    defaultWhyToday: "Low-intensity physical movement under daylight supports circadian entrainment.",
    defaultWhyRelevant: "A quick walk lowers baseline cortisol, supporting stress recovery and weight control.",
    defaultHowTo: "Walk outside without looking at your phone. Maintain a brisk pace where you can talk but not sing."
  },
  {
    id: "kb_phys_stretch",
    text: "Complete a 15-minute full body mobility stretch.",
    category: "Physical",
    difficulty: 1,
    friction: 1,
    impact: 4,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0, // free
    repeat_interval: 1,
    duration_mins: 15,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Sleep Better"],
    weather_restricted: false,
    defaultWhyToday: "Physical stretching resets muscle spindles and alleviates desk-bound structural tension.",
    defaultWhyRelevant: "Lowering physical stiffness signals safety to the autonomic nervous system, aiding recovery.",
    defaultHowTo: "Hold gentle stretches for your hips, hamstrings, and chest for 30 seconds each, breathing slowly."
  },
  {
    id: "kb_rec_breathing",
    text: "Practice a 5-minute box breathing cycle.",
    category: "Recovery",
    difficulty: 1,
    friction: 1,
    impact: 4,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 5,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Sleep Better", "Build Startup"],
    weather_restricted: false,
    defaultWhyToday: "Box breathing directly stimulates the vagus nerve to decrease heart rate and blood pressure.",
    defaultWhyRelevant: "To manage startup anxiety, this lowers amygdala arousal, keeping you logical under pressure.",
    defaultHowTo: "Inhale for 4 seconds, hold for 4, exhale for 4, hold for 4. Complete 10 full cycles."
  },
  {
    id: "kb_rec_water",
    text: "Drink a large glass of clean water.",
    category: "Recovery",
    difficulty: 1,
    friction: 1,
    impact: 3,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 1,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Sleep Better"],
    weather_restricted: false,
    defaultWhyToday: "Hydration immediately restores cellular homeostasis and relieves micro-fatigue.",
    defaultWhyRelevant: "Maintaining optimal hydration is the simplest way to reduce midday physical stress.",
    defaultHowTo: "Fill a 300ml glass of water and drink it slowly, standing up."
  },
  {
    id: "kb_joy_song",
    text: "Listen to the song \"Kun Faya Kun\" to reset your mind.",
    category: "Joy",
    difficulty: 1,
    friction: 1,
    impact: 4,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 6,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout"],
    weather_restricted: false,
    defaultWhyToday: "Auditory meditation resets emotional status and decreases acute beta-wave brain patterns.",
    defaultWhyRelevant: "Connecting to peaceful music helps ground your emotional baseline during hectic periods.",
    defaultHowTo: "Put on headphones, close your eyes, and listen to the song without doing anything else."
  },
  {
    id: "kb_learn_article",
    text: "Read a 3-minute educational article of interest.",
    category: "Learning",
    difficulty: 1,
    friction: 1,
    impact: 4,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 2,
    duration_mins: 3,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Language/Learning", "Build Startup"],
    weather_restricted: false,
    defaultWhyToday: "Consuming a short structural thought maintains mental plasticity without cognitive exhaustion.",
    defaultWhyRelevant: "Shifting consumption from scrolling to curated knowledge preserves baseline focus.",
    defaultHowTo: "Read a pre-selected short newsletter issue or article on pocket/browser."
  },
  {
    id: "kb_learn_ted",
    text: "Watch a short 10-minute TED clip.",
    category: "Learning",
    difficulty: 2,
    friction: 2,
    impact: 5,
    minimum_readiness: 3,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 3,
    duration_mins: 10,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Language/Learning", "Build Startup"],
    weather_restricted: false,
    defaultWhyToday: "Interactive video learning triggers dopamine loops centered around constructive discovery.",
    defaultWhyRelevant: "Feeding your professional and creative curiosity keeps work feeling expansive.",
    defaultHowTo: "Pick a TED clip on psychology, design, or biology and watch it attentively."
  },
  {
    id: "kb_phys_walk_short",
    text: "Take a quick 10-minute walk outside.",
    category: "Physical",
    difficulty: 1,
    friction: 2,
    impact: 5,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 10,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Lose Fat", "Reduce Burnout"],
    weather_restricted: true,
    defaultWhyToday: "A brief walk outdoors restarts circadian rhythm cues and decreases blood pooling in the legs.",
    defaultWhyRelevant: "Breaking desk-bound cycles with micro-movements maintains vascular and cognitive performance.",
    defaultHowTo: "Walk around the building block or garden nearby without your phone."
  },
  {
    id: "kb_creat_write_short",
    text: "Write one paragraph (journal entry or work outline).",
    category: "Creative",
    difficulty: 2,
    friction: 3,
    impact: 5,
    minimum_readiness: 2,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 10,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 3, physical: 1, social: 1, creative: 3 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reading/Writing", "Build Startup"],
    weather_restricted: false,
    defaultWhyToday: "Translating loose neural connections into syntax forces structured executive focus.",
    defaultWhyRelevant: "Building a daily expression habit transitions you from an attention consumer to a creator.",
    defaultHowTo: "Open a draft notes app. Write at least 4-5 lines of text on any topic of interest."
  },
  {
    id: "kb_soc_cafe",
    text: "Visit a local cozy café for coffee or tea.",
    category: "Social",
    difficulty: 2,
    friction: 6,
    impact: 5,
    minimum_readiness: 4,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 1, // cheap
    repeat_interval: 4,
    duration_mins: 60,
    applicable_days: ["Friday", "Saturday", "Sunday"],
    applicable_times: ["Afternoon", "Evening"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 2, social: 3, creative: 2 },
    financial_cost: "cheap",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Medium", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Dating/Social"],
    weather_restricted: false,
    defaultWhyToday: "Moderate environmental novelty triggers passive auditory curiosity and reduces isolation.",
    defaultWhyRelevant: "Stepping outside your immediate office/home ecosystem helps break cognitive loop states.",
    defaultHowTo: "Locate a local specialty coffee cafe. Sit down, sip a beverage, and read or observe without work screens."
  },
  {
    id: "kb_rec_massage",
    text: "Schedule a 60-minute recovery massage or spa wellness session.",
    category: "Recovery",
    difficulty: 3,
    friction: 8,
    impact: 8,
    minimum_readiness: 4,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 2, // premium
    repeat_interval: 14,
    duration_mins: 90,
    applicable_days: ["Saturday", "Sunday"],
    applicable_times: ["Morning", "Afternoon", "Evening"],
    requires_day_off: true,
    energy_cost: { mental: 1, physical: 1, social: 2, creative: 1 },
    financial_cost: "premium",
    restricted_values: ["Saving Stance"],
    intensities: { emotional: "Low", social_friction: "Medium", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout"],
    weather_restricted: false,
    defaultWhyToday: "Somatic therapy physically reduces deep-seated muscle tension and releases serotonin.",
    defaultWhyRelevant: "As a professional carrying intense work stress, structured recovery is a baseline necessity.",
    defaultHowTo: "Book a local sports massage or deep tissue treatment. Focus on breathing during the session."
  },
  {
    id: "kb_adv_amusement_park",
    text: "Visit a local amusement park or adventure zone.",
    category: "Adventure",
    difficulty: 5,
    friction: 10,
    impact: 9,
    minimum_readiness: 6,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 2, // premium
    repeat_interval: 30,
    duration_mins: 180,
    applicable_days: ["Saturday", "Sunday"],
    applicable_times: ["Morning", "Afternoon"],
    requires_day_off: true,
    energy_cost: { mental: 3, physical: 5, social: 4, creative: 3 },
    financial_cost: "premium",
    restricted_values: ["Saving Stance"],
    intensities: { emotional: "High", social_friction: "High", recovery_cost: "High" },
    applicable_goals: ["Reduce Burnout"],
    weather_restricted: true,
    defaultWhyToday: "Intense environmental acceleration triggers systemic adrenaline releases followed by deep cortisol resets.",
    defaultWhyRelevant: "Participating in high-novelty, child-like adventure breaks up professional hyper-logical mental modes.",
    defaultHowTo: "Book a ticket to a local park or activity zone and spend the day riding and walking outdoors."
  },
  {
    id: "kb_rec_early_sleep",
    text: "Turn off all screens by 9:30 PM and sleep early.",
    category: "Recovery",
    difficulty: 2,
    friction: 2,
    impact: 7,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 480,
    applicable_days: [],
    applicable_times: ["Night"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 1, social: 1, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Sleep Better", "Reduce Burnout"],
    weather_restricted: false,
    defaultWhyToday: "Sleeping early matches natural melatonin release peaks, increasing deep sleep proportion.",
    defaultWhyRelevant: "Optimizing your sleep architecture is the highest-leverage step to lowering stress and restoring focus.",
    defaultHowTo: "Put your phone in another room at 9:30 PM. Read a physical book or listen to white noise until asleep."
  },
  {
    id: "kb_soc_family_dinner",
    text: "Have a phone-free dinner with your family.",
    category: "Social",
    difficulty: 2,
    friction: 3,
    impact: 6,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 45,
    applicable_days: [],
    applicable_times: ["Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 1, social: 3, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Parenting", "Marriage"],
    weather_restricted: false,
    defaultWhyToday: "Intimate family connections act as a primary emotional buffer against career stress.",
    defaultWhyRelevant: "Nurturing your relationships keeps you grounded and provides critical perspective on work conflicts.",
    defaultHowTo: "Leave all phones in a drawer. Sit at the table and ask each person about one high and one low from their day."
  },
  {
    id: "kb_soc_call_friend",
    text: "Call a close friend for a 15-minute catch up.",
    category: "Social",
    difficulty: 2,
    friction: 2,
    impact: 6,
    minimum_readiness: 2,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 0,
    repeat_interval: 2,
    duration_mins: 15,
    applicable_days: [],
    applicable_times: ["Afternoon", "Evening"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 1, social: 3, creative: 1 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Medium", recovery_cost: "Low" },
    applicable_goals: ["Dating/Social"],
    weather_restricted: false,
    defaultWhyToday: "Relational conversations outside your work circle reduce professional isolation.",
    defaultWhyRelevant: "Maintaining strong social ties supports emotional balance and long-term satisfaction.",
    defaultHowTo: "Call a friend you haven't spoken to in a while. Ask them about their life first and listen actively."
  },
  {
    id: "kb_creat_write",
    text: "Write 500 words on a topic of interest (journal, post, code design).",
    category: "Creative",
    difficulty: 3,
    friction: 4,
    impact: 6,
    minimum_readiness: 4,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 2,
    duration_mins: 30,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 4, physical: 1, social: 1, creative: 5 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Medium", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Build Startup", "Reading/Writing"],
    weather_restricted: false,
    defaultWhyToday: "Writing forces cognitive structure, clarifying thoughts and training focus.",
    defaultWhyRelevant: "Developing a creation habit shifts your balance from screen consumption to constructive output.",
    defaultHowTo: "Open a clean document. Set a 20-minute timer. Write continuously without editing or checking details."
  },
  {
    id: "kb_creat_build",
    text: "Spend 45 minutes coding or designing a personal side project.",
    category: "Creative",
    difficulty: 4,
    friction: 5,
    impact: 7,
    minimum_readiness: 5,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 0,
    repeat_interval: 2,
    duration_mins: 45,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 5, physical: 1, social: 1, creative: 5 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "High", social_friction: "Low", recovery_cost: "Medium" },
    applicable_goals: ["Build Startup"],
    weather_restricted: false,
    defaultWhyToday: "Building feeds curiosity and builds technical agency outside your daily corporate role.",
    defaultWhyRelevant: "Taking action on your startup vision builds momentum towards career independence.",
    defaultHowTo: "Define one small feature (e.g. one API route or UI block). Build only that feature without distractions."
  },
  {
    id: "kb_joy_read",
    text: "Read 15 pages of a fiction or biography book.",
    category: "Joy",
    difficulty: 1,
    friction: 2,
    impact: 5,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 20,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 1, social: 1, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Sleep Better", "Reduce Burnout", "Reading"],
    weather_restricted: false,
    defaultWhyToday: "Reading narrative fiction lowers heart rate and provides healthy cognitive escapism.",
    defaultWhyRelevant: "This serves as a high-quality alternative to screen time, settling your brain before rest.",
    defaultHowTo: "Find a quiet corner. Set your phone to Do Not Disturb. Read 15 pages of your current physical book."
  },
  {
    id: "kb_joy_movie",
    text: "Watch a classic, high-rating movie without checking your phone.",
    category: "Joy",
    difficulty: 1,
    friction: 2,
    impact: 5,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 1, // cheap
    repeat_interval: 4,
    duration_mins: 120,
    applicable_days: ["Friday", "Saturday", "Sunday"],
    applicable_times: ["Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 1, social: 2, creative: 1 },
    financial_cost: "cheap",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout"],
    weather_restricted: false,
    defaultWhyToday: "Engaging in structured, high-quality storytelling restores emotional energy.",
    defaultWhyRelevant: "Learning to enjoy leisure guilt-free is key to escaping professional burnout cycles.",
    defaultHowTo: "Pick a movie. Put your phone in another room. Let yourself fully sink into the film."
  },
  {
    id: "kb_learn_podcast",
    text: "Listen to a 20-minute educational podcast.",
    category: "Learning",
    difficulty: 2,
    friction: 1,
    impact: 5,
    minimum_readiness: 1,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 1,
    duration_mins: 20,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening", "Night"],
    requires_day_off: false,
    energy_cost: { mental: 3, physical: 1, social: 1, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Build Startup", "Language/Learning"],
    weather_restricted: false,
    defaultWhyToday: "Audio learning utilizes passive time (like commuting or cooking) for active mental enrichment.",
    defaultWhyRelevant: "Absorbing insights from fields like design or psychology feeds your professional curiosity.",
    defaultHowTo: "Listen to an episode on Spotify or Apple Podcasts while doing chores or light stretches."
  },
  {
    id: "kb_adv_local_park",
    text: "Explore a nearby local park or biodiversity trail.",
    category: "Adventure",
    difficulty: 2,
    friction: 4,
    impact: 6,
    minimum_readiness: 3,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 0,
    repeat_interval: 3,
    duration_mins: 40,
    applicable_days: ["Saturday", "Sunday"],
    applicable_times: ["Morning", "Afternoon"],
    requires_day_off: false,
    energy_cost: { mental: 1, physical: 3, social: 1, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Medium", social_friction: "Low", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Lose Fat"],
    weather_restricted: true,
    defaultWhyToday: "Time spent in natural green spaces resets attention pathways and lowers stress markers.",
    defaultWhyRelevant: "Relocating or exploring local outdoor spaces breaks routine and expands your reality.",
    defaultHowTo: "Check the local database for a park. Spend 30 minutes walking, observing trees, and listening to sounds."
  },
  {
    id: "kb_adv_bookstore",
    text: "Visit a local bookstore and browse the shelves silently.",
    category: "Adventure",
    difficulty: 2,
    friction: 4,
    impact: 6,
    minimum_readiness: 2,
    maximum_readiness: 10,
    commute_friendly: false,
    cost_score: 1, // cheap
    repeat_interval: 5,
    duration_mins: 45,
    applicable_days: ["Friday", "Saturday", "Sunday"],
    applicable_times: ["Afternoon", "Evening"],
    requires_day_off: false,
    energy_cost: { mental: 2, physical: 2, social: 2, creative: 3 },
    financial_cost: "cheap",
    restricted_values: [],
    intensities: { emotional: "Low", social_friction: "Medium", recovery_cost: "Low" },
    applicable_goals: ["Reduce Burnout", "Reading"],
    weather_restricted: false,
    defaultWhyToday: "Physical bookstores trigger curiosity through tactile browsing and quiet spaces.",
    defaultWhyRelevant: "This gets you out of the house into an offline learning environment without high social demands.",
    defaultHowTo: "Go to a local bookstore. Browse sections you don't normally read. Pick up one book that intrigues you."
  },
  {
    id: "kb_contrib_mentor",
    text: "Write a message offering help or mentorship to a junior colleague.",
    category: "Contribution",
    difficulty: 2,
    friction: 3,
    impact: 6,
    minimum_readiness: 3,
    maximum_readiness: 10,
    commute_friendly: true,
    cost_score: 0,
    repeat_interval: 5,
    duration_mins: 15,
    applicable_days: [],
    applicable_times: ["Morning", "Afternoon", "Evening"],
    requires_day_off: false,
    energy_cost: { mental: 3, physical: 1, social: 3, creative: 2 },
    financial_cost: "free",
    restricted_values: [],
    intensities: { emotional: "Medium", social_friction: "High", recovery_cost: "Low" },
    applicable_goals: ["Build Startup", "Career Growth"],
    weather_restricted: false,
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
  { city: "Gurgaon", name: "Blue Tokai Café at Galleria", category: "Social", cost: "cheap", weather_restricted: false },
  { city: "Gurgaon", name: "Leisure Valley Park", category: "Adventure", cost: "free", weather_restricted: true },

  // Bengaluru
  { city: "Bengaluru", name: "Cubbon Park Walk", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Bengaluru", name: "Blossom Book House on Church Street", category: "Adventure", cost: "cheap", weather_restricted: false },
  { city: "Bengaluru", name: "Lalbagh Botanical Garden", category: "Adventure", cost: "free", weather_restricted: true },
  { city: "Bengaluru", name: "Third Wave Coffee Indiranagar", category: "Social", cost: "cheap", weather_restricted: false },

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

// --- 3. Dynamic Readiness Score Calculator ---
export function calculateReadinessScore(db) {
  const context = db.context || {};
  const profile = db.profile || {};
  
  // 1. Sleep term (20%)
  const sleepHours = context.sleep?.hours || 7;
  const sleepQuality = context.sleep?.quality || "good";
  let sleepVal = (sleepHours / 8) * 1.5;
  if (sleepQuality === "excellent") sleepVal += 0.5;
  else if (sleepQuality === "good") sleepVal += 0.2;
  else if (sleepQuality === "poor") sleepVal -= 0.5;
  else if (sleepQuality === "terrible") sleepVal -= 1.0;
  const sleepScore = Math.max(0, Math.min(2.0, sleepVal));

  // 2. Stress term (20%)
  const stress = context.mood?.rating || 5;
  const stressScore = Math.max(0, Math.min(2.0, (10 - stress) * 0.2));

  // 3. Energy term (20%)
  const energies = context.energies || { mental: 7, physical: 7, social: 7, creative: 7 };
  const avgEnergy = (energies.mental + energies.physical + energies.social + energies.creative) / 4;
  const energyScore = Math.max(0, Math.min(2.0, avgEnergy * 0.2));

  // 4. Momentum term (20%)
  const momentum = profile.momentum_score || 50;
  const momentumScore = Math.max(0, Math.min(2.0, momentum * 0.02));

  // 5. Yesterday's Completion Rate (20%)
  let yesterdayCompletion = profile.completion_rate / 100;
  if (Array.isArray(db.history) && db.history.length > 0) {
    const lastDay = db.history[db.history.length - 1];
    if (lastDay.tasks_total > 0) {
      yesterdayCompletion = lastDay.tasks_completed / lastDay.tasks_total;
    }
  }
  const yesterdayScore = Math.max(0, Math.min(2.0, yesterdayCompletion * 2.0));

  // Sum terms (base out of 10)
  let rawReadiness = (sleepScore + stressScore + energyScore + momentumScore + yesterdayScore) * 5; // normalize to 10 scale

  // Apply active timeline event penalties
  const activeTimeline = (profile.life_timeline || []).filter(e => e.status === 'active');
  const hasIllness = activeTimeline.some(e => e.type === 'Family Illness' || e.text?.toLowerCase().includes("illness") || e.text?.toLowerCase().includes("sick"));
  const hasTravel = activeTimeline.some(e => e.type === 'Relocation' || e.text?.toLowerCase().includes("travel") || e.text?.toLowerCase().includes("trip"));
  
  if (hasIllness) rawReadiness -= 2.0;
  if (hasTravel) rawReadiness -= 1.5;

  // Weather penalty
  if (context.environmental?.weather === "Rainy") {
    rawReadiness -= 0.5;
  }

  const finalReadiness = Math.min(10, Math.max(1, Math.round(rawReadiness)));
  profile.readiness_score = finalReadiness;
  return finalReadiness;
}

// --- 4. Dynamic Momentum Stage Evaluator ---
export function determineMomentumStage(db) {
  const profile = db.profile || {};
  const history = db.history || [];
  
  let avgCompletion = profile.completion_rate / 100;
  let avgMomentum = profile.momentum_score || 50;

  if (history.length >= 3) {
    const recent = history.slice(-7);
    const sumC = recent.reduce((acc, h) => acc + (h.tasks_total > 0 ? h.tasks_completed / h.tasks_total : 0.5), 0);
    const sumM = recent.reduce((acc, h) => acc + (h.momentum_score || 50), 0);
    avgCompletion = sumC / recent.length;
    avgMomentum = sumM / recent.length;
  }

  let calculatedStage = "Stage 1: Activation";
  if (avgCompletion > 0.85 && avgMomentum > 80) {
    calculatedStage = "Stage 4: Expansion";
  } else if (avgCompletion > 0.80 && avgMomentum > 70) {
    calculatedStage = "Stage 3: Growth";
  } else if (avgCompletion > 0.75 && avgMomentum > 55) {
    calculatedStage = "Stage 2: Consistency";
  }

  // Demotion Check (Last 3 days check)
  const previousStage = profile.momentum_stage || "Stage 1: Activation";
  if (history.length >= 3) {
    const last3 = history.slice(-3);
    const avgM3 = last3.reduce((acc, h) => acc + (h.momentum_score || 50), 0) / 3;
    
    if (previousStage === "Stage 4: Expansion" && avgM3 < 80) {
      calculatedStage = "Stage 3: Growth";
    } else if (previousStage === "Stage 3: Growth" && avgM3 < 70) {
      calculatedStage = "Stage 2: Consistency";
    } else if (previousStage === "Stage 2: Consistency" && avgM3 < 55) {
      calculatedStage = "Stage 1: Activation";
    }
  }

  profile.momentum_stage = calculatedStage;
  return calculatedStage;
}

// --- 5. Candidate Generator (Hard filter) ---
export function generateCandidates(db, context, coreValues, stage, readiness) {
  const weather = context.environmental?.weather || "Clear";
  const aqi = context.environmental?.world?.aqi || 80;
  const dayOfWeek = context.temporal?.day_of_week || "Monday";
  const timeOfDay = context.temporal?.time_of_day || "Morning";
  const financialStance = context.user_state?.financial_stance || "balanced";

  // Map stage to max friction allowed
  let maxFriction = 2;
  if (stage === "Stage 4: Expansion") maxFriction = 10;
  else if (stage === "Stage 3: Growth") maxFriction = 7;
  else if (stage === "Stage 2: Consistency") maxFriction = 4;

  return INTERVENTIONS_KB.filter(task => {
    // 1. Friction boundary check (Momentum Stages)
    if (task.friction > maxFriction) return false;

    // 2. Readiness Bounds check
    const minR = task.minimum_readiness || 1;
    const maxR = task.maximum_readiness || 10;
    if (readiness < minR || readiness > maxR) return false;

    // 3. Financial check
    if (financialStance === "saving_aggressively" && task.cost_score === 2) return false;

    // 4. Core Values checks
    if (task.restricted_values && task.restricted_values.some(val => coreValues.includes(val))) return false;

    // 5. Weather checks
    if (task.weather_restricted && weather === "Rainy") return false;

    // 6. AQI checks
    if (task.weather_restricted && aqi > 200) return false;

    // 7. Action Windows
    // requires_day_off check
    if (task.requires_day_off && !context.temporal?.is_weekend) return false;
    
    // Day of week check
    if (task.applicable_days && task.applicable_days.length > 0) {
      if (!task.applicable_days.includes(dayOfWeek)) return false;
    }

    // Time of day check
    if (task.applicable_times && task.applicable_times.length > 0) {
      if (!task.applicable_times.includes(timeOfDay)) return false;
    }

    return true;
  });
}

// --- 6. Explanation Engine Helper ---
export function generateExplanationTag(task, context, db) {
  const stress = context.user_state?.stress || 5;
  const sleepHours = context.user_state?.sleep?.hours || 7;
  const aqi = context.environmental?.world?.aqi || 80;
  
  // Look up history for climbing stress patterns
  let isStressClimbing = false;
  const history = db.history || [];
  if (history.length >= 3) {
    const h1 = history[history.length - 1].stress || 5;
    const h2 = history[history.length - 2].stress || 5;
    const h3 = history[history.length - 3].stress || 5;
    if (h1 > h2 && h2 > h3) {
      isStressClimbing = true;
    }
  }

  if (stress >= 7 && (task.category === "Recovery" || task.category === "Joy")) {
    if (isStressClimbing) {
      return "Because your stress has been climbing for three days.";
    }
    return "Because your stress is currently high and we need to calm your nervous system.";
  }

  if (sleepHours < 6.5 && (task.category === "Recovery" || task.category === "Joy")) {
    return "Because protecting your sleep is the highest leverage recovery today.";
  }

  if (task.weather_restricted && aqi > 150) {
    return "Replaced with an indoor adaptation to protect you from the critical NCR air quality.";
  }

  const subGoal = context.user_state?.active_goal?.subGoal || "Sleep Better";
  if (task.applicable_goals && task.applicable_goals.includes(subGoal)) {
    return `To build consistent progress towards your focus: "${subGoal}".`;
  }

  return "Selected to sustain positive momentum without overloading your energy buffer.";
}

// --- 7. EV Scoring Pipeline (AUM's First Law) ---
export function scoreCandidates(candidates, context, profile, db, readiness) {
  const ledger = profile.intervention_memory || [];
  const rejectionLedger = profile.rejection_ledger || [];
  const recTimestamps = profile.last_recommended_timestamps || {};
  const timeOfDay = context.temporal?.time_of_day || "Morning";
  
  return candidates.map(task => {
    // 1. Completion Probability Score (Sigmoid-weighted base)
    // Base centered at 0.9. Penalty for friction. Bonus for readiness.
    let baseProb = 0.9;
    
    // Friction penalty
    baseProb -= (task.friction - 1) * 0.08;
    
    // Readiness boost
    baseProb += (readiness - 5) * 0.04;

    // Commute friendly boost (if Morning or Evening)
    if (task.commute_friendly && (timeOfDay === "Morning" || timeOfDay === "Evening")) {
      baseProb += 0.1;
    }

    // 2. Preference Score (completed vs rejected history)
    const completedCount = ledger.filter(l => l.actionId === task.id && l.completed).length;
    const rejectedCount = rejectionLedger.filter(r => r.actionId === task.id).length;
    
    let preferenceScore = 1.0;
    if (rejectedCount >= 8) {
      preferenceScore = 0.0; // Block completely
    } else if (completedCount > 0 || rejectedCount > 0) {
      preferenceScore = completedCount / (completedCount + rejectedCount + 1);
    }

    // 3. Novelty Score (checks last recommended timestamp vs repeat interval)
    let noveltyScore = 1.0;
    const lastRecIso = recTimestamps[task.id];
    if (lastRecIso) {
      const lastRecDate = new Date(lastRecIso);
      const diffMs = new Date(context.temporal.timestamp) - lastRecDate;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      if (diffDays < task.repeat_interval) {
        // scale down novelty score
        noveltyScore = Math.max(0.1, diffDays / task.repeat_interval);
      }
    } else {
      noveltyScore = 1.25; // Novelty boost
    }

    // Compute Probability
    let finalProb = Math.min(0.98, Math.max(0.05, baseProb * preferenceScore * noveltyScore));

    // 4. Expected Value (Impact * Probability)
    const ev = task.impact * finalProb;

    return {
      task,
      probability: finalProb,
      ev
    };
  }).filter(c => c.ev > 0);
}

// --- 8. Diversity Engine & Day Set Simulation ---
export function simulateAndChooseDaySet(scoredCandidates, context, count) {
  // Sort candidates by EV score
  const sorted = [...scoredCandidates].sort((a, b) => b.ev - a.ev);
  
  if (sorted.length < count) {
    return {
      selected: sorted.map(s => s.task),
      backups: []
    };
  }

  // Pick top N candidates
  const selectedSet = sorted.slice(0, count).map(s => s.task);
  
  // Pick 2 backups from remaining candidates
  const selectedIds = selectedSet.map(s => s.id);
  const remaining = sorted.filter(s => !selectedIds.includes(s.task.id));
  const backups = remaining.slice(0, 2).map(s => s.task);

  return {
    selected: selectedSet,
    backups
  };
}

// --- 9. Check and Swap Blocked Actions ---
export function checkAndSwapBlockedActions(db, context) {
  const activeActions = db.actions || [];
  const backups = db.backups || [];
  
  if (activeActions.length === 0 || backups.length === 0) return { actions: activeActions, swapped: false };

  const weather = context.environmental?.weather || "Clear";
  const aqi = context.environmental?.world?.aqi || 80;
  
  let swappedOccurred = false;
  const updatedActions = activeActions.map(act => {
    if (act.status !== 'todo') return act;

    const kbTask = INTERVENTIONS_KB.find(k => k.id === act.id);
    if (!kbTask) return act;

    const weatherViolated = kbTask.weather_restricted && weather === "Rainy";
    const aqiViolated = kbTask.weather_restricted && aqi > 200;

    if (weatherViolated || aqiViolated) {
      const availableBackup = backups.shift();
      if (availableBackup) {
        swappedOccurred = true;
        
        let text = availableBackup.text;
        const city = db.profile?.city || "Gurgaon";
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
    backups,
    swapped: swappedOccurred
  };
}

// --- 10. Inject Local Place Names ---
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

// --- 11. Main Recommended Action Fetcher ---
export function getRecommendedInterventions(profile, context, history, db) {
  // 1. Calculate Readiness and Stage
  const readiness = calculateReadinessScore(db);
  const stage = determineMomentumStage(db);

  // 2. Decide move count (Dynamic Moves Scaling)
  let count = 4;
  if (readiness < 4) count = 3;
  else if (readiness > 7) count = 5;

  // 3. Generate Candidates
  const coreValues = profile.core_values || [];
  let candidates = generateCandidates(db, context, coreValues, stage, readiness);

  // 4. Score Candidates
  let scored = scoreCandidates(candidates, context, profile, db, readiness);

  // 5. Choose Day Set
  let result = simulateAndChooseDaySet(scored, context, count);

  // Calculate AUM Confidence (average success probability of chosen set)
  let avgProbability = 0.8;
  if (result.selected.length > 0) {
    const sumProb = result.selected.reduce((acc, act) => {
      const match = scored.find(s => s.task.id === act.id);
      return acc + (match ? match.probability : 0.8);
    }, 0);
    avgProbability = sumProb / result.selected.length;
  }
  let confidence = Math.round(avgProbability * 100);

  // 6. Low Confidence Override / Conservative Mode
  if (confidence < 45) {
    count = 3; // Force fewer recommendations
    // Filter candidates strictly for low friction recovery / joy tasks
    candidates = generateCandidates(db, context, coreValues, stage, readiness).filter(t => 
      t.friction <= 3 && (t.category === "Recovery" || t.category === "Joy")
    );
    scored = scoreCandidates(candidates, context, profile, db, readiness);
    result = simulateAndChooseDaySet(scored, context, count);
    
    // Recalculate confidence
    if (result.selected.length > 0) {
      const sumProb = result.selected.reduce((acc, act) => {
        const match = scored.find(s => s.task.id === act.id);
        return acc + (match ? match.probability : 0.8);
      }, 0);
      avgProbability = sumProb / result.selected.length;
    }
    confidence = Math.round(avgProbability * 100);
  }

  // 7. Inject Local Place Names
  const city = profile.city || "Gurgaon";
  let finalizedActions = injectLocalPlaceNames(result.selected, city);

  // 8. Inject structured explanation why (Explanation Engine)
  finalizedActions = finalizedActions.map(act => {
    const matchingKb = INTERVENTIONS_KB.find(k => k.id === act.id);
    const explanation = matchingKb ? generateExplanationTag(matchingKb, context, db) : "Selected to support momentum.";
    
    // Inject success probability for internal engine logic
    const matchingScored = scored.find(s => s.task.id === act.id);
    const successProb = matchingScored ? Math.round(matchingScored.probability * 100) : 80;

    return {
      ...act,
      whyToday: explanation,
      success_probability: successProb
    };
  });

  db.context = db.context || {};
  const gaps = calculateCategoryGaps(db);
  db.context.category_gaps = gaps;

  return {
    actions: finalizedActions,
    backups: result.backups,
    readiness_score: readiness,
    momentum_stage: stage,
    confidence_score: confidence
  };
}

export function calculateCategoryGaps(db) {
  const categories = [
    "Exercise", "Learning", "Recovery", "Entertainment", "Travel", 
    "Nature", "Food", "Relationships", "Work", "Parenting", "Spiritual", "Creation", "Adventure"
  ];
  const gaps = {};
  const now = new Date();
  
  categories.forEach(cat => {
    gaps[cat] = 999; // Default representing Never
  });

  if (db && db.memory) {
    const exps = db.memory.life_experiences || [];
    if (Array.isArray(exps)) {
      exps.forEach(exp => {
        const cat = exp.type;
        if (categories.includes(cat) && exp.timestamp) {
          const diffMs = now - new Date(exp.timestamp);
          const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          if (diffDays < gaps[cat]) {
            gaps[cat] = diffDays;
          }
        }
      });
    }
  }
  return gaps;
}
