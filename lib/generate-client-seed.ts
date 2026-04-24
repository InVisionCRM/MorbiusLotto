/** 16 random bytes as 32 hex chars — matches solo Blackjack client seed format. */
export function generateHexClientSeed(): string {
  try {
    const c = globalThis.crypto
    if (c?.getRandomValues) {
      const bytes = new Uint8Array(16)
      c.getRandomValues(bytes)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    /* ignore */
  }
  return ''
}
