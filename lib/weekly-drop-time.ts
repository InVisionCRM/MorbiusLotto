/**
 * weekly-drop-time.ts — client-side mirror of the backend's drop close time.
 *
 * The Weekly Drop closes every Sunday at 8:00 PM America/New_York (US Eastern),
 * DST-aware. The backend sends the resolved UTC instant as `closesAt`, so the
 * countdown normally uses that. This is only the fallback for when that value
 * isn't loaded yet — kept in sync with weekly-drop.service.ts so the fallback
 * never counts to a different time than the server.
 */

const DROP_TZ = 'America/New_York'
const DROP_CLOSE_LOCAL_HOUR = 20 // 8 PM

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Minutes to ADD to UTC to get Eastern time at `date` (DST-aware). */
function tzOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DROP_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const p: Record<string, string> = {}
  for (const part of parts) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (asUTC - date.getTime()) / 60000
}

function zonedWallClockToUTC(y: number, m: number, d: number, h: number): Date {
  const guessUTC = Date.UTC(y, m, d, h, 0, 0)
  const off1 = tzOffsetMinutes(new Date(guessUTC))
  let ts = guessUTC - off1 * 60000
  const off2 = tzOffsetMinutes(new Date(ts))
  if (off2 !== off1) ts = guessUTC - off2 * 60000
  return new Date(ts)
}

function zonedDateParts(date: Date): { y: number; m: number; d: number; wd: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DROP_TZ, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const p: Record<string, string> = {}
  for (const part of parts) p[part.type] = part.value
  return { y: +p.year, m: +p.month - 1, d: +p.day, wd: WEEKDAY_INDEX[p.weekday] }
}

/** Next Sunday 8:00 PM Eastern, as a Date (UTC instant), strictly after now. */
export function nextSundayDropUtc(from: Date = new Date()): Date {
  const { y, m, d, wd } = zonedDateParts(from)
  const daysUntilSunday = (7 - wd) % 7
  let close = zonedWallClockToUTC(y, m, d + daysUntilSunday, DROP_CLOSE_LOCAL_HOUR)
  if (close.getTime() <= from.getTime()) {
    close = zonedWallClockToUTC(y, m, d + daysUntilSunday + 7, DROP_CLOSE_LOCAL_HOUR)
  }
  return close
}
