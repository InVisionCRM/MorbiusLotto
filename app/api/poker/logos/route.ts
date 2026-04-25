import { NextResponse } from 'next/server';
import { POKER_CURATED_LOGO_FILENAMES } from '@/lib/poker-curated-logos';

export function GET() {
  return NextResponse.json({ files: [...POKER_CURATED_LOGO_FILENAMES] });
}
