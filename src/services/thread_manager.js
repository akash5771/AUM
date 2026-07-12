/**
 * Thread Manager service for AUM
 * Deterministically merges, resolves, and prioritizes ongoing conversation stories
 */

export function updateThreads(db, extractedEntities, resolveIntent) {
  db.profile.active_threads = db.profile.active_threads || [];

  // 1. Merge new entities/topics
  if (Array.isArray(extractedEntities)) {
    extractedEntities.forEach(entity => {
      const normalized = entity.trim();
      // Avoid duplicates case-insensitively but preserve original casing
      const exists = db.profile.active_threads.some(t => t.toLowerCase() === normalized.toLowerCase());
      if (normalized && !exists) {
        db.profile.active_threads.push(normalized);
      }
    });
  }

  // 2. Resolve/Close threads
  if (Array.isArray(resolveIntent)) {
    resolveIntent.forEach(entity => {
      const normalized = entity.trim().toLowerCase();
      db.profile.active_threads = db.profile.active_threads.filter(t => t.toLowerCase() !== normalized);
    });
  }

  // 3. Keep threads list focused (max 4 active threads)
  if (db.profile.active_threads.length > 4) {
    db.profile.active_threads = db.profile.active_threads.slice(-4);
  }
}
