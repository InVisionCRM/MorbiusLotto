import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

// Suite keys → Jest --testNamePattern (must match describe() in poker-tournament.test.ts).
// Always scoped with --testPathPattern=poker-tournament.test (this route is poker tournaments only).
const SUITES: Record<string, string> = {
  'all':                     '',
  'create':                  '1 - createPokerTournament',
  'join':                    '2 - joinPokerTournament',
  'auto-start':              '3 - auto-start',
  'blind-level':             '4 - computeBlindLevel',
  'chip-sync':               '5 - syncAfterHand chip sync',
  'elimination':             '6 - player elimination',
  'prizes':                  '7 - prize distribution',
  'e2e':                     '8 - full 2-player E2E',
  'scheduled':               '9 - scheduled poker start',
  'regression':              '10 - regression',
};

export async function POST(req: NextRequest) {
  const { suite = 'all' } = await req.json().catch(() => ({}));

  const serverDir = path.resolve(process.cwd(), 'server');
  const jestBin = path.join(serverDir, 'node_modules', '.bin', 'jest');
  const pattern = SUITES[suite] ?? '';

  // Run jest binary directly — avoids npm arg-parsing issues with special characters
  const args: string[] = [
    '--forceExit',
    '--no-coverage',
    '--colors',
    '--testPathPattern',
    'poker-tournament.test',
  ];
  if (pattern) args.push('--testNamePattern', pattern);

  return new Promise<NextResponse>((resolve) => {
    const chunks: string[] = [];
    let timedOut = false;

    const proc = spawn(jestBin, args, {
      cwd: serverDir,
      env: { ...process.env, PATH: process.env.PATH },
      shell: false,
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
