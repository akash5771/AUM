import { NextResponse } from 'next/server';
import { readDB, writeDB, updateProfile } from '@/services/db';
import { generateDailyActionsService } from '@/services/gemini';

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
    
    // Map onboarding wizard fields to profile structure
    const mappedProfile = {
      ...db.profile,
      name: body.name || "",
      age: body.age || "",
      gender: body.gender || "",
      job: body.job || body.role || "",
      role: body.job || body.role || "",
      workHours: body.workHours || "",
      workDays: parseInt(body.workDays) || 5,
      maritalStatus: body.maritalStatus || "",
      kids: parseInt(body.kids) || 0,
      idealLife: body.idealLife || "",
      goals: body.goal || body.goals || "",
      goal: body.goal || body.goals || "",
      challenges: body.challenges || body.problem || "",
      problem: body.challenges || body.problem || "",
      lifeSatisfaction: parseInt(body.lifeSatisfaction) || 5,
      lifeAreas: body.lifeAreas || [],
      
      // Initialize gamification state
      level: 0,
      xp: 0,
      streak: 0,
      completion_rate: 0,
      total_actions_generated: 5,
      total_actions_completed: 0,
      level_up_celebration_pending: false,
      onboarding_completed: true
    };

    // Update profile
    db.profile = mappedProfile;
    
    // Trigger initial action generation immediately based on new onboarding
    const initialActions = await generateDailyActionsService();
    db.actions = initialActions;
    
    // Set environmental context default based on system/virtual time
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = db.virtual_time ? new Date(db.virtual_time) : new Date();
    const dayOfWeek = days[now.getDay()];
    let timeOfDay = "Morning";
    const hours = now.getHours();
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
      // When onboarding completes, let's keep the context logging uncompleted/unfrozen
      // so they can log their context on the dashboard as part of their daily routine
      is_frozen: false,
      last_logged: ""
    };
    
    // Add welcome chat companion message
    db.chat_history.push({
      sender: "AUM",
      text: `Hello ${mappedProfile.name}! Welcome to AUM. I've analyzed your profile as a ${mappedProfile.role}. You've noted your biggest challenge as "${mappedProfile.challenges}". I've generated your very first Daily 5 momentum tasks to help you start shaping your life. Take a look and let me know how you feel!`,
      timestamp: now.toISOString()
    });

    await writeDB(db);
    return NextResponse.json(db.profile);
  } catch (error) {
    console.error("Profile onboarding route error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
