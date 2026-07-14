import { NextResponse } from 'next/server';
import { readDB, writeDB, getDbCurrentTime, getMomentumDayString } from '@/services/db';
import { generateChatResponseService, generateChatResponseStream } from '@/services/groq';

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

// Helper to check and inject morning greetings and contextual nudges
async function injectContextualMessages(db) {
  const profile = db.profile || {};
  const context = db.context || {};
  const now = getDbCurrentTime(db);
  const todayStr = getMomentumDayString(now);
  
  let dbChanged = false;
  profile.sent_nudges = profile.sent_nudges || [];

  // 1. Morning Greeting Check
  const currentHours = now.getHours();
  // Morning is 5 AM to 11 AM
  if (currentHours >= 5 && currentHours < 11 && profile.last_greeting_date !== todayStr) {
    const sleepHours = context.sleep?.hours || 7.0;
    const isBusy = now.getDay() >= 1 && now.getDay() <= 5; // Weekdays
    const name = profile.name || "Akash";
    
    const greetingText = `Morning. You got ${sleepHours} hours. ${isBusy ? 'Busy day ahead.' : 'Lighter day today.'} What do you want to protect?`;
    
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
    // Fetch fresh db after inject
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

    const stream = await generateChatResponseStream(message);
    return new Response(stream, {
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
