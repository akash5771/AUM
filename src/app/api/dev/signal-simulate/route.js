import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, getMomentumDayString } from '@/services/db';
import { evaluateSignalTrigger } from '@/services/signal_trigger';
import { generateSingleContextualAction } from '@/services/groq';
import { getCurrentTimeOfDay } from '@/services/recommendations';

export async function POST(request) {
  try {
    const { signalType, intensity } = await request.json();
    if (!signalType || intensity === undefined) {
      return NextResponse.json({ error: 'Missing signalType or intensity' }, { status: 400 });
    }

    const db = await readDB();
    const now = getDbCurrentTime(db);
    const todayStr = getMomentumDayString(now);
    const currentTimeOfDay = getCurrentTimeOfDay(now);

    const signal = {
      hasSignal: true,
      signalType,
      intensity: Number(intensity)
    };

    // Note: evaluateSignalTrigger mutates db.signal_state in place
    const evaluation = evaluateSignalTrigger(db, signal, now, todayStr);

    let taskGenerated = null;

    if (evaluation.shouldFire) {
      const newAction = await generateSingleContextualAction(db, signalType);
      const uniqueId = `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      const action = {
        ...newAction,
        id: uniqueId,
        status: 'todo',
        scheduled_time: currentTimeOfDay,
        locked: false
      };
      
      db.actions.push(action);
      db.profile.total_actions_generated = (db.profile.total_actions_generated || 0) + 1;
      
      if (!db.signal_state.pending_tasks) {
        db.signal_state.pending_tasks = {};
      }
      db.signal_state.pending_tasks[uniqueId] = signalType;
      
      taskGenerated = action;
    }

    await writeDB(db);

    return NextResponse.json({
      success: true,
      evaluation,
      taskGenerated,
      signalState: {
        ...db.signal_state,
        virtual_time: db.virtual_time
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
