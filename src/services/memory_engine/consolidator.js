/**
 * Memory Consolidator Coordinator
 * Orchestrates the nightly consolidation pipeline:
 * Raw Chat -> Summary -> Facts -> Threads -> Goals -> Behavioral DNA -> TTL.
 */

import { getRawChat, addSummary } from './memory_db.js';
import { generateDailySummary } from './summary_engine.js';
import { mergeStructuredFacts } from './structured_memory.js';
import { updateActiveThreads } from './thread_manager.js';
import { updateGoals } from './goal_manager.js';
import { updateBehavioralDna } from './behavioral_dna.js';
import { addTimelineEvent } from './timeline_manager.js';
import { recordInterventionOutcomes } from './outcome_memory.js';
import { enforceDynamicRetention } from './ttl_manager.js';
import { analyzeConversationTurn } from './conversation_analyzer.js';

export async function consolidateDailyMemory(db, yesterdayActions, yesterdayContext, yesterdayDateStr, queryGeminiFn) {
  console.log(`[Consolidator] Initiating consolidation for date: ${yesterdayDateStr}`);

  // Wrap queryGeminiFn to enforce thinking/reasoning mode for consolidation tasks
  const queryThinking = queryGeminiFn
    ? (prompt, isJson) => queryGeminiFn(prompt, isJson, 3, 1000, true)
    : undefined;

  // 1. Gather raw chat logs from yesterday
  const rawChats = getRawChat(db).filter(c => {
    const timestampStr = c.timestamp || c.date;
    if (!timestampStr) return false;
    const msgDate = timestampStr.split('T')[0];
    return msgDate === yesterdayDateStr;
  });

  // 2. Generate Layer 2 Summary
  const summaryObj = await generateDailySummary(db, rawChats, yesterdayDateStr, queryThinking);
  addSummary(
    db,
    summaryObj.date,
    summaryObj.summary,
    summaryObj.emotion,
    summaryObj.decisions,
    summaryObj.active_threads
  );

  // Sync to db.recent_summaries for compatibility
  db.recent_summaries = db.recent_summaries || [];
  db.recent_summaries.push({
    date: summaryObj.date,
    summary: summaryObj.summary
  });
  if (db.recent_summaries.length > 90) {
    db.recent_summaries.shift();
  }

  // 3. Extract and Merge Structured Facts, Threads, Goals from conversation analyzer
  // We can analyze the conversation transcript as a whole to extract facts
  if (rawChats.length > 0) {
    const userMessages = rawChats.filter(c => c.sender === 'User').map(c => c.text).join('\n');
    const aiResponses = rawChats.filter(c => c.sender === 'AUM').map(c => c.text).join('\n');

    // Run analyzer on consolidated logs
    const analysis = await analyzeConversationTurn(db, userMessages, aiResponses, queryThinking);
    if (analysis) {
      // Merge facts
      if (analysis.extracted_facts) {
        mergeStructuredFacts(db, analysis.extracted_facts);
        updateGoals(db, analysis.extracted_facts.goals);
      }
      // Update threads
      updateActiveThreads(db, analysis.extracted_entities, analysis.resolve_intent, yesterdayDateStr);

      // Record major timeline events (if breakthrough triggered)
      if (analysis.invisible_momentum_triggered && analysis.invisible_momentum_message) {
        addTimelineEvent(db, yesterdayDateStr, analysis.invisible_momentum_message);
      }
    }
  }

  // 4. Update Behavioral DNA
  await updateBehavioralDna(db, queryThinking);

  // 5. Weekly Identity Evolution Evaluator
  if (db.history.length % 7 === 0 && queryThinking) {
    const activeGoal = db.profile?.active_goal?.subGoal || "None";
    const currentChapter = db.profile?.current_chapter || "Stable Routine";
    const recentSummaries = db.recent_summaries || [];

    const weeklyPrompt = `
You are AUM's Identity Evolution Engine.
Analyze the user's past 30 days of behavior and historic memories.
Look for long-term growth shifts.

Active Core Goal: ${activeGoal}
Current Chapter: ${currentChapter}
Recent Chat Summaries:
${recentSummaries.slice(-7).map(s => `- ${s.date}: ${s.summary}`).join('\n')}

Generate exactly one declarative sentence describing a major shift in their identity evolution milestone (e.g. "You formerly avoided physical workouts under stress, but this month you successfully initiated morning gym routines under pressure").
Do not output markdown or headers. Write a direct declarative sentence.
`;
    try {
      const shiftMilestone = await queryThinking(weeklyPrompt);
      if (shiftMilestone) {
        addTimelineEvent(db, yesterdayDateStr, shiftMilestone.trim());
      }
    } catch (e) {
      console.error("Identity evolution engine failed:", e);
    }
  }

  // 6. Record intervention outcomes
  recordInterventionOutcomes(db, yesterdayActions, yesterdayContext, yesterdayDateStr);

  // 7. Enforce TTL retention policies
  enforceDynamicRetention(db, db.virtual_time || new Date());

  console.log(`[Consolidator] Consolidation complete for date: ${yesterdayDateStr}`);
}
