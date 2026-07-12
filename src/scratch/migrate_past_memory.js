/**
 * Retroactive Memory Migration Script
 * Reads a user's active database file, groups past chat history by date,
 * chronologically runs the consolidation pipeline, and populates the Structured Memory layers.
 */

import fs from 'fs/promises';
import path from 'path';
import { getMemory, addSummary } from '../services/memory_engine/memory_db.js';
import { generateDailySummary } from '../services/memory_engine/summary_engine.js';
import { mergeStructuredFacts } from '../services/memory_engine/structured_memory.js';
import { updateActiveThreads } from '../services/memory_engine/thread_manager.js';
import { updateGoals } from '../services/memory_engine/goal_manager.js';
import { addTimelineEvent } from '../services/memory_engine/timeline_manager.js';
import { updateBehavioralDna } from '../services/memory_engine/behavioral_dna.js';
import { queryGemini } from '../services/groq.js';
import { analyzeConversationTurn } from '../services/memory_engine/conversation_analyzer.js';

// We want to target the user's actual database
const targetFile = path.join(process.cwd(), 'data', 'db_a6b54c88-4bd6-45f6-8d64-ec1c5ba6398d.json');

async function migrate() {
  console.log("=== INITIATING RETROACTIVE MEMORY CONSOLIDATION ===");

  if (!process.env.GROQ_API_KEY) {
    console.error("Error: GROQ_API_KEY environment variable is not configured. Cannot proceed with LLM-based consolidation.");
    process.exit(1);
  }

  try {
    const rawData = await fs.readFile(targetFile, 'utf-8');
    const db = JSON.parse(rawData);

    // Initialize next-gen memory block if missing
    if (!db.memory) {
      db.memory = {
        raw_chat: [],
        summaries: [],
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

    const chats = db.chat_history || [];
    if (chats.length === 0) {
      console.log("No chat history found to consolidate.");
      return;
    }

    console.log(`Found ${chats.length} messages in chat history. Grouping by day...`);

    // Group messages by day
    const groups = {};
    chats.forEach(c => {
      const dateStr = c.timestamp ? c.timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(c);
    });

    const sortedDates = Object.keys(groups).sort();
    console.log(`Discovered ${sortedDates.length} distinct days of chat. Running sequential consolidation...`);

    for (const dateStr of sortedDates) {
      console.log(`Processing date: ${dateStr} (${groups[dateStr].length} messages)...`);
      const dayChats = groups[dateStr];

      // 1. Generate Daily Summary
      await new Promise(resolve => setTimeout(resolve, 6000));
      const summaryObj = await generateDailySummary(db, dayChats, dateStr, queryGemini);
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
      const existsInRecent = db.recent_summaries.some(s => s.date === dateStr);
      if (!existsInRecent) {
        db.recent_summaries.push({
          date: summaryObj.date,
          summary: summaryObj.summary
        });
      }

      // 2. Extract structured facts, threads, goals
      const userMessages = dayChats.filter(c => c.sender === 'User').map(c => c.text).join('\n');
      const aiResponses = dayChats.filter(c => c.sender === 'AUM').map(c => c.text).join('\n');

      if (userMessages.trim().length > 0) {
        await new Promise(resolve => setTimeout(resolve, 6000));
        const analysis = await analyzeConversationTurn(db, userMessages, aiResponses, queryGemini);
        if (analysis) {
          if (analysis.extracted_facts) {
            mergeStructuredFacts(db, analysis.extracted_facts);
            updateGoals(db, analysis.extracted_facts.goals);
          }
          updateActiveThreads(db, analysis.extracted_entities, analysis.resolve_intent, dateStr);

          if (analysis.invisible_momentum_triggered && analysis.invisible_momentum_message) {
            addTimelineEvent(db, dateStr, analysis.invisible_momentum_message);
          }
        }
      }

      // Sync raw chats into Layer 1 raw_chat
      db.memory.raw_chat = db.memory.raw_chat || [];
      dayChats.forEach(c => {
        const alreadyInRaw = db.memory.raw_chat.some(r => r.timestamp === c.timestamp && r.text === c.text);
        if (!alreadyInRaw) {
          db.memory.raw_chat.push(c);
        }
      });
    }

    // 3. Final Behavioral DNA updates
    await updateBehavioralDna(db, queryGemini);

    // Save consolidated database back
    await fs.writeFile(targetFile, JSON.stringify(db, null, 2), 'utf-8');
    console.log("=== RETROACTIVE MEMORY CONSOLIDATION COMPLETE AND SAVED ===");

  } catch (error) {
    console.error("Migration failed:", error);
  }
}

migrate();
