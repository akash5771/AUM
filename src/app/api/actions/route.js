import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, getMomentumDayString, processDayTransition } from '@/services/db';
import { getCurrentTimeOfDay, isPeriodUnlocked } from '@/services/recommendations';

const STARTER_TASK = {
  id: "morning-checkin",
  text: "Start the Day: Log morning check-in",
  category: "Health",
  difficulty: 1,
  whyToday: "To sync your sleep, energy and stress levels.",
  whyRelevant: "Helps Aarav understand your state of mind to customize your daily moves.",
  howTo: "Send any message in the chat to start your morning check-in.",
  status: "todo",
  scheduled_time: "Morning"
};

export async function GET() {
  try {
    const db = await readDB();
    const now = getDbCurrentTime(db);
    const currentMomentumDay = getMomentumDayString(now);
    
    const isFirstTime = !db.profile.last_generated_day;
    const isNewDay = db.profile.last_generated_day !== currentMomentumDay;
    const isEmptyActions = !db.actions || db.actions.length === 0;

    if (isFirstTime || isNewDay || isEmptyActions) {
      if (!isFirstTime && isNewDay && !isEmptyActions) {
        await processDayTransition(db);
      }
      
      const latestDb = await readDB();
      latestDb.actions = [STARTER_TASK];
      latestDb.profile.last_generated_day = currentMomentumDay;
      latestDb.profile.water_cups = 0;
      latestDb.profile.notified_periods = [];
      latestDb.context.checkin_stage = "waiting_for_sleep";
      latestDb.context.is_frozen = false;
      
      await writeDB(latestDb);
      return NextResponse.json([{ ...STARTER_TASK, locked: false }]);
    }
    
    const currentTimeOfDay = getCurrentTimeOfDay(now);
    
    // Period unlock nudge trigger
    db.profile.notified_periods = db.profile.notified_periods || [];
    const periodNudgeKey = `${currentMomentumDay}_${currentTimeOfDay}`;
    if (currentTimeOfDay !== "Morning" && !db.profile.notified_periods.includes(periodNudgeKey)) {
      const newlyUnlockedTasks = db.actions.filter(a => (a.scheduled_time === currentTimeOfDay || a.scheduled_time === undefined) && a.status === 'todo');
      if (newlyUnlockedTasks.length > 0) {
        db.profile.notified_periods.push(periodNudgeKey);
        const taskText = newlyUnlockedTasks[0].text;
        db.chat_history.push({
          sender: "AUM",
          text: `☀️ *Your ${currentTimeOfDay} move is unlocked:* "${taskText}". Let's keep the momentum going! How is your energy holding up?`,
          timestamp: now.toISOString()
        });
        await writeDB(db);
      }
    }
    
    const processedActions = db.actions.map(act => {
      const sTime = act.scheduled_time || "Morning";
      const isUnlocked = isPeriodUnlocked(sTime, currentTimeOfDay);
      return {
        ...act,
        scheduled_time: sTime,
        locked: !isUnlocked && act.status === 'todo'
      };
    });
    
    return NextResponse.json(processedActions);
  } catch (error) {
    console.error("Actions GET route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = await readDB();
    const now = getDbCurrentTime(db);
    
    db.actions = [STARTER_TASK];
    db.profile.last_generated_day = getMomentumDayString(now);
    db.profile.water_cups = 0;
    db.profile.notified_periods = [];
    db.context.checkin_stage = "waiting_for_sleep";
    db.context.is_frozen = false;
    
    await writeDB(db);
    return NextResponse.json([{ ...STARTER_TASK, locked: false }]);
  } catch (error) {
    console.error("Actions POST route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
