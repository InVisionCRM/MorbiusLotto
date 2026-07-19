/**
 * Verification for swap-style PLS deposits.
 *
 * The PLS deposit flow is a real PulseX market buy: the user calls
 * `swapExactETHForTokens` on the router with the MorbiusVault as the swap
 * recipient, so the purchased MORBIUS lands directly in the vault in the same
 * transaction. The server credits the ACTUAL swapped amount by summing the
 * MORBIUS ERC-20 Transfer logs whose recipient is the vault.
 *
 * Pure function (no viem client) so it is unit-testable: pass the receipt
 * logs. Security notes for callers:
 *  - The tx `to` MUST be the PulseX router and tx `from` MUST be the
 *    signed-in wallet (checked by the route, not here) — the Transfer log has
 *    no player field, so sender identity comes from the transaction itself.
 *  - Only logs emitted by the MORBIUS token contract are counted, and only
 *    those whose `to` topic is the vault. Amounts are summed in case a
 *    routed swap emits multiple hops into the vault.
 */

/** keccak256("Transfer(address,address,uint256)") — standard ERC-20 Transfer topic0. */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface MinimalLog {
  address: string;
  topics: readonly string[] | string[];
  data: string;
}

/** Lower-cases and left-pads comparison of a 32-byte topic against a 20-byte address. */
function topicIsAddress(topic: string | undefined, address: string): boolean {
  if (!topic || topic.length !== 66) return false;
  return topic.toLowerCase() === '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/**
 * Sum of MORBIUS transferred to the vault in this receipt's logs.
 * Returns 0n when the tx contains no matching transfer — callers must reject.
 */
export function extractSwapDepositAmount(
  logs: readonly MinimalLog[],
  morbiusToken: string,
  vaultAddress: string,
): bigint {
  const tokenLower = morbiusToken.toLowerCase();
  let total = 0n;
  for (const log of logs) {
    if (!log.address || log.address.toLowerCase() !== tokenLower) continue;
    const topics = log.topics ?? [];
    if ((topics[0] ?? '').toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    if (!topicIsAddress(topics[2], vaultAddress)) continue;
    if (typeof log.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) continue;
    total += BigInt(log.data);
  }
  return total;
}
