import { EventEmitter } from 'events';

// Create a globally persistent EventEmitter and events log to avoid HMR recreation during Next.js live dev
if (!global.signalEmitter) {
  global.signalEmitter = new EventEmitter();
  global.signalEventsLog = [];
}

const emitter = global.signalEmitter;

export function broadcastSignalEvent(event) {
  // event structure: { signalType: string, intensity: number, reason: string, counters: object, last_triggered_at: string, fired: boolean }
  const logEvent = {
    id: `event-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestamp: new Date().toISOString(),
    ...event
  };
  
  global.signalEventsLog.unshift(logEvent);
  
  // Cap at 10 items
  if (global.signalEventsLog.length > 10) {
    global.signalEventsLog = global.signalEventsLog.slice(0, 10);
  }
  
  emitter.emit('signal_event', logEvent);
}

export function getSignalEventsLog() {
  return global.signalEventsLog || [];
}

export { emitter as signalEmitter };
