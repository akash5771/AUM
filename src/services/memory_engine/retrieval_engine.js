/**
 * Context Retrieval Engine Service
 * Implements a two-stage retrieval pipeline:
 * 1. Stage 1 (Deterministic): Scans user query for matches with structured items (relationships, goals, threads).
 * 2. Stage 2 (LLM Contextual Filter): Screens daily summaries for contextual relevance.
 * Combines retrieved memories into the Current State Object.
 */

import { getStructured, getSummaries, getBehavioralDna, getExperiences, getEpochSummaries, readArchiveDB } from './memory_db.js';
import { queryGemini } from '../groq.js';

const SYNONYMS = {
  // Work & Career
  "manager": ["manager", "boss", "lead", "supervisor", "director", "employer", "management", "work"],
  "boss": ["manager", "boss", "lead", "supervisor", "director", "employer", "management", "work"],
  "lead": ["manager", "boss", "lead", "supervisor", "director", "employer", "management", "work"],
  "supervisor": ["manager", "boss", "lead", "supervisor", "director", "employer", "management", "work"],
  
  // Conflict & Dispute
  "dispute": ["dispute", "fight", "conflict", "argument", "friction", "issue", "misunderstanding", "clash", "disagree", "disagreement"],
  "fight": ["dispute", "fight", "conflict", "argument", "friction", "issue", "misunderstanding", "clash", "disagree", "disagreement"],
  "conflict": ["dispute", "fight", "conflict", "argument", "friction", "issue", "misunderstanding", "clash", "disagree", "disagreement"],
  "argument": ["dispute", "fight", "conflict", "argument", "friction", "issue", "misunderstanding", "clash", "disagree", "disagreement"],
  "friction": ["dispute", "fight", "conflict", "argument", "friction", "issue", "misunderstanding", "clash", "disagree", "disagreement"],
  "issue": ["dispute", "fight", "conflict", "argument", "friction", "issue", "misunderstanding", "clash", "disagree", "disagreement"],

  // Workouts & Activity
  "run": ["run", "running", "jog", "jogging", "5k", "10k", "marathon", "cardio", "workout", "gym"],
  "running": ["run", "running", "jog", "jogging", "5k", "10k", "marathon", "cardio", "workout", "gym"],
  "jog": ["run", "running", "jog", "jogging", "5k", "10k", "marathon", "cardio"],
  "jogging": ["run", "running", "jog", "jogging", "5k", "10k", "marathon", "cardio"],
  "park": ["park", "garden", "nature", "biodiversity", "forest", "greenery"],

  // Leisure & Media
  "movie": ["movie", "film", "cinema", "show", "watch", "interstellar", "netflix", "theater"],
  "film": ["movie", "film", "cinema", "show", "watch", "interstellar", "netflix", "theater"],
  "coffee": ["coffee", "cafe", "starbucks", "tea", "drink"],
  "tea": ["coffee", "cafe", "starbucks", "tea", "drink"]
};

// Interface-based search engine cleanly swappable with Semantic / Vector Search in the future
export function searchMemory(db, query, type) {
  const lowerQuery = query.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  const queryTokens = lowerQuery.split(/\s+/).filter(w => w.length > 2);

  // Synonym expansion
  const searchTokens = new Set(queryTokens);
  queryTokens.forEach(t => {
    if (SYNONYMS[t]) {
      SYNONYMS[t].forEach(syn => searchTokens.add(syn));
    }
  });

  const structured = getStructured(db);

  if (type === "relationships") {
    const matched = [];
    if (Array.isArray(structured.relationships)) {
      structured.relationships.forEach(rel => {
        const nameLower = rel.name.toLowerCase();
        const matchesName = searchTokens.has(nameLower) || lowerQuery.includes(nameLower);
        
        const matchedHistory = (rel.relationship_history || []).filter(h => {
          const sumLower = h.summary.toLowerCase();
          return Array.from(searchTokens).some(tok => sumLower.includes(tok));
        });

        if (matchesName || matchedHistory.length > 0) {
          matched.push({
            ...rel,
            matched_moments: matchedHistory
          });
        }
      });
    }
    return matched;
  }

  if (type === "experiences") {
    const exps = getExperiences(db);
    const matched = [];

    exps.forEach(exp => {
      const activityLower = (exp.activity || "").toLowerCase();
      const summaryLower = (exp.summary || "").toLowerCase();
      const locationLower = (exp.location || "").toLowerCase();
      const typeLower = (exp.type || "").toLowerCase();

      const matches = Array.from(searchTokens).some(tok => 
        activityLower.includes(tok) || 
        summaryLower.includes(tok) || 
        locationLower.includes(tok) || 
        typeLower.includes(tok)
      );

      if (matches) {
        matched.push(exp);
      }
    });

    // Sort by importance descending, then timestamp descending
    matched.sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    return matched.slice(0, 5); // Top 5 matches
  }

  return [];
}

