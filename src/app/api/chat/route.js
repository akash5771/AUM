import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, getMomentumDayString } from '@/services/db';
import { 
  generateChatResponseStream,
  extractSleepFromMessage,
  extractStressFromMessage,
  extractEnergyFromMessage,
  resolveLocationUpdate,
  generateSingleContextualAction,
  generateCheckinStream,
  detectChatSignals
} from '@/services/groq';
import { PERIODS, getCurrentTimeOfDay, isPeriodUnlocked } from '@/services/recommendations';

const QUICK_INTERCEPTS = {
  "good night": "Good night, Akash. Rest well.",
  "goodnight": "Good night. Sleep well.",
  "gn": "Good night. Rest well.",
  "good morning": "Good morning. Hope you have a good day ahead.",
  "gm": "Good morning. Hope you have a good day.",
  "hello": "Hey. What's up?",
  "hi": "Hey. What's on your mind?",
  "hey": "Hey. What's up?",
  "bye": "Talk soon. Take care."
};

function updateChatHistoryWithAnnouncement(latestDb, combinedText) {
  if (latestDb.chat_history.length > 0) {
    const lastEntry = latestDb.chat_history[latestDb.chat_history.length - 1];
    if (lastEntry.sender === 'AUM') {
      lastEntry.text = combinedText;
    } else {
      latestDb.chat_history.push({ sender: 'AUM', text: combinedText, timestamp: getDbCurrentTime(latestDb).toISOString() });
    }
  } else {
    latestDb.chat_history.push({ sender: 'AUM', text: combinedText, timestamp: getDbCurrentTime(latestDb).toISOString() });
  }
}

function getCurrentAssumedLocation(db) {
  const now = getDbCurrentTime(db);
  const day = now.getDay(); // 0 is Sunday, 6 is Saturday
  const hour = now.getHours();
  
  if (day === 0) {
    return "Home";
  } else {
    if (hour >= 10 && hour < 20) { // 10:00 AM to 8:00 PM
      return "Office";
    } else {
      return "Home";
    }
  }
}

