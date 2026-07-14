import fs from 'fs/promises';
import path from 'path';

const defaultDbPath = path.join(process.cwd(), 'data', 'db_default.json');
const activeDbPath = path.join(process.cwd(), 'data', 'db_a6b54c88-4bd6-45f6-8d64-ec1c5ba6398d.json');

async function merge() {
  console.log("Reading database files...");
  const defaultDb = JSON.parse(await fs.readFile(defaultDbPath, 'utf-8'));
  const activeDb = JSON.parse(await fs.readFile(activeDbPath, 'utf-8'));

  // 1. Merge chat_history
  const activeChatTimestamps = new Set(activeDb.chat_history.map(c => c.timestamp));
  let mergedChatsCount = 0;
  defaultDb.chat_history.forEach(chat => {
    if (!activeChatTimestamps.has(chat.timestamp)) {
      activeDb.chat_history.push(chat);
      mergedChatsCount++;
    }
  });
  // Sort chat history by timestamp
  activeDb.chat_history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // 2. Merge memory.raw_chat
  activeDb.memory = activeDb.memory || {};
  activeDb.memory.raw_chat = activeDb.memory.raw_chat || [];
  const activeRawChatTimestamps = new Set(activeDb.memory.raw_chat.map(c => c.timestamp));
  defaultDb.memory = defaultDb.memory || {};
  defaultDb.memory.raw_chat = defaultDb.memory.raw_chat || [];
  let mergedRawChatsCount = 0;
  defaultDb.memory.raw_chat.forEach(chat => {
    if (!activeRawChatTimestamps.has(chat.timestamp)) {
      activeDb.memory.raw_chat.push(chat);
      mergedRawChatsCount++;
    }
  });
  activeDb.memory.raw_chat.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // 3. Merge memory.summaries
  activeDb.memory.summaries = activeDb.memory.summaries || [];
  const activeSummaryDates = new Set(activeDb.memory.summaries.map(s => s.date));
  defaultDb.memory.summaries = defaultDb.memory.summaries || [];
  let mergedSummariesCount = 0;
  defaultDb.memory.summaries.forEach(s => {
    if (!activeSummaryDates.has(s.date)) {
      activeDb.memory.summaries.push(s);
      mergedSummariesCount++;
    }
  });
  activeDb.memory.summaries.sort((a, b) => new Date(a.date) - new Date(b.date));

  // 4. Merge recent_summaries
  activeDb.recent_summaries = activeDb.recent_summaries || [];
  const activeRecentSummaryDates = new Set(activeDb.recent_summaries.map(s => s.date));
  defaultDb.recent_summaries = defaultDb.recent_summaries || [];
  defaultDb.recent_summaries.forEach(s => {
    if (!activeRecentSummaryDates.has(s.date)) {
      activeDb.recent_summaries.push(s);
    }
  });
  activeDb.recent_summaries.sort((a, b) => new Date(a.date) - new Date(b.date));

  // 5. Merge actions
  activeDb.actions = activeDb.actions || [];
  const activeActionIds = new Set(activeDb.actions.map(a => a.id));
  defaultDb.actions = defaultDb.actions || [];
  let mergedActionsCount = 0;
  defaultDb.actions.forEach(act => {
    if (!activeActionIds.has(act.id)) {
      activeDb.actions.push(act);
      mergedActionsCount++;
    }
  });

  // 6. Merge relationships from memory.structured.relationships if not present
  activeDb.memory.structured = activeDb.memory.structured || {};
  activeDb.memory.structured.relationships = activeDb.memory.structured.relationships || [];
  defaultDb.memory.structured = defaultDb.memory.structured || {};
  defaultDb.memory.structured.relationships = defaultDb.memory.structured.relationships || [];
  const activeRelNames = new Set(activeDb.memory.structured.relationships.map(r => r.name));
  defaultDb.memory.structured.relationships.forEach(rel => {
    if (!activeRelNames.has(rel.name)) {
      activeDb.memory.structured.relationships.push(rel);
    }
  });

  // Save changes to active database
  await fs.writeFile(activeDbPath, JSON.stringify(activeDb, null, 2), 'utf-8');
  console.log(`Merge completed successfully!`);
  console.log(`- Merged ${mergedChatsCount} chat messages.`);
  console.log(`- Merged ${mergedRawChatsCount} raw memory chats.`);
  console.log(`- Merged ${mergedSummariesCount} summaries.`);
  console.log(`- Merged ${mergedActionsCount} actions.`);
}

merge().catch(console.error);
