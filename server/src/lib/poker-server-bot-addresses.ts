/** Tournament table in-process bots: same wallet resolution as CLI `poker-bot.ts`. */

import { getPokerBotWalletAddressList } from './poker-bot-wallet-pool';

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

/** Lowercase bot wallets — uses env chain + defaults (unless POKER_SERVER_BOT_STRICT_ADDRESSES). */
export function getServerPokerBotAddressSet(): Set<string> {
  return new Set(getPokerBotWalletAddressList({ server: true }));
}
