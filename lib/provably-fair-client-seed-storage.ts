/** Sync client seed between profile modal and game pages (same browser). */
const KEY_BLACKJACK = 'morblotto_pf_client_seed_blackjack'
const KEY_LOTTERY = 'morblotto_pf_client_seed_lottery'

export type ProvablyFairStoredGame = 'blackjack' | 'lottery'

export function clientSeedStorageKey(game: ProvablyFairStoredGame): string {
  return game === 'blackjack' ? KEY_BLACKJACK : KEY_LOTTERY
}

export function loadStoredClientSeed(game: ProvablyFairStoredGame): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(clientSeedStorageKey(game))
    return v && v.length > 0 ? v.slice(0, 255) : null
  } catch {
    return null
  }
}

export function saveStoredClientSeed(game: ProvablyFairStoredGame, seed: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(clientSeedStorageKey(game), seed.slice(0, 255))
  } catch {
    /* ignore quota / private mode */
  }
}
