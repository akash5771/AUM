/**
 * Goal Manager Service
 * Manages Layer 3 goals, tracking priority, status, and deadlines.
 */

import { getStructured } from './memory_db.js';

export function updateGoals(db, extractedGoals) {
  if (!extractedGoals || !Array.isArray(extractedGoals)) return;
  const structured = getStructured(db);
  structured.goals = structured.goals || [];

  extractedGoals.forEach(g => {
    if (!g || !g.goal) return;
    const normalizedGoal = g.goal.trim();

    const idx = structured.goals.findIndex(
      item => item.goal.toLowerCase() === normalizedGoal.toLowerCase()
    );

    if (idx !== -1) {
      structured.goals[idx] = {
        ...structured.goals[idx],
        ...g,
        goal: normalizedGoal
      };
    } else {
      structured.goals.push({
        goal: normalizedGoal,
        deadline: g.deadline || "TBD",
        status: g.status || "Active",
        priority: g.priority || "Medium"
      });
    }
  });

  // Sync back to db.profile active_goal and pinned_mission for compatibility
  const activeGoal = structured.goals.find(g => g.status === "Active");
  if (activeGoal) {
    db.profile.active_goal = {
      category: "Personal",
      subGoal: activeGoal.goal
    };
    db.profile.pinned_mission = {
      title: activeGoal.goal,
      start_date: db.profile.pinned_mission?.start_date || new Date().toISOString().split('T')[0]
    };
  }

  db.memory.structured.goals = structured.goals;
}
