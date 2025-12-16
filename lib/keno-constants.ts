/**
 * Keno Contract Constants
 *
 * These match the constants defined in CryptoKeno.sol
 * Keep in sync when contract is updated
 */

// Add-on flags (bitwise flags)
export const ADDON_MULTIPLIER = 1 << 0  // 0x01 = 1
export const ADDON_BULLSEYE = 1 << 1    // 0x02 = 2
export const ADDON_PLUS3 = 1 << 2       // 0x04 = 4
export const ADDON_PROGRESSIVE = 1 << 3 // 0x08 = 8

// Keno game constants
export const KENO_NUMBERS = 80
export const KENO_DRAWN = 20
export const PLUS3_DRAWN = 3
export const MIN_SPOT = 1
export const MAX_SPOT = 10

// Progressive constants
export const PROGRESSIVE_MIN_SPOTS = 9
export const PROGRESSIVE_MIN_HITS = 9

/**
 * Helper function to build addon flags
 *
 * @example
 * const addons = buildAddons({
 *   multiplier: true,
 *   bullsEye: false,
 *   plus3: true,
 *   progressive: true
 * })
 * // Returns: 0x0D (MULTIPLIER | PLUS3 | PROGRESSIVE)
 */
export function buildAddons(options: {
  multiplier?: boolean
  bullsEye?: boolean
  plus3?: boolean
  progressive?: boolean
}): number {
  let flags = 0

  if (options.multiplier) flags |= ADDON_MULTIPLIER
  if (options.bullsEye) flags |= ADDON_BULLSEYE
  if (options.plus3) flags |= ADDON_PLUS3
  if (options.progressive) flags |= ADDON_PROGRESSIVE

  return flags
}

/**
 * Helper function to parse addon flags
 *
 * @example
 * const addons = parseAddons(0x0D)
 * // Returns: { multiplier: true, bullsEye: false, plus3: true, progressive: true }
 */
export function parseAddons(flags: number): {
  multiplier: boolean
  bullsEye: boolean
  plus3: boolean
  progressive: boolean
} {
  return {
    multiplier: (flags & ADDON_MULTIPLIER) !== 0,
    bullsEye: (flags & ADDON_BULLSEYE) !== 0,
    plus3: (flags & ADDON_PLUS3) !== 0,
    progressive: (flags & ADDON_PROGRESSIVE) !== 0,
  }
}

/**
 * Check if progressive is eligible based on spot size
 */
export function isProgressiveEligible(spotSize: number): boolean {
  return spotSize >= PROGRESSIVE_MIN_SPOTS
}

/**
 * Check if a ticket is a progressive winner
 */
export function isProgressiveWinner(
  spotSize: number,
  hits: number,
  hasProgressiveAddon: boolean
): boolean {
  return (
    hasProgressiveAddon &&
    spotSize >= PROGRESSIVE_MIN_SPOTS &&
    hits >= PROGRESSIVE_MIN_HITS
  )
}

/**
 * Get addon names from flags
 */
export function getAddonNames(flags: number): string[] {
  const names: string[] = []
  const addons = parseAddons(flags)

  if (addons.multiplier) names.push('Multiplier')
  if (addons.bullsEye) names.push('Bulls-Eye')
  if (addons.plus3) names.push('Plus 3')
  if (addons.progressive) names.push('Pulse Progressive')

  return names
}

/**
 * Get addon description
 */
export function getAddonDescription(addon: keyof ReturnType<typeof parseAddons>): string {
  const descriptions = {
    multiplier: 'Randomly multiply your winnings by up to 10×',
    bullsEye: 'Win enhanced prizes when the Bulls-Eye number is hit',
    plus3: 'Draw 3 additional numbers for more winning chances',
    progressive: 'Win the growing jackpot by matching 9+ numbers on 9/10-spot games',
  }

  return descriptions[addon]
}
