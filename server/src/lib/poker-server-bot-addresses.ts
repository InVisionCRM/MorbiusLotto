/** Same wallet list as `poker-bot.ts` / env docs — used to run turns in-process on tournament tables. */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function parsePokerBotAddressCsv(input?: string): string[] {
  if (!input) return [];
  return [
    ...new Set(
      input
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)
        .filter((a) => ADDRESS_RE.test(a))
        .map((a) => a.toLowerCase()),
    ),
  ];
}

/** Lowercase 0x addresses from `POKER_BOT_ADDRESSES` (game server env). */
export function getServerPokerBotAddressSet(): Set<string> {
  const raw = String(process.env.POKER_BOT_ADDRESSES ?? '').trim();
  return new Set(parsePokerBotAddressCsv(raw || undefined));
}
