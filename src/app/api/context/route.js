import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, updateContext } from '@/services/db';
import { triggerCompanionComment } from '@/services/gemini';

export async function GET() {
  try {
    const db = await readDB();
    return NextResponse.json(db.context);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const db = await readDB();
    
    // Automatically set environmental tags using current virtual time
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = getDbCurrentTime(db);
    const dayOfWeek = days[now.getDay()];
    
    let timeOfDay = "Morning";
    const hours = now.getHours();
    if (hours >= 12 && hours < 17) timeOfDay = "Afternoon";
    else if (hours >= 17 && hours < 21) timeOfDay = "Evening";
    else if (hours >= 21 || hours < 5) timeOfDay = "Night";

    const oldMoodRating = db.context.mood?.rating || 5;
    const oldMoodState = db.context.mood?.state || "clear";
    const oldEnergy = db.context.sleep?.energy || 5;

    const newMoodRating = body.mood?.rating || 5;
    const newMoodState = body.mood?.state || "clear";
    const newEnergy = body.sleep?.energy || 5;

    // Log updates
    const contextUpdates = {
      sleep: {
        hours: parseFloat(body.sleep?.hours) || 7.0,
        quality: body.sleep?.quality || "good",
        energy: parseInt(newEnergy)
      },
      mood: {
        rating: parseInt(newMoodRating),
        state: newMoodState
      },
      environmental: {
        time: timeOfDay,
        day_of_week: dayOfWeek,
        weather: body.environmental?.weather || "Clear"
      },
      is_frozen: true,
      last_logged: now.toISOString().split('T')[0]
    };

    // Save context updates
    const updatedContext = await updateContext(contextUpdates);

    // Check triggers for AI companion chat activation
    // Trigger 1: Stress rating increased significantly (rating goes up by 2+ or exceeds 7)
    // Trigger 2: Mood state changed to negative (stressed, anxious, exhausted)
    // Trigger 3: Energy level dropped significantly (dropped below 4)
    let shouldTriggerComment = false;
    let detail = {};

    if ((newMoodRating > oldMoodRating && newMoodRating >= 7) || 
        (newMoodState !== oldMoodState && ["stressed", "anxious", "exhausted"].includes(newMoodState)) ||
        (newEnergy < oldEnergy && newEnergy <= 4)) {
      shouldTriggerComment = true;
      detail = {
        oldRating: oldMoodRating,
        newRating: newMoodRating,
        state: newMoodState,
        energy: newEnergy
      };
    }

    if (shouldTriggerComment) {
      await triggerCompanionComment('context_updated', detail);
    }

    return NextResponse.json(updatedContext);
  } catch (error) {
    console.error("Context update route error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
