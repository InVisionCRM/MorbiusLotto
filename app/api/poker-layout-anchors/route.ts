import { NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';

/**
 * Dev-only scratch persistence for the /poker-layout anchor editor.
 * POST  → writes the dragged anchor rings to lib/poker-seat-anchors.saved.json
 * GET   → returns that file (so the editor can reload your last saved set)
 *
 * This is a tuning convenience: the saved JSON is read back by the editor and
 * later baked into lib/poker-seat-layout.ts by hand. It is NOT wired into the
 * live game and is blocked in production.
 */
const SAVE_FILE = path.join(process.cwd(), 'lib', 'poker-seat-anchors.saved.json');

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'editor save is disabled in production' }, { status: 403 });
  }
  try {
    const body = await req.text();
    JSON.parse(body); // validate
    await writeFile(SAVE_FILE, body, 'utf8');
    return NextResponse.json({ ok: true, file: 'lib/poker-seat-anchors.saved.json' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function GET() {
  try {
    const txt = await readFile(SAVE_FILE, 'utf8');
    return new NextResponse(txt, { headers: { 'content-type': 'application/json' } });
  } catch {
    return NextResponse.json({}, { status: 404 });
  }
}
