// Maps a chip-ledger round reference (ref_type + ref_id) to its public
// provably-fair verify endpoint. Every chip-based round game commits a
// server_seed_hash before the round and publishes the server_seed + client_seed
// + nonce + a derivation recipe at settle, all readable here. Returns null for
// rows that aren't a verifiable round (deposits, rewards, lottery nets).
export function getVerifyUrl(refType: string | null | undefined, refId: string | null | undefined): string | null {
  if (!refType || !refId) return null
  if (refType.startsWith('arcade_')) {
    const slug = refType.slice('arcade_'.length).replace(/_/g, '-')
    return `/api/arcade/${slug}/verify/${refId}`
  }
  if (refType === 'keno_round') return `/api/keno/verify/${refId}`
  if (refType === 'plinko_round') return `/api/plinko/verify/${refId}`
  // Single-player ('blackjack_game') and multiplayer ('blackjack_multi') both
  // resolve through the same backend endpoint — BlackjackGameService.verifyGame
  // (server/src/routes/verify.routes.ts) inspects the id and returns whichever
  // shape applies. ref_id is only populated for bets recorded after this was
  // wired up; older blackjack_game rows have ref_id = null and getVerifyUrl
  // correctly falls through to null for those (nothing to verify against).
  if (refType === 'blackjack_game' || refType === 'blackjack_multi') return `/api/game/${refId}/verify`
  return null
}
