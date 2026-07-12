import { NextResponse } from 'next/server';
import { readDB, writeDB, updateProfile } from '@/services/db';
import { generateDailyActionsService, generateCompanionNameService } from '@/services/groq';

export async function GET() {
  try {
    const db = await readDB();
    return NextResponse.json({
      ...db.profile,
      history: db.history || []
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const db = await readDB();
    
    const companionName = await generateCompanionNameService(body.name || "User");
    
    // Map onboarding wizard fields to profile structure
    const mappedProfile = {
      ...db.profile,
      name: body.name || "",
      companion_name: companionName,
      age: body.age || "",
      gender: body.gender || "",
      job: body.job || body.role || "",
      role: body.job || body.role || "",
      city: body.city || "Bengaluru",
      workHours: body.workHours || "",
      workDays: parseInt(body.workDays) || 5,
      maritalStatus: body.maritalStatus || "",
      kids: parseInt(body.kids) || 0,
      
      core_values: body.core_values || [],
      current_chapter: body.current_chapter || "Stable Routine",
      financial_stance: body.financial_stance || "balanced",
      purpose: body.purpose || { whyItMatters: "", whoBenefits: "", futureBuilding: "" },
      active_goal: body.active_goal || { category: "Health", subGoal: "Sleep Better" },
      
      // Initialize gamification state
      streak: 0,
      completion_rate: 0,
      total_actions_generated: 5,
      total_actions_completed: 0,
      momentum_score: 50,
      sub_scores: { recovery: 50, execution: 50, connection: 50, curiosity: 50, courage: 50, consistency: 50 },
      behavioral_dna: { stress_resilience_factor: 1.0, preferred_recovery_categories: ["Recovery"], weekend_activity_multiplier: 1.0 },
      effectiveness_ledger: [],
      intervention_memory: [],
      failure_repository: [],
      identity_evolution: [],
      intentional_days_count: 0,
      intentional_days_rate: 0,
      onboarding_completed: true
    };

    // Update profile
    db.profile = mappedProfile;
    
    // Set environmental context default based on system/virtual time
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = db.virtual_time ? new Date(db.virtual_time) : new Date();
    const dayOfWeek = days[now.getUTCDay()];
    let timeOfDay = "Morning";
    const hours = now.getUTCHours();
    if (hours >= 12 && hours < 17) timeOfDay = "Afternoon";
    else if (hours >= 17 && hours < 21) timeOfDay = "Evening";
    else if (hours >= 21 || hours < 5) timeOfDay = "Night";
    
    db.context = {
      ...db.context,
      environmental: {
        time: timeOfDay,
        day_of_week: dayOfWeek,
        weather: db.context.environmental?.weather || "Clear"
      },
      is_frozen: false,
      last_logged: ""
    };

    // Trigger initial action generation immediately based on new onboarding
    const initialActions = await generateDailyActionsService();
    db.actions = initialActions;
    
    // Add welcome chat companion message
    db.chat_history.push({
      sender: "AUM",
      text: `Hello ${mappedProfile.name}! I am ${companionName}, your AI companion. I've analyzed your profile as a ${mappedProfile.role} in your "${mappedProfile.current_chapter}" chapter. You've anchored your purpose around: "${mappedProfile.purpose.whyItMatters}". I've generated your very first Daily 5 momentum tasks to support this. Let's take it one step at a time!`,
      timestamp: now.toISOString()
    });

    await writeDB(db);
    return NextResponse.json(db.profile);
  } catch (error) {
    console.error("Profile onboarding route error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
