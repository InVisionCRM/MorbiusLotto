// Maps a chip-ledger round reference (ref_type + ref_id) to its public
// provably-fair verify endpoint. Every chip-based round game commits a
// server_seed_hash before the round and publishes the server_seed + client_seed
// + nonce + a derivation recipe at settle, all readable here. Returns null for
// rows that aren't a verifiable round (deposits, rewards, blackjack/lottery nets).
export function getVerifyUrl(refType: string | null | undefined, refId: string | null | undefined): string | null {
  if (!refType || !refId) return null
  if (refType.startsWith('arcade_')) {
    const slug = refType.slice('arcade_'.length).replace(/_/g, '-')
    return `/api/arcade/${slug}/verify/${refId}`
  }
  if (refType === 'keno_round') return `/api/keno/verify/${refId}`
  if (refType === 'plinko_round') return `/api/plinko/verify/${refId}`
  return null
}
