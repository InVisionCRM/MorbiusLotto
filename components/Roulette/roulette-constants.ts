/** Felt / wheel / history — vibrant casino red (overrides library default bright scarlet). */
export const ROULETTE_RED_HEX = '#e01e3d'
/** Near-black with slight lift so pockets read as charcoal on felt. */
export const ROULETTE_BLACK_HEX = '#25252a'
/** Single-zero / wheel zero wedge (library wheel uses #008000). */
export const ROULETTE_GREEN_HEX = '#008000'

// European roulette wheel pocket order (clockwise from 0)
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]

// Red numbers on a standard European roulette wheel
export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
])

export function getPocketColor(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green'
  return RED_NUMBERS.has(n) ? 'red' : 'black'
}

// The 3-column layout used for the betting grid (numbers 1–36)
// Row 0: 3,6,9,...,36  Row 1: 2,5,8,...,35  Row 2: 1,4,7,...,34
export const GRID_ROWS: number[][] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
]
