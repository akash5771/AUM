import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, updateContext, updateRealtimeMomentum } from '@/services/db';
import { triggerCompanionComment, parseCheckinStoryService } from '@/services/groq';
import { isPeriodUnlocked } from '@/services/recommendations';

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
    
    const newMoodRating = body.mood?.rating || 5;
    const newMoodState = body.mood?.state || "clear";
    
    // Parse stories asynchronously/synchronously to get estimated minutes
    const creationStory = body.creation_story || "";
    const consumptionStory = body.consumption_story || "";
    const estimatedMinutes = await parseCheckinStoryService(creationStory, consumptionStory);

    // Log updates
    const contextUpdates = {
      sleep: {
        hours: parseFloat(body.sleep?.hours) || 7.0,
        quality: body.sleep?.quality || "good"
      },
      mood: {
        rating: parseInt(newMoodRating),
        state: newMoodState
      },
      energies: {
        mental: parseInt(body.energies?.mental) || 7,
        physical: parseInt(body.energies?.physical) || 7,
        social: parseInt(body.energies?.social) || 7,
        creative: parseInt(body.energies?.creative) || 7
      },
      creation_story: creationStory,
      consumption_story: consumptionStory,
      creation_minutes: estimatedMinutes.creation_minutes,
      consumption_minutes: estimatedMinutes.consumption_minutes,
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

    // Sync fresh DB instance
    const freshDb = await readDB();
    await updateRealtimeMomentum(freshDb);

    // Trigger AI Companion Comment if stress is critical or any energy is depleted
    let shouldTriggerComment = false;
    let detail = {};

    const avgEnergy = (contextUpdates.energies.mental + contextUpdates.energies.physical + contextUpdates.energies.social + contextUpdates.energies.creative) / 4;

    if ((newMoodRating > oldMoodRating && newMoodRating >= 7) || 
        (newMoodState !== oldMoodState && ["stressed", "anxious", "exhausted"].includes(newMoodState)) ||
        (avgEnergy <= 4)) {
      shouldTriggerComment = true;
      detail = {
        oldRating: oldMoodRating,
        newRating: newMoodRating,
        state: newMoodState,
        energy: avgEnergy
      };

      // Generate a dynamic recovery task
      try {
        const { generateSingleContextualAction } = await import('@/services/groq');
        const locationType = "Home";
        const currentAssumedLocation = `${locationType}`;
        const newAction = await generateSingleContextualAction(freshDb, currentAssumedLocation);
        
        // Find if we have a locked task to replace, or if we can just push it
        const latestDb = await readDB();
        const lockedTaskIndex = latestDb.actions.findIndex(a => 
          a.status === 'todo' && 
          a.scheduled_time && 
          !isPeriodUnlocked(a.scheduled_time, timeOfDay)
        );
        
        if (lockedTaskIndex !== -1) {
          latestDb.actions[lockedTaskIndex] = {
            ...latestDb.actions[lockedTaskIndex],
            text: newAction.text,
            category: newAction.category,
            difficulty: newAction.difficulty,
            whyToday: `Anxious Moment: ${newAction.whyToday} (Triggered by your logged stress/energy state)`,
            whyRelevant: newAction.whyRelevant,
            howTo: newAction.howTo,
            scheduled_time: timeOfDay, // Unlock immediately!
            locked: false
          };
        } else {
          const uniqueId = `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          latestDb.actions.push({
            ...newAction,
            id: uniqueId,
            status: 'todo',
            scheduled_time: timeOfDay,
            locked: false
          });
          latestDb.profile.total_actions_generated = (latestDb.profile.total_actions_generated || 0) + 1;
        }
        
        // Add chat message announcing it
        latestDb.chat_history.push({
          sender: "AUM",
          text: `🚨 Akash, I noticed your stress is at ${newMoodRating}/10 (${newMoodState}) and average energy is low. I've unlocked a recovery task for you: "${newAction.text}". Let's take a break to restore your energy buffer.`,
          timestamp: now.toISOString()
        });
        
        await writeDB(latestDb);
      } catch (err) {
        console.error("Failed to generate dynamic stress task:", err);
      }
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
