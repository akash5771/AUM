/**
 * TTL (Time-To-Live) and Dynamic Retention Manager Service
 * Implements variable retention policies for raw chats, daily summaries,
 * and structured memories to prevent storage bloat.
 */

export function enforceDynamicRetention(db, nowTime) {
  const now = nowTime ? new Date(nowTime) : new Date();

  // 1. Raw Chat Retention (90 days)
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  if (db.memory && Array.isArray(db.memory.raw_chat)) {
    db.memory.raw_chat = db.memory.raw_chat.filter(
      c => new Date(c.timestamp || c.date) >= ninetyDaysAgo
    );
    // Hard cap at 1000 messages to prevent database bloat
    if (db.memory.raw_chat.length > 1000) {
      db.memory.raw_chat = db.memory.raw_chat.slice(-1000);
    }
  }

  // Also sync with chat_history
  if (Array.isArray(db.chat_history)) {
    db.chat_history = db.chat_history.filter(
      c => new Date(c.timestamp || c.date) >= ninetyDaysAgo
    );
    if (db.chat_history.length > 1000) {
      db.chat_history = db.chat_history.slice(-1000);
    }
  }

  // 2. Closed threads clean up from active list (moved to closed status)
  // Structured threads, summaries, timeline, goals, preferences are retained indefinitely.
}
