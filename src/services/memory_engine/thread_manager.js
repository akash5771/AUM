/**
 * Thread Manager Service
 * Manages Layer 3 active threads, tracking status, priority, importance, and timestamps.
 */

import { getStructured } from './memory_db.js';

export function updateActiveThreads(db, extractedEntities, resolveIntent, yesterdayDateStr) {
  const structured = getStructured(db);
  structured.threads = structured.threads || [];

  const dateStr = yesterdayDateStr || new Date().toISOString().split('T')[0];

  // 1. Merge new threads/entities
  if (Array.isArray(extractedEntities)) {
    extractedEntities.forEach(entity => {
      const normalized = entity.trim();
      if (!normalized) return;

      const idx = structured.threads.findIndex(
        t => t.thread.toLowerCase() === normalized.toLowerCase()
      );

      if (idx !== -1) {
        structured.threads[idx].last_update = dateStr;
        structured.threads[idx].status = "Active";
      } else {
        structured.threads.push({
          thread: normalized,
          status: "Active",
          last_update: dateStr,
          importance: 5,
          priority: "Medium"
        });
      }
    });
  }

  // 2. Resolve/Close threads
  if (Array.isArray(resolveIntent)) {
    resolveIntent.forEach(entity => {
      const normalized = entity.trim().toLowerCase();
      const idx = structured.threads.findIndex(
        t => t.thread.toLowerCase() === normalized
      );
      if (idx !== -1) {
        structured.threads[idx].status = "Closed";
        structured.threads[idx].last_update = dateStr;
      }
    });
  }

  // Sync to db.profile.active_threads for compatibility (active ones only, limit to 4)
  const activeThreads = structured.threads
    .filter(t => t.status === "Active")
    .sort((a, b) => b.importance - a.importance);

  db.profile.active_threads = activeThreads.slice(0, 4).map(t => t.thread);
  db.memory.structured.threads = structured.threads;
}
