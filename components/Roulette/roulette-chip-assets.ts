import type { Chips } from 'react-casino-roulette'

/**
 * Chip image URLs for react-casino-roulette (keys = min MORBIUS face value, ascending).
 * findChipIcon picks the largest key still <= stacked amount on a cell.
 */
export const ROULETTE_CHIPS: Chips = {
  '100': '/PokerChips/blackpokerchip000.png',
  '500': '/PokerChips/greenpokerchip005.png',
  '1000': '/PokerChips/bluepokerchip010.png',
  '5000': '/PokerChips/tablepokerchip006-ezgif.com-gif-maker.png',
  '10000': '/PokerChips/redpokerchip015.png',
  '50000': '/PokerChips/tablepokerchip021-ezgif.com-rotate.png',
}

/** Ordered MORBIUS face values (matches ROULETTE_CHIPS keys). */
export const ROULETTE_CHIP_DENOMS: readonly number[] = Object.keys(ROULETTE_CHIPS)
  .map((k) => Number(k))
  .sort((a, b) => a - b)

export function rouletteChipSrcForDenom(morbius: number): string {
  return ROULETTE_CHIPS[String(morbius) as keyof Chips]
}
