import { NextResponse } from 'next/server';
import { readDB } from '@/services/db';
import { generateChatResponseService } from '@/services/gemini';

export async function GET() {
  try {
    const db = await readDB();
    return NextResponse.json(db.chat_history || []);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { message } = await request.json();
    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }
    const response = await generateChatResponseService(message);
    return NextResponse.json({ response });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
