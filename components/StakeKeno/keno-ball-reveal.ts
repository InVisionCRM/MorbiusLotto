/**
 * keno-ball-reveal.ts — real-keno "ball draw" reveal (the "Drop" style).
 *
 * For each drawn number a glossy ball pops in the centre of the board, holds a
 * beat, then falls straight down to its tile (gravity ease) and the tile lights
 * up. Balls draw one at a time. The motion is imperative (Web Animations API on
 * a DOM overlay) because it needs live tile positions; React just owns which
 * tiles are revealed (driven by onLand) and the final settle (onDone).
 *
 * Pacing is the "Slow" preset chosen in the reveal lab (~1.05s/ball, ~10s for a
 * full 10-number draw). Respects prefers-reduced-motion (skips the balls and
 * reveals tiles on a simple timer).
 */

export interface KenoRevealHandle {
  cancel(): void
}

interface KenoRevealArgs {
  /** The element whose box equals the tile grid (tiles are queried inside it). */
  board: HTMLElement
  /** Absolute overlay (inset-0 of the board wrapper) the balls are drawn into. */
  stage: HTMLElement
  /** Numbers to reveal, in draw order. */
  drawn: number[]
  /** Called as each number's ball lands — light that tile. */
  onLand?: (n: number) => void
  /** Called once every ball has landed. */
  onDone?: () => void
}

// "Slow" preset (ms): pop-in, hold at centre, fall, gap before next ball.
const T = { pop: 170, hold: 230, travel: 520, gap: 130 }

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

export function playKenoDropReveal({ board, stage, drawn, onLand, onDone }: KenoRevealArgs): KenoRevealHandle {
  let killed = false
  const timers: ReturnType<typeof setTimeout>[] = []

  function finish() {
    if (!killed) onDone?.()
  }

  // Reduced motion: no flying balls — just reveal each tile on the same cadence.
  if (prefersReducedMotion()) {
    const per = T.pop + T.hold + T.travel + T.gap
    drawn.forEach((n, i) => {
      const t = setTimeout(() => {
        if (killed) return
        onLand?.(n)
        if (i === drawn.length - 1) finish()
      }, per * (i + 1))
      timers.push(t)
    })
    return { cancel() { killed = true; timers.forEach(clearTimeout) } }
  }

  function tileRect(n: number): DOMRect | null {
    const el = board.querySelector<HTMLElement>(`[data-keno-n="${n}"]`)
    return el ? el.getBoundingClientRect() : null
  }

  function step(i: number) {
    if (killed) return
    if (i >= drawn.length) {
      finish()
      return
    }
    const n = drawn[i]
    const br = board.getBoundingClientRect()
    const size = Math.max(54, Math.min(br.width * 0.22, 108))

    const ball = document.createElement('div')
    ball.className = 'keno-ball'
    ball.style.width = `${size}px`
    ball.style.height = `${size}px`
    ball.style.fontSize = `${Math.round(size * 0.42)}px`
    ball.textContent = String(n)
    stage.appendChild(ball)

    // Pop in at centre.
    ball.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      ],
      { duration: T.pop, easing: 'cubic-bezier(.2,1.5,.4,1)', fill: 'forwards' },
    )

    const t1 = setTimeout(() => {
      if (killed) {
        ball.remove()
        return
      }
      const te = tileRect(n)
      const land = () => {
        if (killed) {
          ball.remove()
          return
        }
        onLand?.(n)
        ball.remove()
        const t2 = setTimeout(() => step(i + 1), T.gap)
        timers.push(t2)
      }
      if (!te) {
        land()
        return
      }
      const tx = te.left - br.left + te.width / 2
      const ty = te.top - br.top + te.height / 2
      const dx = tx - br.width / 2
      const dy = ty - br.height / 2
      const scale = te.width / size
      const anim = ball.animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)' },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale.toFixed(3)})` },
        ],
        { duration: T.travel, easing: 'cubic-bezier(.5,0,.75,.3)', fill: 'forwards' }, // accelerate like gravity
      )
      anim.onfinish = land
    }, T.pop + T.hold)
    timers.push(t1)
  }

  step(0)

  return {
    cancel() {
      killed = true
      timers.forEach(clearTimeout)
      stage.replaceChildren()
    },
  }
}
