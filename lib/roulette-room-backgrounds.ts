/**
 * Full-page roulette room atmospheres — same classy radial presets as poker table felt
 * (`FELT_COLOR_PRESETS` in `hooks/use-poker-table-effect.ts`), so choices feel familiar.
 */
export type RouletteRoomBgId = 'navy' | 'emerald' | 'crimson' | 'purple' | 'slate' | 'midnight'

/** Default matches poker’s default felt preset (`navy`). */
export const DEFAULT_ROULETTE_ROOM_BG: RouletteRoomBgId = 'navy'

/** Wheel outer rim (::after) — harmonized with each room preset */
export type RouletteWheelRim = {
  outer: string
  inner: string
  glow: string
}

export const ROULETTE_ROOM_BACKGROUNDS: readonly {
  id: RouletteRoomBgId
  label: string
  /** Representative color for swatch buttons */
  swatch: string
  /** Fixed viewport base (radial, reads well full-screen) */
  gradient: string
  wheelRim: RouletteWheelRim
}[] = [
  {
    id: 'navy',
    label: 'Navy',
    swatch: '#1f2e54',
    gradient:
      'radial-gradient(ellipse at 50% 35%, #1f2e54 0%, #131e3a 45%, #0c1428 75%, #080e1e 100%)',
    wheelRim: {
      outer: 'rgb(34, 211, 238)',
      inner: 'rgb(8, 145, 178)',
      glow: 'rgba(165, 243, 252, 0.55)',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#1a4a2e',
    gradient:
      'radial-gradient(ellipse at 50% 35%, #1a4a2e 0%, #0f3320 45%, #0a2418 75%, #061810 100%)',
    wheelRim: {
      outer: 'rgb(52, 211, 153)',
      inner: 'rgb(5, 122, 85)',
      glow: 'rgba(167, 243, 208, 0.5)',
    },
  },
  {
    id: 'crimson',
    label: 'Crimson',
    swatch: '#4a1a1a',
    gradient:
      'radial-gradient(ellipse at 50% 35%, #4a1a1a 0%, #331010 45%, #240a0a 75%, #180606 100%)',
    wheelRim: {
      outer: 'rgb(251, 113, 133)',
      inner: 'rgb(159, 18, 57)',
      glow: 'rgba(254, 205, 211, 0.45)',
    },
  },
  {
    id: 'purple',
    label: 'Royal',
    swatch: '#2e1a4a',
    gradient:
      'radial-gradient(ellipse at 50% 35%, #2e1a4a 0%, #1e1033 45%, #140a24 75%, #0c0618 100%)',
    wheelRim: {
      outer: 'rgb(196, 181, 253)',
      inner: 'rgb(109, 40, 217)',
      glow: 'rgba(221, 214, 254, 0.5)',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    swatch: '#2a2e36',
    gradient:
      'radial-gradient(ellipse at 50% 35%, #2a2e36 0%, #1c2028 45%, #14171e 75%, #0c0e14 100%)',
    wheelRim: {
      outer: 'rgb(148, 163, 184)',
      inner: 'rgb(71, 85, 105)',
      glow: 'rgba(203, 213, 225, 0.4)',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    swatch: '#0e1a2e',
    gradient:
      'radial-gradient(ellipse at 50% 35%, #0e1a2e 0%, #080f1c 45%, #050a14 75%, #02060c 100%)',
    wheelRim: {
      outer: 'rgb(96, 165, 250)',
      inner: 'rgb(29, 78, 216)',
      glow: 'rgba(147, 197, 253, 0.5)',
    },
  },
] as const

export function getRouletteWheelRim(roomId: RouletteRoomBgId): RouletteWheelRim {
  const p = ROULETTE_ROOM_BACKGROUNDS.find((x) => x.id === roomId)
  return p?.wheelRim ?? ROULETTE_ROOM_BACKGROUNDS[0].wheelRim
}

export function isRouletteRoomBgId(value: string): value is RouletteRoomBgId {
  return ROULETTE_ROOM_BACKGROUNDS.some((p) => p.id === value)
}