export async function retrieveRelevantContext(db, userMessage, queryGeminiFn = queryGemini) {
  const structured = getStructured(db);
  const activeDailySummaries = getSummaries(db);
  const activeEpochSummaries = getEpochSummaries(db);
  const dna = getBehavioralDna(db);

  const lowerQuery = userMessage.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  const queryTokens = lowerQuery.split(/\s+/).filter(w => w.length > 2);

  // Synonym expansion
  const searchTokens = new Set(queryTokens);
  queryTokens.forEach(t => {
    if (SYNONYMS[t]) {
      SYNONYMS[t].forEach(syn => searchTokens.add(syn));
    }
  });

  // 1. Stage 1: Deterministic search (relationships, experiences, goals, threads)
  const matchedRelationships = searchMemory(db, userMessage, "relationships");
  const matchedExperiences = searchMemory(db, userMessage, "experiences");

  const matchedThreads = [];
  const matchedGoals = [];

  // Match active threads
  if (Array.isArray(structured.threads)) {
    structured.threads.forEach(t => {
      if (lowerQuery.includes(t.thread.toLowerCase())) {
        matchedThreads.push(t);
      }
    });
  }

  // Match goals
  if (Array.isArray(structured.goals)) {
    structured.goals.forEach(g => {
      if (lowerQuery.includes(g.goal.toLowerCase())) {
        matchedGoals.push(g);
      }
    });
  }

  // 2. Load archived summaries if pre-indexed keyword matches
  let archivedSummaries = { summaries: [], epoch_summaries: [] };
  const archivedKeywords = db.memory?.archived_keywords || {};
  let shouldLoadArchive = false;
  
  for (const token of searchTokens) {
    if (archivedKeywords[token]) {
      shouldLoadArchive = true;
      break;
    }
  }

  if (shouldLoadArchive) {
    try {
      archivedSummaries = await readArchiveDB();
    } catch (e) {
      console.error("Failed to load archive database:", e);
    }
  }

  // Combine all candidate summaries
  const allDailySummaries = [...activeDailySummaries, ...(archivedSummaries.summaries || [])];
  const allEpochSummaries = [...activeEpochSummaries, ...(archivedSummaries.epoch_summaries || [])];

  // Helper to score a summary based on token matching
  const scoreSummary = (s, isEpoch = false) => {
    const text = [
      s.summary || "",
      (s.decisions || []).join(" "),
      (s.active_threads || []).join(" "),
      (s.people || []).join(" ")
    ].join(" ").toLowerCase();

    let score = 0;
    let matchesEntity = false;

    // Check if the query mentions a person/entity in structured relationships
    const relationNames = (structured.relationships || []).map(r => r.name.toLowerCase());
    
    // Also include common synonyms for role entities
    const entityTokens = new Set(relationNames);
    if (searchTokens.has("boss") || searchTokens.has("manager") || searchTokens.has("supervisor") || searchTokens.has("lead")) {
      entityTokens.add("boss");
      entityTokens.add("manager");
      entityTokens.add("supervisor");
      entityTokens.add("lead");
    }

    // Check entity match
    for (const entity of entityTokens) {
      if (lowerQuery.includes(entity) && text.includes(entity)) {
        matchesEntity = true;
        score += 10; // Major boost for matches containing both entity and situation
      }
    }

    // Count word match hits
    searchTokens.forEach(token => {
      if (text.includes(token)) {
        score += 1;
      }
    });

    return {
      summaryObj: s,
      isEpoch,
      score,
      date: s.date || s.timestamp,
      importance: s.importance || 5
    };
  };

  // Score all summaries
  const scoredDaily = allDailySummaries.map(s => scoreSummary(s, false));
  const scoredEpoch = allEpochSummaries.map(s => scoreSummary(s, true));
  const allScored = [...scoredDaily, ...scoredEpoch].filter(item => item.score > 0);

  // Sort: highest score first, then recency (newer date)
  allScored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.date) - new Date(a.date);
  });

  // Cap to top 3-5 summaries
  const topSummaries = allScored.slice(0, 5).map(item => {
    const s = item.summaryObj;
    const typeLabel = item.isEpoch ? "Epoch" : "Daily";
    return `${s.date || s.timestamp} [${typeLabel}]: ${s.summary} (Decisions: ${s.decisions?.join(', ') || 'None'})`;
  });

  // 3. Build Current State Object
  const currentGoal = db.profile?.active_goal?.subGoal || "None";
  const momentum = db.profile?.momentum_score || 50;
  const emotion = db.context?.mood?.state || "Clear";
  const trajectory = momentum > 60 ? "Improving" : momentum < 40 ? "Declining" : "Stable";

  return {
    active_goals: structured.goals?.filter(g => g.status === "Active").map(g => g.goal) || [currentGoal],
    active_threads: structured.threads?.filter(t => t.status === "Active").map(t => t.thread) || db.profile?.active_threads || [],
    momentum,
    emotion,
    trajectory,
    behavioral_dna: dna,
    location: db.profile?.location_profile || {},
    relevant_relationships: matchedRelationships,
    relevant_experiences: matchedExperiences,
    relevant_threads: matchedThreads,
    relevant_goals: matchedGoals,
    relevant_past_summaries: topSummaries,
    today_summary: db.context?.current_state_summary || ""
  };
}
