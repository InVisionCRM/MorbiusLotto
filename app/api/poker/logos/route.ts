import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import { join } from 'path';

const LOGOS_DIR = join(process.cwd(), 'public', 'Marketing', 'LOGOS');
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']);

export async function GET() {
  try {
    const entries = await readdir(LOGOS_DIR, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && ALLOWED_EXTS.has(e.name.slice(e.name.lastIndexOf('.')).toLowerCase()))
      .map(e => e.name)
      .sort();
    return NextResponse.json({ files });
  } catch {
    // Directory doesn't exist or is empty
    return NextResponse.json({ files: [] });
  }
}
