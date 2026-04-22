import type { PokerCurrentHand, PokerSeatState } from '@/lib/websocket-client';
import { formatChips } from '@/lib/format-poker-chips';
import { toBigIntSafe } from '@/lib/safe-bigint';

function seatDisplayLabel(seat: PokerSeatState | undefined, position: number): string {
  if (!seat?.playerAddress) return `Seat ${position + 1}`;
  const name = seat.displayName?.trim();
  if (name) return name.length > 22 ? `${name.slice(0, 20)}…` : name;
  const a = seat.playerAddress.toLowerCase();
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** One-line summary for HUD / action bar (no newline). */
export function formatPokerLastActionLine(
  lastAction: NonNullable<PokerCurrentHand['lastAction']>,
  seats: PokerSeatState[],
): string {
  const seat = seats[lastAction.position];
  const who = seatDisplayLabel(seat, lastAction.position);
  const act = lastAction.action;
  const chips = toBigIntSafe(lastAction.amount ?? '0');
  const amt = chips > 0n ? formatChips(chips) : '';

  switch (act) {
    case 'fold':
      return `${who} folded`;
    case 'check':
      return `${who} checked`;
    case 'call':
      return amt ? `${who} called ${amt}` : `${who} called`;
    case 'bet':
      return amt ? `${who} bet ${amt}` : `${who} bet`;
    case 'raise':
      return amt ? `${who} raised to ${amt}` : `${who} raised`;
    default:
      return amt ? `${who} ${act} ${amt}` : `${who} ${act}`;
  }
}
