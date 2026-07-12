import { getLocationContext } from './location_intelligence.js';


// Helper to determine active seasonal events based on date
export function getSeasonalEvents(date) {
  const events = [];
  const month = date.getUTCMonth(); // 0-11
  const day = date.getUTCDate(); // 1-31

  // 1. IPL Season (April - May)
  if (month === 3 || month === 4) {
    events.push("IPL Cricket Season");
  }

  // 2. Salary Week (1st - 7th of any month)
  if (day >= 1 && day <= 7) {
    events.push("Salary Week");
  }

  // 3. Financial Year End (March 15th - April 5th)
  if ((month === 2 && day >= 15) || (month === 3 && day <= 5)) {
    events.push("Financial Year End");
  }

  // 4. Major Indian Festivals
  if (month === 7 && day === 15) {
    events.push("Independence Day Holiday");
  } else if (month === 9 && day === 2) {
    events.push("Gandhi Jayanti Holiday");
  } else if (month === 0 && day === 26) {
    events.push("Republic Day Holiday");
  } else if (month === 2 && day === 25) {
    events.push("Holi Festival");
  } else if (month === 10 && day === 12) {
    events.push("Diwali Festival");
  }

  return events;
}

// Helper to get World Engine metrics based on city and time of day
export function getWorldEngineMetrics(city, timeOfDay) {
  const defaults = {
    aqi: 80,
    traffic: "Low",
    heat_index: "Moderate",
    upcoming_events: [],
    local_opportunities: []
  };

  const normalizedCity = (city || 'Gurgaon').toLowerCase();

  switch (normalizedCity) {
    case 'gurgaon':
      defaults.aqi = 250; // High pollution typical of NCR
      defaults.traffic = (timeOfDay === 'Morning' || timeOfDay === 'Evening') ? "Critical" : "Moderate";
      defaults.heat_index = "High";
      defaults.upcoming_events = ["IPL Screening at Sector 29", "Local Cyber Hub Music Festival"];
      defaults.local_opportunities = ["Tau Devi Lal Biodiversity Park (walking)", "Aravalli Hills Trail (running)"];
      break;
    case 'bengaluru':
    case 'bangalore':
      defaults.aqi = 65; // Moderate
      defaults.traffic = "High"; // Famous traffic jam profiles
      defaults.heat_index = "Pleasant";
      defaults.upcoming_events = ["Tech Startup Networking Mixer", "Live Concert at Palace Grounds"];
      defaults.local_opportunities = ["Cubbon Park (running)", "Lalbagh Botanical Garden (walk)"];
      break;
    case 'ballia':
      defaults.aqi = 45; // Very clean air
      defaults.traffic = "Low";
      defaults.heat_index = "Very High";
      defaults.upcoming_events = ["Dadri Mela Festival", "Local Temple Satsang"];
      defaults.local_opportunities = ["Surha Taal Lake bird-watching trail", "Ganga River Ghat walking route"];
      break;
    case 'mumbai':
      defaults.aqi = 110; // Moderate-High
      defaults.traffic = "High";
      defaults.heat_index = "Humid & Hot";
      defaults.upcoming_events = ["Marine Drive Sunday Art Walk", "Bollywood Movie Premiere"];
      defaults.local_opportunities = ["Sanjay Gandhi National Park (cycling)", "Juhu Beach running trail"];
      break;
    case 'delhi':
      defaults.aqi = 300; // Critical AQI
      defaults.traffic = (timeOfDay === 'Morning' || timeOfDay === 'Evening') ? "Critical" : "High";
      defaults.heat_index = "Extreme Heat";
      defaults.upcoming_events = ["Food Walk at Old Delhi", "Theatre plays at Mandi House"];
      defaults.local_opportunities = ["Lodhi Gardens (yoga/walking)", "Sunder Nursery picnic walking trails"];
      break;
  }

  return defaults;
}

/**
 * Main coordinator that gathers all layers of context
 */
