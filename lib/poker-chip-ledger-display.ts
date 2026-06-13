import type { PokerChipLedgerEntry, PokerChipLedgerReason } from '@/hooks/use-poker-chip-ledger';

export type LedgerDirection = 'in' | 'out' | 'prize' | 'exchange';

export interface LedgerDisplay {
  direction: LedgerDirection;
  label: string;       // primary text on the row
  meta: string;        // secondary text (table / direction / etc.)
}

function deriveDirection(reason: PokerChipLedgerReason, delta: string): LedgerDirection {
  if (reason === 'tournament_prize') return 'prize';
  if (reason === 'purchase' || reason === 'cashout') return 'exchange';
  try {
    return BigInt(delta) >= 0n ? 'in' : 'out';
  } catch {
    return 'in';
  }
}

/**
 * Map a chip-ledger reason + optional refName to display strings for the
 * lobby's inline list and the transaction-history modal. Keeps the mapping in
 * one place so the two views can't drift. The icon is rendered by the
 * shared `<LedgerDirectionIcon />` based on the `direction` field below.
 */
export function ledgerDisplay(entry: PokerChipLedgerEntry): LedgerDisplay {
  const { reason, refName, refType, refId, delta } = entry;
  const direction = deriveDirection(reason as PokerChipLedgerReason, delta);

  switch (reason as PokerChipLedgerReason) {
    case 'purchase':
      return { direction, label: 'Bought chips', meta: 'MORBIUS → chips' };
    case 'cashout':
      return { direction, label: 'Cashed out', meta: 'chips → MORBIUS' };
    case 'cash_join':
      return { direction, label: 'Sat at cash table', meta: refName ?? (refId ? `Table ${shortRef(refId)}` : 'Cash game') };
    case 'cash_leave':
      return { direction, label: 'Left cash table', meta: refName ?? (refId ? `Table ${shortRef(refId)}` : 'Cash game') };
    case 'cash_reup':
      return { direction, label: 'Topped up stack', meta: refName ?? (refId ? `Table ${shortRef(refId)}` : 'Cash game') };
    case 'cash_admin_return':
      return { direction, label: 'Admin chip refund', meta: refName ?? 'Refund' };
    case 'tournament_buyin':
      return { direction, label: 'Tournament buy-in', meta: refName ?? 'Tournament' };
    case 'tournament_create_guarantee':
      return { direction, label: 'Funded guarantee', meta: refName ?? 'Tournament' };
    case 'tournament_refund':
      return { direction, label: 'Tournament refund', meta: refName ?? 'Tournament' };
    case 'tournament_prize':
      return { direction, label: 'Tournament prize', meta: refName ?? 'Tournament' };
    case 'rake':
      return { direction, label: 'Rake', meta: refType ?? 'House fee' };
    case 'creator_fee':
      return { direction, label: 'Creator fee', meta: refType ?? 'Table host' };
    case 'platform_fee':
      return { direction, label: 'Platform fee', meta: refType ?? 'Platform' };
    case 'arcade_craps_bet':
      return { direction, label: 'Craps bet', meta: refId ? `Session ${shortRef(refId)}` : 'Craps' };
    case 'arcade_craps_payout':
      return { direction, label: 'Craps payout', meta: refId ? `Session ${shortRef(refId)}` : 'Craps' };
    case 'arcade_craps_refund':
      return { direction, label: 'Craps refund', meta: refId ? `Session ${shortRef(refId)}` : 'Craps' };
    default:
      return {
        direction,
        label: prettify(String(reason)),
        meta: refName ?? refType ?? '—',
      };
  }
}

function shortRef(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function prettify(reason: string): string {
  return reason
    .split('_')
    .map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join(' ');
}

/**
 * Relative time formatter — keeps the strings consistent across the inline list
 * and the modal. Falls back to a date string for anything older than a week.
 */
export function formatRelativeTime(iso: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < 30_000) return 'just now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Compact signed delta — strips leading zeros, uses `formatChips` semantics for
 * abbreviation. Returns sign-prefixed strings like `+12K` / `−5,000`.
 */
export function formatDelta(deltaStr: string): { display: string; isCredit: boolean } {
  try {
    const bn = BigInt(deltaStr);
    const abs = bn < 0n ? -bn : bn;
    return {
      display: bn < 0n ? `−${formatChipsCompact(abs)}` : `+${formatChipsCompact(bn)}`,
      isCredit: bn >= 0n,
    };
  } catch {
    return { display: deltaStr, isCredit: true };
  }
}

/** Brief K/M/B abbreviation. 12,000 → 12K · 1,500,000 → 1.5M. */
function formatChipsCompact(n: bigint): string {
  if (n < 1_000n) return n.toString();
  if (n < 1_000_000n) {
    const k = Number(n) / 1_000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`;
  }
  if (n < 1_000_000_000n) {
    const m = Number(n) / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  const b = Number(n) / 1_000_000_000;
  return `${b % 1 === 0 ? b : b.toFixed(1)}B`;
}
