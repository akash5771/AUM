import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, getMomentumDayString } from '@/services/db';
import { broadcastSignalEvent } from '@/services/signal_emitter';

export async function POST() {
  try {
    const db = await readDB();
    const now = getDbCurrentTime(db);
    const todayStr = getMomentumDayString(now);

    db.signal_state = {
      date: todayStr,
      last_triggered_at: null, // clear cooldown so dev can trigger immediately
      pending_tasks: {},
      counters: {
        stress: 0,
        anxiety: 0,
        joy: 0,
        happiness: 0,
        pride: 0,
        focus: 0
      }
    };

    await writeDB(db);

    broadcastSignalEvent({
      signalType: 'reset',
      intensity: 0,
      reason: 'Manual counters reset via dev panel',
      counters: { ...db.signal_state.counters },
      last_triggered_at: db.signal_state.last_triggered_at,
      fired: false
    });

    return NextResponse.json({
      success: true,
      signalState: {
        ...db.signal_state,
        virtual_time: db.virtual_time
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
