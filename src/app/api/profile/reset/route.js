import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { getDbPath } from '@/services/db';
import { cookies } from 'next/headers';

export async function POST(request) {
  try {
    const dbPath = await getDbPath();
    
    // Delete the database file from disk if it exists
    try {
      await fs.unlink(dbPath);
      console.log(`Deleted database file: ${dbPath}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // File does not exist, which is fine
    }
    
    // Clear user session cookie
    const cookieStore = await cookies();
    cookieStore.delete('aum_user_id');
    
    return NextResponse.json({ success: true, message: "Database wiped successfully." });
  } catch (error) {
    console.error("Failed to wipe profile database:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
