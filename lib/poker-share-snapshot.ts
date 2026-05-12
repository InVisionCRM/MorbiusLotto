/**
 * Single source of truth for deriving share-card snapshot props from a
 * `PokerTournamentSummary`. Used anywhere outside the creator dialog (lobby,
 * post-create confirmation, my-tournaments modal, etc.) that needs to feed
 * `PokerTournamentSharePanel`.
 *
 * The creator dialog uses its own in-component memo because it derives the
 * snapshot from in-progress form state — it shares only the formatting helpers
 * exported here (`formatShareScheduleLine` / `shortTimeZoneName`).
 *
 * Limitation (cheap-version scope): custom-token tournaments do not include a
 * logo URL on the summary, so `shareTokenLogoUrl` is `null` for them. The
 * overlay falls back to the symbol-only inline tag.
 */

import { format } from 'date-fns';
import { formatChips } from '@/lib/format-poker-chips';
import {
  formatPrizePoolDisplay,
  formatPrizeTokenUnitLabel,
} from '@/lib/format-poker-tournament-prize-display';
import { POKER_MORBIUS_SHARE_LOGO_PUBLIC_URL } from '@/lib/poker-table-logo-constants';
import {
  findPokerPrizePresetMeta,
  type PokerPrizePresetId,
} from '@/lib/poker-tournament-prize-presets';
import type { PokerTournamentSummary } from '@/hooks/use-poker-tournament';

export interface PokerShareSnapshot {
  tournamentName: string;
  isFreeroll: boolean;
  /** e.g. "Tue, May 13, 2026 · 3:00 PM EDT" or "Start time TBD". */
  scheduleLine: string;
  /** Mirrors the creator's prize line as closely as practical. */
  prizeLine: string;
  /** Human-readable payout preset (e.g. "Winner takes all"). */
  payoutLine: string;
  /** Inline ticker on the overlay; `null` falls back to no logo. */
  shareTokenSymbol: string | null;
  /** Inline logo URL on the overlay; `null` for custom-token tournaments. */
  shareTokenLogoUrl: string | null;
}

/** Short timezone like `EDT` / `PST`. Empty string if `Intl` can't resolve one. */
export function shortTimeZoneName(local: Date): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(local);
    return parts.find((p) => p.type === 'timeZoneName')?.value?.trim() ?? '';
  } catch {
    return '';
  }
}

/** "Tue, May 13, 2026 · 3:00 PM EDT" (timezone suffix omitted if Intl can't resolve one). */
export function formatShareScheduleLine(local: Date): string {
  const base = format(local, 'EEE, MMM d, yyyy · h:mm a');
  const tz = shortTimeZoneName(local);
  return tz ? `${base} ${tz}` : base;
}

function safeBigInt(raw: string | null | undefined): bigint {
  try {
    return BigInt(raw || '0');
  } catch {
    return 0n;
  }
}

function isFreerollSummary(t: PokerTournamentSummary): boolean {
  return safeBigInt(t.buyInAmount) === 0n;
}

function isCustomTokenSummary(t: PokerTournamentSummary): boolean {
  return !!t.prizeTokenAddress?.trim();
}

/** Snake/lower-cased preset IDs → "Title cased label". `custom` → `Custom`. */
function humanizeDistributionType(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '—';
  const words = cleaned.replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  const [first, ...rest] = words;
  const head = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  const tail = rest.map((w) => w.toLowerCase()).join(' ');
  return tail ? `${head} ${tail}` : head;
}

function buildPayoutLine(t: PokerTournamentSummary): string {
  const id = t.prizeDistributionType;
  if (!id) return '—';
  const preset = findPokerPrizePresetMeta(id as PokerPrizePresetId);
  return preset?.label ?? humanizeDistributionType(id);
}

function buildPrizeLine(t: PokerTournamentSummary): string {
  const freeroll = isFreerollSummary(t);
  const customToken = isCustomTokenSummary(t);

  if (!customToken) {
    if (freeroll) {
      const pool = safeBigInt(t.prizePool);
      return pool > 0n ? `${formatChips(pool)} MORBIUS` : 'MORBIUS pool';
    }
    const buyIn = safeBigInt(t.buyInAmount);
    return buyIn > 0n ? `${formatChips(buyIn)} MORBIUS buy-in` : 'MORBIUS buy-in';
  }

  // Custom-token. Reuse the lobby's display helpers so units/decimals match.
  const meta = {
    prizeTokenAddress: t.prizeTokenAddress ?? null,
    prizeTokenDecimals: t.prizeTokenDecimals,
    prizeTokenSymbol: t.prizeTokenSymbol,
    prizeTokenName: t.prizeTokenName,
  };
  if (freeroll) {
    return formatPrizePoolDisplay(t.prizePool, meta);
  }
  // Per-seat custom token buy-in: mirror creator's "X TOKEN/seat · up to N seats".
  const perSeat = formatPrizePoolDisplay(t.buyInAmount, meta);
  return `${perSeat}/seat · up to ${t.maxPlayers} seats`;
}

function buildShareTokenIdentity(t: PokerTournamentSummary): {
  shareTokenSymbol: string | null;
  shareTokenLogoUrl: string | null;
} {
  if (isCustomTokenSummary(t)) {
    // Prefer explicit symbol; fall back to the unit-label helper so we never
    // surface a raw contract address in the overlay tag.
    const symbol = t.prizeTokenSymbol?.trim() || formatPrizeTokenUnitLabel({
      prizeTokenAddress: t.prizeTokenAddress ?? null,
      prizeTokenSymbol: t.prizeTokenSymbol,
      prizeTokenName: t.prizeTokenName,
    });
    return {
      shareTokenSymbol: symbol || null,
      // Summary doesn't include a logo URL — accepted limitation.
      shareTokenLogoUrl: null,
    };
  }
  return {
    shareTokenSymbol: 'MORBIUS',
    shareTokenLogoUrl: POKER_MORBIUS_SHARE_LOGO_PUBLIC_URL,
  };
}

function buildScheduleLine(t: PokerTournamentSummary): string {
  if (!t.scheduledStartAt) return 'Start time TBD';
  const local = new Date(t.scheduledStartAt);
  if (Number.isNaN(local.getTime())) return 'Start time TBD';
  return formatShareScheduleLine(local);
}

export function derivePokerShareSnapshotFromSummary(t: PokerTournamentSummary): PokerShareSnapshot {
  const identity = buildShareTokenIdentity(t);
  return {
    tournamentName: (t.name?.trim() || 'My tournament'),
    isFreeroll: isFreerollSummary(t),
    scheduleLine: buildScheduleLine(t),
    prizeLine: buildPrizeLine(t),
    payoutLine: buildPayoutLine(t),
    shareTokenSymbol: identity.shareTokenSymbol,
    shareTokenLogoUrl: identity.shareTokenLogoUrl,
  };
}
