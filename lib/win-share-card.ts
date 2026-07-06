/**
 * win-share-card.ts — canvas renderer for the "Abyssal Neon" big-win share card.
 *
 * The card the owner approved: deep-sea ground, soft cyan/purple glows, a faint
 * grid, a neon rising chart, the MORBIUS.IO mark, the game name, the big amber
 * ROI %, and a "Play at morbius.io" CTA. Deliberately shows NO wallet/name and
 * NO bet amounts — only the ROI, so a win reads as impressive without exposing
 * the player or their stake.
 *
 * Drawn on a 2D canvas (not DOM) so it exports to a crisp PNG for sharing/saving
 * with no font or CSS-support surprises across mobile browsers. All geometry is
 * authored in a 1080×1350 (4:5) reference space and scaled to the target size,
 * so preview and export share one code path.
 */

export interface WinCardData {
  /** Display name of the game, e.g. "Plinko", "Crash", "Mines". */
  game: string
  /** Return on bet as a whole percent, e.g. 1240 → "+1,240%". */
  roiPct: number
}

const REF_W = 1080
const REF_H = 1350

/** Draw `text` with manual letter-spacing (robust across browsers). Returns width. */
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): number {
  let cx = x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
  return cx - spacing - x
}

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let w = 0
  for (const ch of text) w += ctx.measureText(ch).width + spacing
  return w - spacing
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/** PulseChain co-brand mark (same-origin, so it won't taint the canvas export). */
const PULSE_LOGO_SRC = '/Pulse%20Branding/Logo/favicon128.png'
let pulseLogoPromise: Promise<HTMLImageElement | null> | null = null

/**
 * Load the PulseChain logo once (cached). Resolves null on error or on the
 * server, so callers can draw the card with or without it.
 */
export function loadPulseLogo(): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!pulseLogoPromise) {
    pulseLogoPromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = PULSE_LOGO_SRC
    })
  }
  return pulseLogoPromise
}

/**
 * Render the win card into `ctx` at the given pixel size. Authored geometry is
 * in a 1080×1350 space; we scale the whole context so callers can render at any
 * resolution (small for the on-screen preview, full-res for the exported PNG).
 */
