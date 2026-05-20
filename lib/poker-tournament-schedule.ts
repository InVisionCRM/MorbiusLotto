/**
 * Shared schedule helpers used by the classic poker tournament creator AND the
 * new MTT creator wizard. Pulled into a lib so both surfaces compute identical
 * default start times, format date / time inputs the same way, and open the
 * native date/time picker on label clicks consistently.
 *
 * All timestamps are LOCAL time (no UTC conversion). `parseLocalDateTime`
 * returns a `Date` built from local components so subsequent `.toISOString()`
 * produces the correct wall-clock instant the user picked.
 */

/**
 * Sensible defaults for a freshly-opened scheduled tournament: ~2 minutes from
 * now, rounded to the next minute, in the user's local timezone. The 60-second
 * floor matches the server-side rule that `scheduledStartAt` must be at least
 * 1 minute in the future at publish time.
 */
export function defaultScheduledFields(): { date: string; time: string } {
  const from = new Date(Date.now() + 120_000);
  from.setSeconds(0, 0);
  while (from.getTime() < Date.now() + 60_000) {
    from.setMinutes(from.getMinutes() + 1);
  }
  return {
    date: localYyyyMmDd(from),
    time: `${String(from.getHours()).padStart(2, '0')}:${String(from.getMinutes()).padStart(2, '0')}`,
  };
}

/** Local-time `YYYY-MM-DD` formatter (no timezone conversion). */
export function localYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Combine `<input type="date">` and `<input type="time">` values into a local
 * `Date`. Returns null when either string is malformed so callers can surface
 * a validation error.
 */
export function parseLocalDateTime(dateStr: string, timeStr: string): Date | null {
  const parts = dateStr.split('-').map(Number);
  const timeOnly = timeStr.slice(0, 5);
  const timeParts = timeOnly.split(':').map(Number);
  if (parts.length !== 3 || timeParts.length !== 2) return null;
  const [y, mo, d] = parts;
  const [hh, mm] = timeParts;
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    return null;
  }
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

/**
 * Programmatically open a date/time `<input>`'s native picker. Used so clicking
 * the label / surrounding wrapper opens the picker, not just the tiny calendar
 * icon. Falls back to focus+click on browsers without `showPicker()` (older
 * Safari) or when a non-user-gesture invocation throws.
 */
export function openDateOrTimePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  const withPicker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof withPicker.showPicker === 'function') {
    try {
      withPicker.showPicker();
      return;
    } catch {
      /* secure context / user gesture quirks */
    }
  }
  input.focus();
  input.click();
}
