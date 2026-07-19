import { NextResponse } from 'next/server';
import { readDB, writeDB } from '@/services/db';

export async function POST(req) {
  try {
    const { actionId, rating, chips } = await req.json();

    if (!actionId || !rating) {
      return NextResponse.json({ error: 'Missing actionId or rating' }, { status: 400 });
    }

    const db = await readDB();

    // Find the most-recent entry in db.profile.intervention_memory where actionId matches
    const memory = db.profile.intervention_memory || [];
    let entryIndex = -1;
    for (let i = memory.length - 1; i >= 0; i--) {
      if (memory[i].actionId === actionId) {
        entryIndex = i;
        break;
      }
    }

    if (entryIndex !== -1) {
      memory[entryIndex].rating = rating;
      memory[entryIndex].chips = chips || [];
    }

    // Update db.profile.rating_adjustments map
    db.profile.rating_adjustments = db.profile.rating_adjustments || {};
    const ratingMap = { 5: 0.5, 4: 0.25, 3: 0, 2: -0.25, 1: -0.5 };
    const delta = ratingMap[rating] || 0;
    
    let currentVal = db.profile.rating_adjustments[actionId] || 0;
    currentVal += delta;
    
    // Cap at [-3.0, 3.0]
    currentVal = Math.max(-3.0, Math.min(3.0, currentVal));
    db.profile.rating_adjustments[actionId] = currentVal;

    await writeDB(db);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to rate action:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
