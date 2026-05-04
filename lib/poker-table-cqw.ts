/**
 * `cqw` clamps relative to the `PokerTable` root, which sets `container-type: inline-size`.
 * Keeps chips, cards, and tags proportional to the felt instead of the browser viewport (`vw`).
 */
export const POKER_UI_CQW = {
  betChip: 'clamp(34px, 2.65cqw, 44px)',
  chatBubbleMax: 'min(160px, 32cqw)',
  chatBubbleFont: 'clamp(9px, 1.45cqw, 10px)',
  phraseOverlayMax: 'min(180px, 40cqw)',
  heroCardAreaW: 'clamp(84px, 6.7cqw, 110px)',
  heroCardAreaH: 'clamp(72px, 6.1cqw, 96px)',
  heroCardInnerW: 'clamp(54px, 4.35cqw, 70px)',
  heroCardInnerH: 'clamp(70px, 5.85cqw, 90px)',
  /** Nudge the hero hole-card cluster left (relative to centered seat column). */
  heroCardsLayoutShiftX: 'clamp(-90px, -1.55cqw, -90px)',
  heroCardInnerLeft: 'clamp(22px, 1.85cqw, 30px)',
  peekCardInnerW: 'clamp(38px, 3cqw, 48px)',
  peekCardInnerH: 'clamp(48px, 4.15cqw, 62px)',
  peekCardInnerLeft: 'clamp(14px, 1.2cqw, 20px)',
  flyoutRowW: 'clamp(58px, 4.6cqw, 74px)',
  flyoutRowH: 'clamp(50px, 4cqw, 66px)',
  flyoutCardW: 'clamp(38px, 3cqw, 48px)',
  flyoutCardH: 'clamp(48px, 4.15cqw, 62px)',
  flyoutCardLeft: 'clamp(14px, 1.2cqw, 20px)',
  playerTagName: 'clamp(11px, 1.45cqw, 10px)',
  playerTagChips: 'clamp(9px, 1.35cqw, 14px)',
  actionRowFont: 'clamp(8px, 1.25cqw, 10px)',
  actionPillFont: 'clamp(8px, 1.15cqw, 10px)',
} as const;
