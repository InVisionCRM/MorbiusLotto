/**
 * Captures the last 20 console.error calls so they can be attached to user
 * bug reports. Installed once at module load time (browser only).
 */

export interface CapturedError {
  time: string;
  message: string;
}

const MAX_ERRORS = 20;
const captured: CapturedError[] = [];

if (typeof window !== 'undefined') {
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    captured.push({
      time: new Date().toISOString(),
      message: args
        .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : String(a)))
        .join(' ')
        .slice(0, 500),
    });
    if (captured.length > MAX_ERRORS) captured.shift();
    orig(...args);
  };
}

export function getRecentErrors(): CapturedError[] {
  return [...captured];
}
