import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

// All 9 test suites — name must match the describe() block exactly
const SUITES: Record<string, string> = {
  'all':                     '',
  'create':                  '1 — createPokerTournament',
  'join':                    '2 — joinPokerTournament',
  'auto-start':              '3 — auto-start',
  'blind-level':             '4 — computeBlindLevel',
  'chip-sync':               '5 — syncAfterHand chip sync',
  'elimination':             '6 — player elimination',
  'prizes':                  '7 — prize distribution',
  'e2e':                     '8 — full 2-player E2E',
  'regression':              '9 — regression',
};

export async function POST(req: NextRequest) {
  const { suite = 'all' } = await req.json().catch(() => ({}));

  const serverDir = path.resolve(process.cwd(), 'server');
  const pattern = SUITES[suite];

  const args = ['run', 'test', '--'];
  if (pattern) args.push('--testNamePattern', pattern);
  // Always run with forceExit so it doesn't hang; colors off for clean output
  args.push('--forceExit', '--no-coverage', '--colors');

  return new Promise<NextResponse>((resolve) => {
    const chunks: string[] = [];
    let timedOut = false;

    const proc = spawn('npm', args, {
      cwd: serverDir,
      env: { ...process.env },
      shell: true,
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, 120_000); // 2 min max

    proc.stdout.on('data', (d: Buffer) => chunks.push(d.toString()));
    proc.stderr.on('data', (d: Buffer) => chunks.push(d.toString()));

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve(
        NextResponse.json({
          ok: code === 0,
          exitCode: code,
          timedOut,
          output: chunks.join(''),
          suite: suite === 'all' ? 'All suites' : (SUITES[suite] ?? suite),
          ranAt: new Date().toISOString(),
        })
      );
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve(
        NextResponse.json(
          { ok: false, exitCode: -1, timedOut: false, output: err.message, suite, ranAt: new Date().toISOString() },
          { status: 500 }
        )
      );
    });
  });
}
