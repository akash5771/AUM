/**
 * Timeline Manager Service
 * Manages Layer 6 chronological Life Timeline of major personal achievements,
 * milestones, and life shifts.
 */

import { getTimeline } from './memory_db.js';

export function addTimelineEvent(db, date, eventText) {
  const timeline = getTimeline(db);
  const dateStr = date || new Date().toISOString().split('T')[0];

  const exists = timeline.some(
    e => e.event.toLowerCase() === eventText.toLowerCase()
  );

  if (!exists) {
    timeline.push({
      date: dateStr,
      event: eventText.trim()
    });
    // Sort chronological: oldest to newest
    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  db.memory.timeline = timeline;

  // Sync to db.profile.identity_evolution for compatibility (newest first, limit 20)
  db.profile.identity_evolution = [...timeline]
    .reverse()
    .slice(0, 20)
    .map(e => ({ date: e.date, text: e.event }));
}
