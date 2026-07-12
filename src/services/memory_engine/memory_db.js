/**
 * Memory Database Helper
 * Handles reads and writes to AUM memory layers inside the unified database.
 */

import fs from 'fs/promises';
import path from 'path';
import { getUserId } from '../db.js';

export function getMemory(db) {
  if (!db.memory) {
    db.memory = {
      raw_chat: [],
      summaries: [],
      epoch_summaries: [],
      archived_keywords: {},
      structured: {
        identity: {},
        goals: [],
        projects: [],
        preferences: [],
        relationships: []
      },
      growth_signals: [],
      behavioral_dna: {},
      timeline: [],
      outcome_memory: []
    };
  }
  if (!db.memory.epoch_summaries) {
    db.memory.epoch_summaries = [];
  }
  if (!db.memory.archived_keywords) {
    db.memory.archived_keywords = {};
  }
  return db.memory;
}

export function getRawChat(db) {
  const mem = getMemory(db);
  // Fallback to chat_history if raw_chat is empty to support backwards compatibility
  if ((!mem.raw_chat || mem.raw_chat.length === 0) && db.chat_history && db.chat_history.length > 0) {
    mem.raw_chat = [...db.chat_history];
  }
  return mem.raw_chat || [];
}

export function getSummaries(db) {
  const mem = getMemory(db);
  // Sync with recent_summaries if summaries is empty
  if ((!mem.summaries || mem.summaries.length === 0) && db.recent_summaries && db.recent_summaries.length > 0) {
    mem.summaries = [...db.recent_summaries];
  }
  return mem.summaries || [];
}

export function getStructured(db) {
  return getMemory(db).structured || { identity: {}, goals: [], projects: [], preferences: [], relationships: [] };
}

export function getGrowthSignals(db) {
  return getMemory(db).growth_signals || [];
}

export function getBehavioralDna(db) {
  const mem = getMemory(db);
  if (!mem.behavioral_dna || Object.keys(mem.behavioral_dna).length === 0) {
    // Migrate from profile.behavioral_dna if available
    mem.behavioral_dna = db.profile?.behavioral_dna || {};
  }
  return mem.behavioral_dna;
}

export function getExperiences(db) {
  const mem = getMemory(db);
  mem.life_experiences = mem.life_experiences || [];
  
  // Backward compatibility migration from old timeline if life_experiences is empty
  if (mem.life_experiences.length === 0) {
    const oldTimeline = mem.timeline || [];
    if (oldTimeline.length === 0 && db.profile?.identity_evolution) {
      oldTimeline.push(...db.profile.identity_evolution.map(e => ({ date: e.date, event: e.text })));
    }
    oldTimeline.forEach((e, idx) => {
      mem.life_experiences.push({
        id: `exp_migrated_${idx}`,
        type: "Milestone",
        activity: e.event,
        location: "",
        people: [],
        emotion_after: "happy",
        importance: 5,
        timestamp: new Date(e.date || Date.now()).toISOString(),
        source: "migration",
        summary: e.event
      });
    });
  }
  return mem.life_experiences;
}

export function addExperience(db, exp) {
  const mem = getMemory(db);
  mem.life_experiences = mem.life_experiences || [];
  mem.life_experiences.push(exp);
}

export function getTimeline(db) {
  const exps = getExperiences(db);
  return exps.map(e => ({
    date: e.timestamp.split('T')[0],
    event: e.summary || e.activity
  }));
}

export function getOutcomeMemory(db) {
  const mem = getMemory(db);
  if ((!mem.outcome_memory || mem.outcome_memory.length === 0) && db.profile?.intervention_memory && db.profile.intervention_memory.length > 0) {
    mem.outcome_memory = db.profile.intervention_memory.map(m => ({
      task: m.actionId || "Checklist Task",
      completed: m.completed,
      stress_before: 5, // fallback defaults
      stress_after: 5 - (m.stress_delta || 0),
      energy_before: 5,
      energy_after: 5,
      enjoyment: 5,
      date: m.date
    }));
  }
  return mem.outcome_memory || [];
}

