import { readDB, getDbCurrentTime, getMomentumDayString } from '@/services/db';
import { signalEmitter, getSignalEventsLog } from '@/services/signal_emitter';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send initial state immediately
      try {
        const db = await readDB();
        const now = getDbCurrentTime(db);
        const todayStr = getMomentumDayString(now);
        const signalState = db.signal_state || {
          date: todayStr,
          last_triggered_at: null,
          counters: { stress: 0, anxiety: 0, joy: 0, happiness: 0, pride: 0, focus: 0 }
        };
        
        const initialPayload = {
          type: 'initial',
          signalState: {
            ...signalState,
            virtual_time: db.virtual_time
          },
          history: getSignalEventsLog()
        };
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialPayload)}\n\n`));
      } catch (err) {
        console.error('SSE initial load error:', err);
      }

      // 2. Setup event listener for live updates
      const listener = async (event) => {
        try {
          const db = await readDB();
          const payload = {
            type: 'update',
            event,
            signalState: {
              date: event.timestamp.split('T')[0],
              last_triggered_at: event.last_triggered_at,
              counters: event.counters,
              virtual_time: db.virtual_time
            }
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (err) {
          console.error('SSE send error:', err);
        }
      };

      signalEmitter.on('signal_event', listener);

      // Keep connection alive with simple pings every 15s
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (err) {
          // ignore
        }
      }, 15000);

      // 3. Handle client close/abort
      request.signal.addEventListener('abort', () => {
        signalEmitter.off('signal_event', listener);
        clearInterval(pingInterval);
        try {
          controller.close();
        } catch (e) {}
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Content-Encoding': 'none'
    }
  });
}
