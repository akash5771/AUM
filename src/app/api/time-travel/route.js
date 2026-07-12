import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, hasCrossed6AM, processDayTransition } from '@/services/db';
import { generateDailyActionsService } from '@/services/groq';

export async function GET() {
  try {
    const db = await readDB();
    const virtualTime = db.virtual_time;
    return NextResponse.json({
      virtual_time: virtualTime,
      current_time: getDbCurrentTime(db).toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { action, value } = await request.json();
    const db = await readDB();
    
    const oldTime = getDbCurrentTime(db);
    let newTime = new Date(oldTime);
    
    if (action === "reset") {
      db.virtual_time = null;
      await writeDB(db);
      return NextResponse.json({
        virtual_time: null,
        current_time: new Date().toISOString(),
        dayTransitionCrossed: false
      });
    } else if (action === "set") {
      newTime = new Date(value);
    } else if (action === "advance") {
      const hours = parseInt(value) || 0;
      newTime.setHours(newTime.getHours() + hours);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    
    const oldTimeStr = oldTime.toISOString();
    const newTimeStr = newTime.toISOString();
    
    // Check day transition boundary (6 AM)
    const crossed6AM = hasCrossed6AM(oldTimeStr, newTimeStr);
    let transitionSummary = null;
    let newActions = [];
    
    if (crossed6AM) {
      // Process day transition in DB
      transitionSummary = await processDayTransition(db);
      
      // Temporarily set the virtual time so generateDailyActionsService gets context for the new time
      db.virtual_time = newTimeStr;
      await writeDB(db);
      
      // Generate new actions for the new day
      newActions = await generateDailyActionsService();
      
      // Read DB again to make sure we don't overwrite changes
      const latestDb = await readDB();
      latestDb.actions = newActions;
      latestDb.profile.total_actions_generated = (latestDb.profile.total_actions_generated || 0) + 5;
      // Mark context as unfrozen for logging on the new day
      latestDb.context.is_frozen = false;
      latestDb.context.last_logged = "";
      
      db.actions = latestDb.actions;
      db.profile = latestDb.profile;
      db.context = latestDb.context;
    }
    
    db.virtual_time = newTimeStr;
    await writeDB(db);
    
    return NextResponse.json({
      virtual_time: db.virtual_time,
      current_time: newTimeStr,
      dayTransitionCrossed: crossed6AM,
      transitionSummary,
      actions: crossed6AM ? newActions : db.actions
    });
  } catch (error) {
    console.error("Time travel error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