// Helper to check and inject morning greetings and contextual nudges
async function injectContextualMessages(db) {
  const profile = db.profile || {};
  const context = db.context || {};
  const now = getDbCurrentTime(db);
  const todayStr = getMomentumDayString(now);
  
  let dbChanged = false;
  profile.sent_nudges = profile.sent_nudges || [];

  // 1. Morning Greeting Check (Adaptive Window: 4:00 AM to 11:59 AM, fallback to day check)
  const currentHours = now.getHours();
  if (profile.last_greeting_date !== todayStr) {
    let greetingText = `Good morning! How did you sleep last night? How many hours did you get?`;
    if (currentHours < 4 || currentHours >= 12) {
      greetingText = `Good day! Since it's your first time opening AUM today, let's log your daily context. How did you sleep last night? How many hours did you get?`;
    }
    
    context.checkin_stage = 'waiting_for_sleep';
    context.is_frozen = false;
    
    db.chat_history.push({
      sender: "AUM",
      text: greetingText,
      timestamp: now.toISOString(),
      type: "text"
    });
    
    profile.last_greeting_date = todayStr;
    dbChanged = true;
  }

  // 2. Contextual Nudges Check
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[now.getDay()];
  
  // Birthday Nudge (matches "MM-DD")
  const birthStr = profile.birthday || "07-12";
  const currentMonthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const birthdayNudgeId = `birthday_${todayStr}`;
  if (currentMonthDay === birthStr && !profile.sent_nudges.includes(birthdayNudgeId)) {
    const name = profile.name || "Akash";
    db.chat_history.push({
      sender: "AUM",
      text: `Happy Birthday, ${name}. What's one thing you're proud of from the last year?`,
      timestamp: now.toISOString(),
      type: "text"
    });
    profile.sent_nudges.push(birthdayNudgeId);
    dbChanged = true;
  }

  // Monday Morning Nudge (Monday 7 AM to 10 AM)
  const mondayNudgeId = `monday_morning_${todayStr}`;
  if (dayName === "Monday" && currentHours >= 7 && currentHours < 10 && !profile.sent_nudges.includes(mondayNudgeId)) {
    db.chat_history.push({
      sender: "AUM",
      text: "New week. What's one thing you're not letting go of this week?",
      timestamp: now.toISOString(),
      type: "text"
    });
    profile.sent_nudges.push(mondayNudgeId);
    dbChanged = true;
  }

  // Friday 7 PM Nudge (Friday 7 PM to 10 PM)
  const fridayNudgeId = `friday_7pm_${todayStr}`;
  if (dayName === "Friday" && currentHours >= 19 && currentHours < 22 && !profile.sent_nudges.includes(fridayNudgeId)) {
    db.chat_history.push({
      sender: "AUM",
      text: "Still at it?",
      timestamp: now.toISOString(),
      type: "text"
    });
    profile.sent_nudges.push(fridayNudgeId);
    dbChanged = true;
  }

  // Sunday Evening Nudge (Sunday 5 PM to 9 PM)
  const sundayNudgeId = `sunday_evening_${todayStr}`;
  if (dayName === "Sunday" && currentHours >= 17 && currentHours < 21 && !profile.sent_nudges.includes(sundayNudgeId)) {
    db.chat_history.push({
      sender: "AUM",
      text: "How are you feeling about tomorrow?",
      timestamp: now.toISOString(),
      type: "text"
    });
    profile.sent_nudges.push(sundayNudgeId);
    dbChanged = true;
  }

  // Rainy Evening Nudge (Any day 5 PM to 9 PM, weather is Rainy)
  const rainyNudgeId = `rainy_evening_${todayStr}`;
  if (context.environmental?.weather === "Rainy" && currentHours >= 17 && currentHours < 21 && !profile.sent_nudges.includes(rainyNudgeId)) {
    db.chat_history.push({
      sender: "AUM",
      text: "Perfect weather for a slow walk or a good book.",
      timestamp: now.toISOString(),
      type: "text"
    });
    profile.sent_nudges.push(rainyNudgeId);
    dbChanged = true;
  }

  if (dbChanged) {
    await writeDB(db);
  }
}

