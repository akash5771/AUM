import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, getMomentumDayString, processDayTransition } from '@/services/db';
import { generateDailyActionsService } from '@/services/groq';

export async function GET() {
  try {
    const db = await readDB();
    const now = getDbCurrentTime(db);
    const currentMomentumDay = getMomentumDayString(now);
    
    // Check if we need to transition to a new day
    const isFirstTime = !db.profile.last_generated_day;
    const isNewDay = db.profile.last_generated_day !== currentMomentumDay;
    const isEmptyActions = !db.actions || db.actions.length === 0;

    if (isFirstTime || isNewDay || isEmptyActions) {
      // If there were actions and it's a new day, process the transition
      if (!isFirstTime && isNewDay && !isEmptyActions) {
        await processDayTransition(db);
      }
      
      // Generate new actions (which saves them to the DB)
      const newActions = await generateDailyActionsService();
      
      // Sync last generated day
      const latestDb = await readDB();
      latestDb.profile.last_generated_day = currentMomentumDay;
      await writeDB(latestDb);
      
      return NextResponse.json(newActions);
    }
    
    return NextResponse.json(db.actions);
  } catch (error) {
    console.error("Actions GET route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const newActions = await generateDailyActionsService();
    const db = await readDB();
    
    db.actions = newActions;
    // Sync last generated day
    const now = getDbCurrentTime(db);
    db.profile.last_generated_day = getMomentumDayString(now);
    
    await writeDB(db);
    return NextResponse.json(newActions);
  } catch (error) {
    console.error("Actions POST route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
