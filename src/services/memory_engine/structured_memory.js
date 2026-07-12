/**
 * Structured Memory Service
 * Manages Layer 3 — Structured Memory (Identity, Preferences, Relationships).
 * Handles clean merging of extracted facts from daily logs.
 */

import { getStructured } from './memory_db.js';

export function mergeStructuredFacts(db, extractedFacts) {
  if (!extractedFacts) return;
  const structured = getStructured(db);

  // 1. Identity Merger
  if (extractedFacts.identity && typeof extractedFacts.identity === 'object') {
    structured.identity = {
      ...structured.identity,
      ...extractedFacts.identity
    };
    // Sync back to db.profile for compatibility
    if (extractedFacts.identity.name) db.profile.name = extractedFacts.identity.name;
    if (extractedFacts.identity.maritalStatus) db.profile.maritalStatus = extractedFacts.identity.maritalStatus;
    if (extractedFacts.identity.kids !== undefined) db.profile.kids = Number(extractedFacts.identity.kids);
  }

  // 2. Preferences Merger
  if (Array.isArray(extractedFacts.preferences)) {
    structured.preferences = structured.preferences || [];
    extractedFacts.preferences.forEach(pref => {
      const normalized = pref.trim();
      const exists = structured.preferences.some(p => p.toLowerCase() === normalized.toLowerCase());
      if (normalized && !exists) {
        structured.preferences.push(normalized);
      }
    });
  }

  // 3. Relationships & Relationship History Merger
  if (Array.isArray(extractedFacts.relationships)) {
    structured.relationships = structured.relationships || [];
    extractedFacts.relationships.forEach(rel => {
      if (!rel || !rel.name) return;
      const normalizedName = rel.name.trim();
      const existingIdx = structured.relationships.findIndex(
        r => r.name.toLowerCase() === normalizedName.toLowerCase()
      );

      if (existingIdx !== -1) {
        structured.relationships[existingIdx] = {
          ...structured.relationships[existingIdx],
          ...rel,
          name: normalizedName // Preserve casing
        };
      } else {
        structured.relationships.push({
          name: normalizedName,
          role: rel.role || "Contact",
          status: rel.status || "Active",
          relationship_health: "Stable",
          relationship_history: [],
          history_archive: [],
          context: rel.context || ""
        });
      }
    });

    // Sync to profile relationships array for compatibility
    db.profile.relationships = structured.relationships.map(r => r.name);
  }

  // Merge structured Relationship History
  if (Array.isArray(extractedFacts.relationship_history)) {
    structured.relationships = structured.relationships || [];
    const todayStr = new Date().toISOString();
    
    extractedFacts.relationship_history.forEach(m => {
      if (!m.name || !m.summary) return;
      const normalizedName = m.name.trim();
      let relIdx = structured.relationships.findIndex(
        r => r.name.toLowerCase() === normalizedName.toLowerCase()
      );

      if (relIdx === -1) {
        structured.relationships.push({
          name: normalizedName,
          role: "Contact",
          status: "Active",
          relationship_health: "Stable",
          relationship_history: [],
          history_archive: [],
          context: ""
        });
        relIdx = structured.relationships.length - 1;
      }

      const rel = structured.relationships[relIdx];
      rel.relationship_history = rel.relationship_history || [];
      
      // Prevent duplicate moments
      const isDuplicate = rel.relationship_history.some(h => h.summary === m.summary);
      if (!isDuplicate) {
        rel.relationship_history.push({
          id: `rel_hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          type: m.type || "personal",
          emotion: m.emotion || "neutral",
          importance: Number(m.importance) || 5,
          timestamp: todayStr,
          summary: m.summary,
          thread: m.thread || "General"
        });
      }

      // Dynamic Relationship Health Evaluator:
      const recent = rel.relationship_history.slice(-3);
      if (recent.length >= 2) {
        const negativeCount = recent.filter(h => ["conflict", "strained", "sad", "angry", "fight", "annoyed"].includes(h.emotion.toLowerCase())).length;
        const positiveCount = recent.filter(h => ["happy", "loving", "supportive", "close", "excited", "good", "satisfied"].includes(h.emotion.toLowerCase())).length;
        if (negativeCount >= 2) {
          rel.relationship_health = "Strained";
        } else if (positiveCount >= 2) {
          rel.relationship_health = "Improving";
        } else {
          rel.relationship_health = "Stable";
        }
      }
    });
  }

  // 4. Life Experiences Merger
  if (Array.isArray(extractedFacts.life_experiences)) {
    db.memory.life_experiences = db.memory.life_experiences || [];
    const todayStr = new Date().toISOString();

    extractedFacts.life_experiences.forEach(exp => {
      if (!exp.activity) return;
      
      let stressDelta = 0;
      if (exp.emotion_after === "happy" || exp.emotion_after === "content" || exp.emotion_after === "relaxed") {
        stressDelta = -2;
      } else if (exp.emotion_after === "stressed" || exp.emotion_after === "tired") {
        stressDelta = 1;
      }

      db.memory.life_experiences.push({
        id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: exp.type || "Other",
        activity: exp.activity,
        location: exp.location || "",
        people: exp.people || [],
        emotion_after: exp.emotion_after || "neutral",
        importance: Number(exp.importance) || 5,
        timestamp: todayStr,
        source: "chat",
        stress_delta: stressDelta,
        summary: exp.summary || exp.activity
      });
    });
  }

  // 5. 90-day archive compression and pruning
  // Relationship History Pruning
  if (Array.isArray(structured.relationships)) {
    structured.relationships.forEach(rel => {
      rel.relationship_history = rel.relationship_history || [];
      rel.history_archive = rel.history_archive || [];
      
      const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
      const toPrune = rel.relationship_history.filter(h => new Date(h.timestamp).getTime() < ninetyDaysAgo);
      
      if (toPrune.length > 0) {
        const grouped = {};
        toPrune.forEach(h => {
          const monthKey = h.timestamp.substr(0, 7); // YYYY-MM
          grouped[monthKey] = grouped[monthKey] || [];
          grouped[monthKey].push(h.summary);
        });

        Object.keys(grouped).forEach(month => {
          const monthSummary = `Summary for ${month}: ${grouped[month].join("; ")}`;
          const archiveIdx = rel.history_archive.findIndex(a => a.startsWith(`Summary for ${month}:`));
          if (archiveIdx !== -1) {
            rel.history_archive[archiveIdx] = monthSummary;
          } else {
            rel.history_archive.push(monthSummary);
          }
        });

        rel.relationship_history = rel.relationship_history.filter(h => new Date(h.timestamp).getTime() >= ninetyDaysAgo);
      }
    });
  }

  // Life Experiences Pruning
  if (Array.isArray(db.memory.life_experiences)) {
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const toPrune = db.memory.life_experiences.filter(exp => new Date(exp.timestamp).getTime() < ninetyDaysAgo);
    
    if (toPrune.length > 0) {
      db.memory.life_experiences_archive = db.memory.life_experiences_archive || [];
      const grouped = {};
      toPrune.forEach(exp => {
        const monthKey = exp.timestamp.substr(0, 7); // YYYY-MM
        grouped[monthKey] = grouped[monthKey] || [];
        grouped[monthKey].push(`${exp.type}: ${exp.activity} (${exp.emotion_after})`);
      });

      Object.keys(grouped).forEach(month => {
        const monthSummary = `Experiences for ${month}: ${grouped[month].join("; ")}`;
        const archiveIdx = db.memory.life_experiences_archive.findIndex(a => a.startsWith(`Experiences for ${month}:`));
        if (archiveIdx !== -1) {
          db.memory.life_experiences_archive[archiveIdx] = monthSummary;
        } else {
          db.memory.life_experiences_archive.push(monthSummary);
        }
      });

      db.memory.life_experiences = db.memory.life_experiences.filter(exp => new Date(exp.timestamp).getTime() >= ninetyDaysAgo);
    }
  }

  // Save changes
  db.memory.structured = structured;
}
