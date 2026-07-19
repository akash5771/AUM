import { getSignalState } from './db.js';
import { broadcastSignalEvent } from './signal_emitter.js';

/**
 * Pure deterministic pressure-valve gate.
 * Mutates db.signal_state in place. Caller must writeDB.
 *
 * @param {object} db       - Current DB (mutated)
 * @param {object} signal   - { hasSignal, signalType, intensity }
 * @param {Date}   now      - Current datetime
 * @param {string} todayStr - "YYYY-MM-DD"
 * @returns {{ shouldFire: boolean, signalType: string, reason: string }}
 */
export function evaluateSignalTrigger(db, signal, now, todayStr) {
  // Ensure signal state is initialized and reset at midnight if needed
  const state = getSignalState(db, todayStr);

  const signalType = signal.signalType;
  const intensity = signal.intensity || 0;

  // Dev console logging helper
  const logPrefix = `[SIGNAL] type=${signalType} intensity=${intensity}`;

  if (!signal.hasSignal || signalType === 'none' || intensity < 6) {
    console.log(`${logPrefix} fire=false reason=no_signal_or_under_intensity_gate`);
    broadcastSignalEvent({
      signalType: signalType || 'none',
      intensity,
      reason: 'no_signal_or_under_intensity_gate',
      counters: { ...state.counters },
      last_triggered_at: state.last_triggered_at,
      fired: false
    });
    return { shouldFire: false, signalType: 'none', reason: 'no_signal_or_under_intensity_gate' };
  }

  // Ensure category counter exists
  if (state.counters[signalType] === undefined) {
    state.counters[signalType] = 0;
  }

  // 2. Add intensity to signal_state.counters[signalType]
  state.counters[signalType] += intensity;
  const currentCount = state.counters[signalType];

  // 3. Check threshold (>= 20)
  if (currentCount < 20) {
    console.log(`${logPrefix} counter=${currentCount}/20 fire=false reason=threshold_not_met`);
    broadcastSignalEvent({
      signalType,
      intensity,
      reason: `threshold_not_met (${currentCount}/20)`,
      counters: { ...state.counters },
      last_triggered_at: state.last_triggered_at,
      fired: false
    });
    return { shouldFire: false, signalType, reason: `threshold_not_met (${currentCount}/20)` };
  }

  // 4. Check cooldown (30 min)
  if (state.last_triggered_at) {
    const lastTime = new Date(state.last_triggered_at);
    const diffMs = now.getTime() - lastTime.getTime();
    const diffMin = diffMs / (1000 * 60);
    
    if (diffMin >= 0 && diffMin < 30) {
      const minutesLeft = Math.ceil(30 - diffMin);
      console.log(`${logPrefix} fire=false reason=cooldown_active (${minutesLeft}min left)`);
      broadcastSignalEvent({
        signalType,
        intensity,
        reason: `cooldown_active (${minutesLeft}min left)`,
        counters: { ...state.counters },
        last_triggered_at: state.last_triggered_at,
        fired: false
      });
      return { shouldFire: false, signalType, reason: `cooldown_active (${minutesLeft}min left)` };
    }
  }

  // 5. Fire!
  // Do NOT reset the counter here; let it climb until task is actually completed.
  state.last_triggered_at = now.toISOString();

  console.log(`${logPrefix} counter=${currentCount}/20 fire=true cooldown=OK → TASK FIRED`);
  broadcastSignalEvent({
    signalType,
    intensity,
    reason: 'trigger_fired',
    counters: { ...state.counters },
    last_triggered_at: state.last_triggered_at,
    fired: true
  });
  return { shouldFire: true, signalType, reason: 'trigger_fired' };
}

