/**
 * MORBIUS holder list via Moralis Deep Index (PulseChain / chain=pulse).
 * Works from cloud egress (Railway) unlike PulseScan.
 */

import { MORBIUS_TOKEN_ADDRESS } from '../config/contracts';
import { logger } from './logger';

const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2';
const PAGE_SIZE = 100;

interface MoralisOwnerRow {
  owner_address?: string;
  balance?: string;
}

interface MoralisOwnersPage {
  result?: MoralisOwnerRow[];
  cursor?: string | null;
}

export interface MorbiusHolderBalance {
  address: string;
  balance: bigint;
}

function getMoralisApiKey(): string | null {
  const key = process.env.MORALIS_API_KEY?.trim();
  return key || null;
}

/** True when MORALIS_API_KEY is configured. */
export function isMoralisHoldersConfigured(): boolean {
  return getMoralisApiKey() !== null;
}

/**
 * Paginate Moralis erc20/owners for MORBIUS on PulseChain.
 * Returns all wallets with non-zero balance (Moralis only returns holders).
 */
export async function fetchMorbiusHoldersFromMoralis(): Promise<MorbiusHolderBalance[]> {
  const apiKey = getMoralisApiKey();
  if (!apiKey) {
    throw new Error('MORALIS_API_KEY is not configured');
  }

  const holders: MorbiusHolderBalance[] = [];
  let cursor: string | undefined;
  let page = 0;

  do {
    page += 1;
    const params = new URLSearchParams({
      chain: 'pulse',
      limit: String(PAGE_SIZE),
      order: 'DESC',
    });
    if (cursor) params.set('cursor', cursor);

    const url = `${MORALIS_BASE}/erc20/${MORBIUS_TOKEN_ADDRESS}/owners?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { 'X-API-Key': apiKey, accept: 'application/json' },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Moralis owners API ${resp.status}: ${body.slice(0, 300)}`);
    }

    const data = await resp.json() as MoralisOwnersPage;
    for (const row of data.result ?? []) {
      const address = row.owner_address?.toLowerCase();
      if (!address) continue;
      holders.push({ address, balance: BigInt(row.balance ?? '0') });
    }

    cursor = data.cursor ?? undefined;
    logger.info(`[MorbiusHoldersMoralis] Page ${page}: ${data.result?.length ?? 0} rows (total ${holders.length})`);

    if (cursor) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } while (cursor);

  logger.info(`[MorbiusHoldersMoralis] ${holders.length} holders from Moralis`);
  return holders;
}
