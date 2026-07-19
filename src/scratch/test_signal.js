import { evaluateSignalTrigger } from '../services/signal_trigger.js';
import { toggleActionStatus, getSignalState, readDB, writeDB } from '../services/db.js';

async function runTest() {
  console.log("Starting test...");
  const db = await readDB();
  db.signal_state.pending_tasks = {};
  db.signal_state.counters = { stress: 0 };
  
  const now1 = new Date();
  const todayStr = "2026-07-18";
  
  // Hit threshold (intensity 20)
  console.log("1. Hitting threshold");
  evaluateSignalTrigger(db, { hasSignal: true, signalType: 'stress', intensity: 20 }, now1, todayStr);
  await writeDB(db);
  
  console.log("Counter after trigger:", db.signal_state.counters.stress);
  
  // Set task pending
  db.signal_state.pending_tasks['test_task'] = 'stress';
  db.actions = [{ id: 'test_task', status: 'todo' }];
  await writeDB(db);
  
  // Hit again during cooldown (intensity 10)
  console.log("2. Hitting during cooldown");
  evaluateSignalTrigger(db, { hasSignal: true, signalType: 'stress', intensity: 10 }, now1, todayStr);
  await writeDB(db);
  
  console.log("Counter after cooldown hit:", db.signal_state.counters.stress); // Should be 30
  
  // Complete task
  console.log("3. Completing task");
  await toggleActionStatus('test_task', 'done');
  
  const updatedDb = await readDB();
  console.log("Final Counter (should be 10):", updatedDb.signal_state.counters.stress);
}

runTest().catch(console.error);
