/**
 * Roulette UI SFX — add new entries under /public/roulette/sounds and extend ROULETTE_SOUND_FILES.
 */
export const ROULETTE_SOUND_FILES = {
  chip: '/roulette/sounds/Chip-Sound.wav',
  spinStart: '/roulette/sounds/UIClick-Create_an_ultra-sati-Elevenlabs.mp3',
} as const

const DEFAULT_VOLUME = 0.85

function playSrc(src: string, volume = DEFAULT_VOLUME): void {
  if (typeof window === 'undefined') return
  try {
    const audio = new Audio(src)
    audio.volume = volume
    void audio.play().catch(() => {})
  } catch {
    // ignore
  }
}

/** Short chip place — new Audio per call so rapid stacks don’t cancel each other */
export function playRouletteChipSound(): void {
  playSrc(ROULETTE_SOUND_FILES.chip)
}

/** One-shot when the wheel spin animation begins */
export function playRouletteSpinStartSound(): void {
  playSrc(ROULETTE_SOUND_FILES.spinStart)
}