export function buildUnifiedContext(db, dateOverride = null) {
  const profile = db.profile || {};
  const dbContext = db.context || {};
  
  // 1. Resolve Time travel / virtual clock dates
  const now = dateOverride ? new Date(dateOverride) : (db.virtual_time ? new Date(db.virtual_time) : new Date());
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[now.getUTCDay()];
  
  let timeOfDay = "Morning";
  const hours = now.getUTCHours();
  if (hours >= 12 && hours < 17) timeOfDay = "Afternoon";
  else if (hours >= 17 && hours < 21) timeOfDay = "Evening";
  else if (hours >= 21 || hours < 5) timeOfDay = "Night";

  // 2. Load World Engine layers
  const locationCtx = getLocationContext(db, now);
  const seasonalEvents = getSeasonalEvents(now);
  const worldMetrics = getWorldEngineMetrics(locationCtx.city, timeOfDay);

  // 3. Trajectory detection helper
  const history = db.history || [];
  let trajectory = "Stable";
  if (history.length >= 2) {
    const recent = history.slice(-3);
    let improvementCount = 0;
    let declineCount = 0;
    for (let i = 1; i < recent.length; i++) {
      const prevRatio = recent[i - 1].tasks_total > 0 ? recent[i - 1].tasks_completed / recent[i - 1].tasks_total : 0.5;
      const currRatio = recent[i].tasks_total > 0 ? recent[i].tasks_completed / recent[i].tasks_total : 0.5;
      if (currRatio > prevRatio) improvementCount++;
      else if (currRatio < prevRatio) declineCount++;
    }
    if (improvementCount > declineCount) trajectory = "Improving";
    else if (declineCount > improvementCount) trajectory = "Slipping";
  }

  // 4. Compile unified context payload
  const formattedTimeStr = `${dayOfWeek} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const current_state_object = {
    Physical: {
      sleep_hours: dbContext.sleep?.hours || 7.0,
      sleep_quality: dbContext.sleep?.quality || "good",
      physical_energy: dbContext.energies?.physical || 7,
      sleep_energy: dbContext.sleep?.energy || 7
    },
    Mental: {
      stress_rating: dbContext.mood?.rating || 5,
      mood_state: dbContext.mood?.state || "clear",
      mental_energy: dbContext.energies?.mental || 7,
      creative_energy: dbContext.energies?.creative || 7
    },
    Social: {
      social_energy: dbContext.energies?.social || 7,
      relationships_count: profile.relationships?.length || 0,
      active_threads: profile.active_threads || []
    },
    Goal: {
      active_goal: profile.active_goal?.subGoal || "Sleep Better",
      current_chapter: profile.current_chapter || "Stable Routine",
      pinned_mission: profile.pinned_mission?.title || "Lose 12% Body Fat"
    },
    Context: {
      timestamp: now.toISOString(),
      formatted_time: formattedTimeStr,
      today: dayOfWeek
    },
    Environment: {
      city: locationCtx.city,
      zone: locationCtx.zone,
      weather: dbContext.environmental?.weather || "Clear",
      aqi: worldMetrics.aqi || 80,
      traffic: worldMetrics.traffic || "Low"
    },
    Trajectory: {
      rolling_momentum: profile.momentum_score || 50,
      momentum_earned_today: profile.momentum_earned_today || 0,
      momentum_debt: profile.momentum_debt || 0,
      readiness_score: profile.readiness_score || 5,
      momentum_stage: profile.momentum_stage || "Stage 1: Activation",
      trend: trajectory
    }
  };

  return {
    temporal: {
      timestamp: now.toISOString(),
      date_string: now.toISOString().split('T')[0],
      day_of_week: dayOfWeek,
      time_of_day: timeOfDay,
      is_weekend: dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday'
    },
    environmental: {
      weather: dbContext.environmental?.weather || "Clear",
      seasons: seasonalEvents,
      world: worldMetrics
    },
    user_state: {
      active_goal: profile.active_goal || { category: "Health", subGoal: "Sleep Better" },
      current_chapter: profile.current_chapter || "Stable Routine",
      financial_stance: profile.financial_stance || "balanced",
      relationships: profile.relationships || [],
      energies: {
        mental: dbContext.energies?.mental || 7,
        physical: dbContext.energies?.physical || 7,
        social: dbContext.energies?.social || 7,
        creative: dbContext.energies?.creative || 7
      },
      stress: dbContext.mood?.rating || 5,
      creation_ratio: (dbContext.creation_minutes && (dbContext.creation_minutes + dbContext.consumption_minutes) > 0)
        ? Math.round((dbContext.creation_minutes / (dbContext.creation_minutes + dbContext.consumption_minutes)) * 100)
        : 0,
      creation_minutes: dbContext.creation_minutes || 0,
      consumption_minutes: dbContext.consumption_minutes || 0
    },
    memory: {
      momentum_score: profile.momentum_score || 50,
      archetype: profile.archetype || "The Rebuilder",
      current_risks: db.insights?.current_risks || [],
      current_wins: db.insights?.current_wins || [],
      active_life_events: (profile.life_timeline || []).filter(e => e.status === 'active')
    },
    location: locationCtx,
    current_state_object
  };
}
