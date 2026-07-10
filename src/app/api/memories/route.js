import { NextResponse } from 'next/server';
import { readDB } from '@/services/db';

export async function GET() {
  try {
    const db = await readDB();
    return NextResponse.json(db.semantic_memory || []);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