export function addRawChat(db, sender, text, timestamp, type = "text", extra = {}) {
  const mem = getMemory(db);
  mem.raw_chat = mem.raw_chat || [];
  mem.raw_chat.push({
    sender,
    text,
    timestamp: timestamp || new Date().toISOString(),
    type,
    ...extra
  });
}

export function addSummary(db, date, summary, emotion = "", decisions = [], active_threads = []) {
  const mem = getMemory(db);
  mem.summaries = mem.summaries || [];
  const existingIdx = mem.summaries.findIndex(s => s.date === date);
  const newSummary = {
    date,
    summary,
    emotion,
    decisions,
    active_threads
  };
  if (existingIdx >= 0) {
    mem.summaries[existingIdx] = newSummary;
  } else {
    mem.summaries.push(newSummary);
  }
}

export function getEpochSummaries(db) {
  return getMemory(db).epoch_summaries || [];
}

export function addEpochSummary(db, epochSummary) {
  const mem = getMemory(db);
  mem.epoch_summaries = mem.epoch_summaries || [];
  mem.epoch_summaries.push(epochSummary);
}

export async function getArchiveDbPath() {
  const userId = await getUserId();
  return path.join(process.cwd(), 'data', `db_${userId}_archive.json`);
}

export async function readArchiveDB() {
  const archivePath = await getArchiveDbPath();
  try {
    const data = await fs.readFile(archivePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return { summaries: [], epoch_summaries: [] };
  }
}

export async function writeArchiveDB(archive) {
  const archivePath = await getArchiveDbPath();
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, JSON.stringify(archive, null, 2));
}

export async function archiveOldSummaries(db, currentDateOverride = null) {
  const mem = getMemory(db);
  const now = currentDateOverride ? new Date(currentDateOverride) : (db.virtual_time ? new Date(db.virtual_time) : new Date());
  
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const archive = await readArchiveDB();
  archive.summaries = archive.summaries || [];
  archive.epoch_summaries = archive.epoch_summaries || [];

  // Helper to extract indexable tokens
  const extractTokens = (s) => {
    const text = [
      s.summary || "",
      (s.decisions || []).join(" "),
      (s.active_threads || []).join(" "),
      (s.people || []).join(" ")
    ].join(" ").toLowerCase();
    return text
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 3);
  };

  // Archive daily summaries
  const dailyToKeep = [];
  for (const s of (mem.summaries || [])) {
    const sDate = new Date(s.date);
    if (sDate < thirtyDaysAgo) {
      archive.summaries.push(s);
      // Index keywords
      const tokens = extractTokens(s);
      tokens.forEach(tok => {
        mem.archived_keywords[tok] = mem.archived_keywords[tok] || [];
        if (!mem.archived_keywords[tok].includes(s.date)) {
          mem.archived_keywords[tok].push(s.date);
        }
      });
    } else {
      dailyToKeep.push(s);
    }
  }
  mem.summaries = dailyToKeep;

  // Archive epoch summaries
  const epochToKeep = [];
  for (const s of (mem.epoch_summaries || [])) {
    const sDate = new Date(s.timestamp || s.date);
    if (sDate < thirtyDaysAgo) {
      archive.epoch_summaries.push(s);
      // Index keywords
      const tokens = extractTokens(s);
      const sId = s.id || s.timestamp || s.date;
      tokens.forEach(tok => {
        mem.archived_keywords[tok] = mem.archived_keywords[tok] || [];
        if (!mem.archived_keywords[tok].includes(sId)) {
          mem.archived_keywords[tok].push(sId);
        }
      });
    } else {
      epochToKeep.push(s);
    }
  }
  mem.epoch_summaries = epochToKeep;

  await writeArchiveDB(archive);
}
