/**
 * In-memory "table talk" log per poker table: speech bubbles (quick-chat phrases) and
 * directed emotes / throwables, from bots (poker-bot-banter.service) and humans (WS
 * handlers). The app gets these live over the websocket; the X stream renderer
 * (stream/view.html) polls the public table snapshot, so the last few entries ride
 * along on GET /api/poker/bot-schedule/table/:id/state as `talk`.
 *
 * Ephemeral by design (lost on restart, capped per table) — it's chatter, not history.
 */

export type TableTalkEntry =
  | { id: number; at: string; kind: 'say'; fromPosition: number; fromName: string | null; text: string; bot: boolean }
  | { id: number; at: string; kind: 'emote'; fromPosition: number; fromName: string | null; toPosition: number; toName: string | null; emote: string; bot: boolean };

type NewEntry =
  | { kind: 'say'; fromPosition: number; fromName?: string | null; text: string; bot: boolean }
  | { kind: 'emote'; fromPosition: number; fromName?: string | null; toPosition: number; toName?: string | null; emote: string; bot: boolean };

const MAX_PER_TABLE = 12;
const MAX_AGE_MS = 2 * 60_000;
const MAX_TABLES = 200;
const logs = new Map<string, TableTalkEntry[]>();
let seq = 0;

export function recordTableTalk(tableId: string, entry: NewEntry, now = Date.now()): TableTalkEntry {
  const full = {
    ...entry,
    fromName: entry.fromName ?? null,
    ...(entry.kind === 'emote' ? { toName: entry.toName ?? null } : {}),
    id: ++seq,
    at: new Date(now).toISOString(),
  } as TableTalkEntry;
  let list = logs.get(tableId);
  if (!list) {
    if (logs.size >= MAX_TABLES) logs.delete(logs.keys().next().value as string);
    list = [];
    logs.set(tableId, list);
  }
  list.push(full);
  if (list.length > MAX_PER_TABLE) list.splice(0, list.length - MAX_PER_TABLE);
  return full;
}

/** Recent entries (oldest → newest), dropping anything older than two minutes. */
export function getTableTalk(tableId: string, now = Date.now()): TableTalkEntry[] {
  const list = logs.get(tableId);
  if (!list) return [];
  return list.filter((e) => now - Date.parse(e.at) <= MAX_AGE_MS);
}

/** Test seam. */
export function resetTableTalkForTesting(): void {
  logs.clear();
  seq = 0;
}