export function drawWinCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: WinCardData,
  logo?: CanvasImageSource | null,
): void {
  const s = width / REF_W
  ctx.save()
  ctx.scale(s, s)
  ctx.clearRect(0, 0, REF_W, REF_H)

  // Rounded-card clip.
  roundRectPath(ctx, 0, 0, REF_W, REF_H, 44)
  ctx.clip()

  // ── Ground: dark vertical gradient ──
  const base = ctx.createLinearGradient(0, 0, 0, REF_H)
  base.addColorStop(0, '#060d15')
  base.addColorStop(1, '#03080e')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, REF_W, REF_H)

  // ── Soft glows (reduced opacity, per the approved refinement) ──
  const cyanGlow = ctx.createRadialGradient(540, -160, 0, 540, -160, 720)
  cyanGlow.addColorStop(0, 'rgba(34,211,238,0.11)')
  cyanGlow.addColorStop(1, 'rgba(34,211,238,0)')
  ctx.fillStyle = cyanGlow
  ctx.fillRect(0, 0, REF_W, REF_H)

  const purpleGlow = ctx.createRadialGradient(930, 1470, 0, 930, 1470, 640)
  purpleGlow.addColorStop(0, 'rgba(124,92,255,0.10)')
  purpleGlow.addColorStop(1, 'rgba(124,92,255,0)')
  ctx.fillStyle = purpleGlow
  ctx.fillRect(0, 0, REF_W, REF_H)

  // ── Faint grid (lower ~58%, fading in) ──
  ctx.save()
  ctx.strokeStyle = 'rgba(34,211,238,0.035)'
  ctx.lineWidth = 1.5
  const step = REF_W * 0.08
  for (let x = step; x < REF_W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, REF_H * 0.42); ctx.lineTo(x, REF_H); ctx.stroke()
  }
  for (let y = REF_H * 0.42; y < REF_H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(REF_W, y); ctx.stroke()
  }
  ctx.restore()

  // ── Rising chart: area fill + neon line + amber endpoint ──
  const pts: [number, number][] = [
    [0, 1166], [216, 1080], [410, 1123], [605, 842], [778, 886], [950, 475], [1080, 259],
  ]
  const fill = ctx.createLinearGradient(0, 300, 0, REF_H)
  fill.addColorStop(0, 'rgba(34,211,238,0.24)')
  fill.addColorStop(1, 'rgba(34,211,238,0)')
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y)
  ctx.lineTo(REF_W, REF_H)
  ctx.lineTo(0, REF_H)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = '#39e6f7'
  ctx.lineWidth = 15
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y)
  ctx.stroke()

  ctx.fillStyle = '#ffd166'
  ctx.beginPath()
  ctx.arc(pts[pts.length - 1][0], pts[pts.length - 1][1], 16, 0, Math.PI * 2)
  ctx.fill()

  const padX = 86
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // ── Brand: ● MORBIUS.IO ──
  ctx.fillStyle = '#6fe3f2'
  ctx.save()
  ctx.shadowColor = 'rgba(34,211,238,0.7)'
  ctx.shadowBlur = 22
  ctx.beginPath(); ctx.arc(padX + 12, 142, 12, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  ctx.font = `600 34px ${MONO}`
  tracked(ctx, 'MORBIUS.IO', padX + 42, 154, 11)

  // ── PulseChain co-brand (top-right): "PULSECHAIN" + hexagon logo ──
  const logoSize = 52
  const logoX = REF_W - padX - logoSize
  const logoY = 116
  if (logo) {
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize)
  }
  ctx.fillStyle = 'rgba(207,233,242,0.82)'
  ctx.font = `600 28px ${MONO}`
  const pcSpacing = 5
  const pcWidth = trackedWidth(ctx, 'PULSECHAIN', pcSpacing)
  tracked(ctx, 'PULSECHAIN', logoX - 16 - pcWidth, logoY + logoSize / 2 + 10, pcSpacing)

  // ── Game name ──
  ctx.fillStyle = 'rgba(207,233,242,0.85)'
  ctx.font = `700 48px ${SANS}`
  tracked(ctx, data.game.toUpperCase(), padX, 905, 14)

  // ── ROI (big amber, with % smaller) ──
  // Auto-fit: shrink the number until the whole "+N,NNN%" fits the card width,
  // so a huge multiplier can't push the % off the edge.
  const roiRounded = Math.round(data.roiPct)
  const roiMain = `${roiRounded < 0 ? '−' : '+'}${Math.abs(roiRounded).toLocaleString('en-US')}`
  const gap = 16
  const avail = REF_W - padX * 2
  let roiFont = 250
  let pctFont = 96
  ctx.font = `900 ${roiFont}px ${SANS}`
  let mainW = ctx.measureText(roiMain).width
  ctx.font = `900 ${pctFont}px ${SANS}`
  let pctW = ctx.measureText('%').width
  const total = mainW + gap + pctW
  if (total > avail) {
    const k = avail / total
    roiFont *= k
    pctFont *= k
    ctx.font = `900 ${roiFont}px ${SANS}`
    mainW = ctx.measureText(roiMain).width
  }
  const roiBaseline = 1170
  ctx.save()
  ctx.fillStyle = '#ffd166'
  ctx.shadowColor = 'rgba(255,196,64,0.30)'
  ctx.shadowBlur = 55
  ctx.font = `900 ${roiFont}px ${SANS}`
  ctx.fillText(roiMain, padX, roiBaseline)
  ctx.font = `900 ${pctFont}px ${SANS}`
  ctx.fillText('%', padX + mainW + gap, roiBaseline - roiFont * 0.16)
  ctx.restore()

  // ── Label ──
  ctx.fillStyle = '#7fb9c9'
  ctx.font = `500 34px ${MONO}`
  tracked(ctx, 'RETURN ON BET', padX, 1238, 10)

  // ── Footer CTA ──
  ctx.fillStyle = '#5f8a99'
  ctx.font = `500 33px ${MONO}`
  tracked(ctx, 'PLAY AT MORBIUS.IO', padX, 1298, 8)

  ctx.restore()
}

/** Render the card to a PNG Blob at full share resolution (1080×1350). */
export async function renderWinCardBlob(data: WinCardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = REF_W
  canvas.height = REF_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const logo = await loadPulseLogo()
  drawWinCard(ctx, REF_W, REF_H, data, logo)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

export const WIN_CARD_ASPECT = REF_W / REF_H
export const WIN_CARD_REF = { width: REF_W, height: REF_H }

/** ROI% from a bet/payout pair (payout = multiplier × bet). Never below 0. */
export function roiPctFromBet(bet: number, payout: number): number {
  if (!Number.isFinite(bet) || bet <= 0) return 0
  return Math.max(0, ((payout - bet) / bet) * 100)
}
