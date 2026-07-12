import { NextResponse } from 'next/server';
import { readDB } from '@/services/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';
    const db = await readDB();
    if (all) {
      return NextResponse.json({
        semantic_memory: db.semantic_memory || [],
        summaries: db.memory?.summaries || [],
        epoch_summaries: db.memory?.epoch_summaries || [],
        structured: db.memory?.structured || {},
        life_experiences: db.memory?.life_experiences || []
      });
    }
    return NextResponse.json(db.semantic_memory || []);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