export async function GET() {
  try {
    const db = await readDB();
    await injectContextualMessages(db);
    const freshDb = await readDB();
    return NextResponse.json(freshDb.chat_history || []);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { message, type, mediaUrl } = await request.json();
    if (!message && !mediaUrl) {
      return NextResponse.json({ error: "Missing message or mediaUrl" }, { status: 400 });
    }
    
    const db = await readDB();
    const now = getDbCurrentTime(db);
    
    if (type === 'photo') {
      db.chat_history.push({
        sender: "User",
        text: message || "Shared a photo",
        type: "photo",
        mediaUrl: mediaUrl,
        timestamp: now.toISOString()
      });
      await writeDB(db);
      
      const companionName = db.profile.companion_name || "Aarav";
      const responseText = `That's a nice photo, Akash. Captured memories build trust with the future you. What's the context here?`;
      
      db.chat_history.push({
        sender: "AUM",
        text: responseText,
        timestamp: now.toISOString(),
        type: "text"
      });
      await writeDB(db);
      return NextResponse.json({ response: responseText });
    }

    const cleanMsg = message.toLowerCase().trim();

    // 1. Check for location update requests (e.g. "my new home is...")
    if (cleanMsg.includes("new home is") || cleanMsg.includes("new office is") || cleanMsg.includes("my new home ") || cleanMsg.includes("my new office ")) {
      const locUpdate = await resolveLocationUpdate(message);
      if (locUpdate.type === 'home' || locUpdate.type === 'both') {
        db.profile.location_profile.home_base = {
          city: locUpdate.city,
          neighborhood: locUpdate.neighborhood,
          lat: locUpdate.lat,
          lng: locUpdate.lng
        };
      }
      if (locUpdate.type === 'office' || locUpdate.type === 'both') {
        db.profile.location_profile.work_base = {
          city: locUpdate.city,
          neighborhood: locUpdate.neighborhood,
          lat: locUpdate.lat,
          lng: locUpdate.lng
        };
      }
      await writeDB(db);
      
      const responseText = `Location updated successfully! I've set your ${locUpdate.type === 'both' ? 'home and office locations' : locUpdate.type + ' location'} to ${locUpdate.neighborhood}, ${locUpdate.city} (${locUpdate.lat}, ${locUpdate.lng}).`;
      
      db.chat_history.push({ sender: 'User', text: message, timestamp: now.toISOString() });
      db.chat_history.push({ sender: 'AUM', text: responseText, timestamp: now.toISOString(), type: 'text' });
      await writeDB(db);
      
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${responseText}\n\n`));
          controller.close();
        }
      });
      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Encoding': 'none'
        }
      });
    }

    // 2. Check morning check-in state machine
    const checkinStage = db.context.checkin_stage || 'completed';
    if (checkinStage !== 'completed') {
      const stream = await generateCheckinStream(message, checkinStage);
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Encoding': 'none'
        }
      });
    }

    if (QUICK_INTERCEPTS[cleanMsg]) {
      const responseText = QUICK_INTERCEPTS[cleanMsg];
      
      db.chat_history.push({
        sender: "User",
        text: message,
        timestamp: now.toISOString()
      });
      db.chat_history.push({
        sender: "AUM",
        text: responseText,
        timestamp: now.toISOString(),
        type: "text"
      });
      await writeDB(db);

      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${responseText}\n\n`));
          controller.close();
        }
      });

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Encoding': 'none'
        }
      });
    }

    // 3. Normal Chat Stream wrapped with dynamic contextual task generation
    const originalStream = await generateChatResponseStream(message);
    const reader = originalStream.getReader();
    let accumulatedText = "";
    
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                accumulatedText += trimmed.slice(6);
              }
            }
          }
          
          const freshDb = await readDB();
          if (freshDb.context.checkin_stage === 'completed') {
            const now = getDbCurrentTime(freshDb);
            const currentTimeOfDay = getCurrentTimeOfDay(now);
            
            // Analyze message for emotional and activity signals
            const signals = await detectChatSignals(message);
            
            if (signals.hasSignal) {
              const locationType = getCurrentAssumedLocation(freshDb);
              const locationName = locationType === "Office"
                ? freshDb.profile.location_profile?.work_base?.neighborhood
                : freshDb.profile.location_profile?.home_base?.neighborhood;
              const currentAssumedLocation = `${locationType} (${locationName})`;
              
              const latestDb = await readDB();
              
              // Find the first todo task that is locked
              const lockedTaskIndex = latestDb.actions.findIndex(a => 
                a.status === 'todo' && 
                a.scheduled_time && 
                !isPeriodUnlocked(a.scheduled_time, currentTimeOfDay)
              );
              
              if (lockedTaskIndex !== -1) {
                // We have a locked task! Generate a new dynamic task matching the signal,
                // and use it to replace/unlock the locked task.
                const newAction = await generateSingleContextualAction(latestDb, currentAssumedLocation);
                const targetTask = latestDb.actions[lockedTaskIndex];
                
                latestDb.actions[lockedTaskIndex] = {
                  ...targetTask,
                  text: newAction.text,
                  category: newAction.category,
                  difficulty: newAction.difficulty,
                  whyToday: `Contextual Unlock: ${newAction.whyToday} (Triggered by your emotional/activity signal: "${signals.reason}")`,
                  whyRelevant: newAction.whyRelevant,
                  howTo: newAction.howTo,
                  scheduled_time: currentTimeOfDay, // Unlock it immediately by moving to the current period!
                  locked: false
                };
                
                const announcement = `\n\n🔓 *Contextual Task Unlocked:* "${newAction.text}"\n*Why:* ${newAction.whyToday}`;
                const combinedText = accumulatedText + announcement;
                
                updateChatHistoryWithAnnouncement(latestDb, combinedText);
                
                const { addRawChat } = await import('@/services/memory_engine/memory_db');
                addRawChat(latestDb, 'AUM', combinedText, getDbCurrentTime(latestDb).toISOString());
                
                await writeDB(latestDb);
                controller.enqueue(new TextEncoder().encode(`data: ${announcement}\n\n`));
              } else if (latestDb.actions.length < 5) {
                // If they have less than 5 tasks and no locked tasks (e.g. testing/onboarding), push a new task
                const newAction = await generateSingleContextualAction(latestDb, currentAssumedLocation);
                const uniqueId = `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                
                latestDb.actions.push({
                  ...newAction,
                  id: uniqueId,
                  status: 'todo',
                  scheduled_time: currentTimeOfDay,
                  locked: false
                });
                latestDb.profile.total_actions_generated = (latestDb.profile.total_actions_generated || 0) + 1;
                
                const announcement = `\n\n🔓 *New task unlocked: ${newAction.text}*\n*Why: ${newAction.whyToday}*`;
                const combinedText = accumulatedText + announcement;
                
                updateChatHistoryWithAnnouncement(latestDb, combinedText);
                
                const { addRawChat } = await import('@/services/memory_engine/memory_db');
                addRawChat(latestDb, 'AUM', combinedText, getDbCurrentTime(latestDb).toISOString());
                
                await writeDB(latestDb);
                controller.enqueue(new TextEncoder().encode(`data: ${announcement}\n\n`));
              } else {
                // Check if all 5 main tasks are completed
                const allCompleted = latestDb.actions.every(a => a.status === 'done' || a.status === 'skipped');
                const hasBonus = latestDb.actions.some(a => a.category === 'Bonus' || a.text.toLowerCase().includes('bonus'));
                
                // Trigger bonus task only if they are ready/wanting more, and all completed
                const isReadyForMore = signals.signalType === 'joy' || signals.signalType === 'excitement' || signals.signalType === 'focus' || message.toLowerCase().includes('more') || message.toLowerCase().includes('bonus');
                
                if (allCompleted && !hasBonus && isReadyForMore) {
                  const newAction = await generateSingleContextualAction(latestDb, currentAssumedLocation);
                  const uniqueId = `bonus-${Date.now()}`;
                  
                  const bonusTask = {
                    ...newAction,
                    id: uniqueId,
                    category: 'Bonus',
                    scheduled_time: currentTimeOfDay,
                    status: 'todo',
                    whyToday: `Bonus Challenge: ${newAction.whyToday}`
                  };
                  
                  latestDb.actions.push(bonusTask);
                  latestDb.profile.total_actions_generated = (latestDb.profile.total_actions_generated || 0) + 1;
                  
                  const announcement = `\n\n🌟 *Bonus Task Unlocked:* "${newAction.text}"\n*Why:* ${newAction.whyToday}`;
                  const combinedText = accumulatedText + announcement;
                  
                  updateChatHistoryWithAnnouncement(latestDb, combinedText);
                  
                  const { addRawChat } = await import('@/services/memory_engine/memory_db');
                  addRawChat(latestDb, 'AUM', combinedText, getDbCurrentTime(latestDb).toISOString());
                  
                  await writeDB(latestDb);
                  controller.enqueue(new TextEncoder().encode(`data: ${announcement}\n\n`));
                }
              }
            }
          }
        } catch (e) {
          console.error("Stream wrapper error:", e);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(sseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Content-Encoding': 'none'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { messageIndex, reaction } = await request.json();
    if (messageIndex === undefined || !reaction) {
      return NextResponse.json({ error: 'Missing messageIndex or reaction' }, { status: 400 });
    }
    const db = await readDB();
    if (!db.chat_history || db.chat_history[messageIndex] === undefined) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    // Toggle: same reaction removes it, different reaction sets it
    if (db.chat_history[messageIndex].reaction === reaction) {
      delete db.chat_history[messageIndex].reaction;
    } else {
      db.chat_history[messageIndex].reaction = reaction;
    }
    await writeDB(db);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
