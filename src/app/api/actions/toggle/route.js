import { NextResponse } from 'next/server';
import { readDB, writeDB, toggleActionStatus, rateAction, getDbCurrentTime } from '@/services/db';
import { triggerCompanionComment } from '@/services/groq';

export async function POST(request) {
  try {
    const { actionId, status, rating } = await request.json();
    if (!actionId || !status) {
      return NextResponse.json({ error: "Missing actionId or status" }, { status: 400 });
    }
    
    const dbBefore = await readDB();
    const action = dbBefore.actions.find(a => a.id === actionId);
    if (!action) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }
    
    const oldStatus = action.status;
    
    // Toggle or rate action
    if (status === 'done' && rating !== undefined) {
      await rateAction(actionId, parseInt(rating));
    } else {
      await toggleActionStatus(actionId, status);
    }
    
    // Fetch fresh database state
    let db = await readDB();
    
    // Log User event to chat history
    if (status === 'done' && oldStatus !== 'done') {
      db.chat_history.push({
        sender: "User",
        text: `✅ ${action.text}`,
        type: "activity_completion",
        timestamp: getDbCurrentTime(db).toISOString()
      });
      await writeDB(db);
      
      // Refresh DB
      db = await readDB();

      // Check if all actions are now completed
      const allCompleted = db.actions.every(a => a.status === 'done');
      
      if (allCompleted) {
        db.chat_history.push({
          sender: "AUM",
          text: `Akash, you did it! Complete clean sweep of today's moves. Small actions build momentum. Let's protect tomorrow now!`,
          timestamp: getDbCurrentTime(db).toISOString()
        });
        await writeDB(db);
      } else {
        await triggerCompanionComment('task_completed', {
          taskText: action.text,
          category: action.category
        });
      }
    } else if (status === 'skipped' && oldStatus !== 'skipped') {
      db.chat_history.push({
        sender: "User",
        text: `Ignored: ${action.text}`,
        type: "activity_rejection",
        timestamp: getDbCurrentTime(db).toISOString()
      });
      db.chat_history.push({
        sender: "AUM",
        text: "Looks like today got away from you. That's okay. Let's protect tomorrow instead.",
        timestamp: getDbCurrentTime(db).toISOString()
      });
      await writeDB(db);
    }
    
    // If archetype evolved during the action, trigger the comment
    db = await readDB();
    if (db.profile.archetype !== dbBefore.profile.archetype) {
      await triggerCompanionComment('archetype_unlocked', {
        archetype: db.profile.archetype
      });
    }
    
    // Re-fetch database to get updated chat history and profiles
    const finalDb = await readDB();
    
    return NextResponse.json({
      actions: finalDb.actions,
      profile: finalDb.profile,
      chat_history: finalDb.chat_history
    });
  } catch (error) {
    console.error("Actions toggle route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
