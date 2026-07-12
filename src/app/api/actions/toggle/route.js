import { NextResponse } from 'next/server';
import { readDB, writeDB, toggleActionStatus, rateAction, getDbCurrentTime } from '@/services/db';
import { triggerCompanionComment } from '@/services/gemini';

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
    const db = await readDB();
    
    // If the task transitioned to "done", trigger companion comments
    if (status === 'done' && oldStatus !== 'done') {
      // Check if all actions are now completed
      const allCompleted = db.actions.every(a => a.status === 'done');
      
      if (allCompleted) {
        // Trigger screen-wide double dopamine hit message
        db.chat_history.push({
          sender: "AUM",
          text: `Akash, you did it! 5 out of 5 actions completed today! That is a clean sweep of your momentum day. Take a moment to feel that sense of accomplishment. I am extremely proud of your consistency today!`,
          timestamp: getDbCurrentTime(db).toISOString()
        });
        await writeDB(db);
      } else {
        // Trigger a comment for this specific action
        await triggerCompanionComment('task_completed', {
          taskText: action.text,
          category: action.category
        });
      }
    }
    
    // If archetype evolved during the action, trigger the comment
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
