import type { ReactNode } from 'react'

/**
 * Per-game generated artwork for the lobby tiles.
 *
 * Each game has its own flat, colorful SVG scene (Stake-style) that fills the
 * tile as a full-bleed background. Everything is code-generated — no raster
 * assets — so the art is crisp at any size and easy to tweak. Gradient ids are
 * prefixed per game to avoid collisions when all tiles render on one page.
 */

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 150"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {children}
      {/* subtle top-down gloss, painted last */}
      <rect width="120" height="150" fill="url(#sheen)" />
    </svg>
  )
}

/** Soft top-down sheen gradient (definition only; Frame paints the overlay). */
function Sheen() {
  return (
    <radialGradient id="sheen" cx="50%" cy="0%" r="90%">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
      <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
    </radialGradient>
  )
}

function Card({
  x,
  y,
  r = 0,
  w = 34,
  h = 48,
  fill = '#ffffff',
  children,
}: {
  x: number
  y: number
  r?: number
  w?: number
  h?: number
  fill?: string
  children?: ReactNode
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={5}
        fill={fill}
        stroke="rgba(2,6,23,0.18)"
        strokeWidth={1}
      />
      {children}
    </g>
  )
}

function Die({
  x,
  y,
  r = 0,
  s = 34,
  fill = '#ffffff',
  pips,
}: {
  x: number
  y: number
  r?: number
  s?: number
  fill?: string
  pips: [number, number][]
}) {
  const u = s / 3
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.22} fill={fill} stroke="rgba(2,6,23,0.16)" />
      {pips.map(([px, py], i) => (
        <circle key={i} cx={px * u} cy={py * u} r={s * 0.095} fill="#1f2937" />
      ))}
    </g>
  )
}

function Chip({ x, y, s = 18, fill = '#ef4444' }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={s} fill={fill} />
      <circle r={s} fill="none" stroke="#ffffff" strokeWidth={s * 0.22} strokeDasharray={`${s * 0.52} ${s * 0.45}`} />
      <circle r={s * 0.58} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={1.6} />
    </g>
  )
}

function Diamond({ x, y, s = 16, fill = '#22d3ee', glow }: { x: number; y: number; s?: number; fill?: string; glow?: boolean }) {
  return (
    <path
      d={`M ${x} ${y - s} L ${x + s * 0.78} ${y} L ${x} ${y + s} L ${x - s * 0.78} ${y} Z`}
      fill={fill}
      style={glow ? { filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.9))' } : undefined}
    />
  )
}

const Spade = ({ x, y, s = 9, fill = '#0f172a' }: { x: number; y: number; s?: number; fill?: string }) => (
  <g transform={`translate(${x} ${y})`} fill={fill}>
    <path d={`M0 ${-s} C ${s} ${-s * 0.1}, ${s * 0.7} ${s * 0.6}, 0 ${s * 0.45} C ${-s * 0.7} ${s * 0.6}, ${-s} ${-s * 0.1}, 0 ${-s} Z`} />
    <rect x={-1.3} y={s * 0.2} width={2.6} height={s * 0.55} />
    <path d={`M ${-s * 0.45} ${s * 0.78} h ${s * 0.9} l ${-s * 0.45} ${-s * 0.35} Z`} />
  </g>
)

const Heart = ({ x, y, s = 9, fill = '#ef4444' }: { x: number; y: number; s?: number; fill?: string }) => (
  <path
    transform={`translate(${x} ${y})`}
    d={`M0 ${s * 0.7} C ${-s * 1.1} ${-s * 0.2}, ${-s * 0.4} ${-s}, 0 ${-s * 0.35} C ${s * 0.4} ${-s}, ${s * 1.1} ${-s * 0.2}, 0 ${s * 0.7} Z`}
    fill={fill}
  />
)

function wedge(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
}

/* ------------------------------------------------------------------ games */

function BlackjackArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="bj" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
        <Sheen />
      </defs>
      <ellipse cx="60" cy="120" rx="50" ry="14" fill="#000" opacity="0.16" />
      <Card x={50} y={74} r={-13}>
        <Spade x={0} y={-2} s={11} />
      </Card>
      <Card x={72} y={70} r={11} fill="#fef2f2">
        <text x={-11} y={-9} fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#dc2626">
          A
        </text>
        <Heart x={4} y={6} s={9} />
      </Card>
      <Chip x={40} y={112} s={13} fill="#0ea5e9" />
      <Chip x={58} y={116} s={13} fill="#f59e0b" />
    </Frame>
  )
}

function PlinkoArt() {
  const rows = [3, 4, 5, 6]
  return (
    <Frame>
      <defs>
        <linearGradient id="plk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b0f86" />
        </linearGradient>
        <Sheen />
      </defs>
      {rows.map((count, ri) =>
        Array.from({ length: count }).map((_, ci) => {
          const spacing = 16
          const y = 58 + ri * 16
          const x = 60 - ((count - 1) * spacing) / 2 + ci * spacing
          return <circle key={`${ri}-${ci}`} cx={x} cy={y} r={2.6} fill="#ffffff" opacity={0.85} />
        }),
      )}
      <circle cx="60" cy="34" r="8" fill="#f472b6" style={{ filter: 'drop-shadow(0 0 7px rgba(244,114,182,0.9))' }} />
      <rect x="34" y="128" width="14" height="12" rx="2" fill="#22d3ee" opacity="0.9" />
      <rect x="53" y="128" width="14" height="12" rx="2" fill="#a78bfa" opacity="0.9" />
      <rect x="72" y="128" width="14" height="12" rx="2" fill="#22d3ee" opacity="0.9" />
    </Frame>
  )
}

function MinesArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="mns" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5b7" />
          <stop offset="100%" stopColor="#0b4a5a" />
        </linearGradient>
        <Sheen />
      </defs>
      <g opacity="0.25" stroke="#ffffff" strokeWidth="1">
        {Array.from({ length: 3 }).map((_, r) =>
          Array.from({ length: 3 }).map((_, c) => (
            <rect key={`${r}-${c}`} x={24 + c * 26} y={26 + r * 26} width="22" height="22" rx="4" fill="none" />
          )),
        )}
      </g>
      <circle cx="60" cy="80" r="26" fill="#3b4861" />
      <circle cx="51" cy="71" r="7" fill="#8593ab" />
      <path d="M78 58 q10 -6 12 -16" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g transform="translate(90 40)" fill="#f59e0b">
        <path d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" />
      </g>
      <Diamond x={36} y={118} s={11} fill="#34d399" />
    </Frame>
  )
}

function KenoArt() {
  const hi = new Set(['0-1', '1-3', '2-0', '2-2'])
  return (
    <Frame>
      <defs>
        <linearGradient id="kno" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#172a6b" />
        </linearGradient>
        <Sheen />
      </defs>
      {Array.from({ length: 3 }).map((_, r) =>
        Array.from({ length: 4 }).map((_, c) => {
          const on = hi.has(`${r}-${c}`)
          const x = 20 + c * 22
          const y = 44 + r * 22
          return (
            <g key={`${r}-${c}`}>
              <rect x={x} y={y} width="17" height="17" rx="4" fill={on ? '#fde047' : '#1e3a8a'} stroke={on ? '#fef9c3' : '#3b82f6'} strokeWidth="1.4" />
              {on && (
                <text x={x + 8.5} y={y + 12.5} textAnchor="middle" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#1e3a8a">
                  {[7, 3, 9, 1][r + c] ?? 5}
                </text>
              )}
            </g>
          )
        }),
      )}
    </Frame>
  )
}

function PokerArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="pkr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#0a3d20" />
        </linearGradient>
        <Sheen />
      </defs>
      <ellipse cx="60" cy="66" rx="52" ry="30" fill="#1f7a45" stroke="#facc15" strokeWidth="1.5" opacity="0.7" />
      <Card x={44} y={64} r={-8} w={26} h={38}>
        <Spade x={0} y={0} s={8} />
      </Card>
      <Card x={60} y={61} w={26} h={38}>
        <Heart x={0} y={1} s={7} />
      </Card>
      <Card x={76} y={64} r={8} w={26} h={38}>
        <Spade x={0} y={0} s={8} fill="#0f172a" />
      </Card>
      <Chip x={42} y={118} s={14} fill="#dc2626" />
      <Chip x={60} y={122} s={14} fill="#0f172a" />
      <Chip x={78} y={118} s={14} fill="#2563eb" />
    </Frame>
  )
}

function DiceArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="dce" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
        <Sheen />
      </defs>
      <Die x={46} y={66} r={-12} s={42} pips={[[-1, -1], [1, 1], [0, 0], [-1, 1], [1, -1]]} />
      <Die x={80} y={92} r={10} s={36} pips={[[-1, -1], [1, -1], [-1, 1], [1, 1]]} />
    </Frame>
  )
}

function CrashArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="crh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#9a3412" />
        </linearGradient>
        <Sheen />
      </defs>
      <path d="M14 124 Q 48 120 70 88 T 104 28" fill="none" stroke="#fff7ed" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
      <path d="M14 124 Q 48 120 70 88 T 104 28 L 104 128 L 14 128 Z" fill="#ffffff" opacity="0.1" />
      <g transform="translate(104 28) rotate(38)">
        <path d="M0 -11 C5 -6 5 4 0 11 C-5 4 -5 -6 0 -11 Z" fill="#ffffff" />
        <path d="M0 11 L-5 18 L0 14 L5 18 Z" fill="#f97316" />
        <circle cx="0" cy="-2" r="3" fill="#0ea5e9" />
      </g>
      <text x="26" y="46" fontFamily="Arial" fontSize="15" fontWeight="800" fill="#ffffff" opacity="0.95">
        2.4×
      </text>
    </Frame>
  )
}

function ChickenArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="chk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <Sheen />
      </defs>
      <ellipse cx="60" cy="120" rx="34" ry="9" fill="#000" opacity="0.15" />
      <ellipse cx="60" cy="84" rx="30" ry="32" fill="#ffffff" />
      <circle cx="60" cy="52" r="19" fill="#ffffff" />
      <path d="M52 36 q4 -12 9 -2 q5 -10 8 2 z" fill="#ef4444" />
      <circle cx="66" cy="50" r="3.4" fill="#0f172a" />
      <path d="M76 54 l12 4 l-12 4 z" fill="#f59e0b" />
      <path d="M58 64 q-2 6 -7 6" stroke="#ef4444" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="40" cy="92" rx="9" ry="14" fill="#f1f5f9" transform="rotate(-18 40 92)" />
      <rect x="50" y="112" width="4" height="12" rx="1.5" fill="#f59e0b" />
      <rect x="66" y="112" width="4" height="12" rx="1.5" fill="#f59e0b" />
    </Frame>
  )
}

function LimboArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="lmb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#2a2270" />
        </linearGradient>
        <Sheen />
      </defs>
      <rect x="16" y="52" width="88" height="7" rx="3.5" fill="#22d3ee" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.9))' }} />
      <g fill="#a5b4fc">
        <path d="M44 74 l16 0 l-8 9 z" />
        <path d="M44 88 l16 0 l-8 9 z" opacity="0.75" />
        <path d="M44 102 l16 0 l-8 9 z" opacity="0.5" />
      </g>
      <text x="60" y="134" textAnchor="middle" fontFamily="Arial" fontSize="17" fontWeight="800" fill="#ffffff">
        1.98×
      </text>
    </Frame>
  )
}

function TowersArt() {
  const blocks = [
    { w: 54, y: 110, fill: '#3b82f6' },
    { w: 44, y: 92, fill: '#2563eb' },
    { w: 34, y: 74, fill: '#1d4ed8' },
    { w: 24, y: 56, fill: '#1e40af' },
  ]
  return (
    <Frame>
      <defs>
        <linearGradient id="twr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <Sheen />
      </defs>
      {blocks.map((b, i) => (
        <rect key={i} x={60 - b.w / 2} y={b.y} width={b.w} height={16} rx={3} fill={b.fill} stroke="#bfdbfe" strokeWidth="1.2" />
      ))}
      <Diamond x={60} y={42} s={12} fill="#fde047" glow />
    </Frame>
  )
}

function RouletteArt() {
  const n = 18
  const colors = ['#dc2626', '#0f172a']
  return (
    <Frame>
      <defs>
        <linearGradient id="rlt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#065f46" />
          <stop offset="100%" stopColor="#03291f" />
        </linearGradient>
        <Sheen />
      </defs>
      <circle cx="60" cy="76" r="40" fill="#7c2d12" />
      {Array.from({ length: n }).map((_, i) => (
        <path key={i} d={wedge(60, 76, 38, (360 / n) * i, (360 / n) * (i + 1))} fill={colors[i % 2]} stroke="#fbbf24" strokeWidth="0.5" />
      ))}
      <circle cx="60" cy="76" r="17" fill="#0f172a" stroke="#fbbf24" strokeWidth="2" />
      <circle cx="60" cy="76" r="8" fill="#facc15" />
      <circle cx="60" cy="40" r="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
    </Frame>
  )
}

function BaccaratArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="bcr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <Sheen />
      </defs>
      <Card x={50} y={72} r={-12} fill="#fffbeb">
        <text x={-11} y={-9} fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#b45309">
          9
        </text>
        <Diamond x={2} y={6} s={8} fill="#b45309" />
      </Card>
      <Card x={72} y={68} r={12} fill="#fffbeb">
        <Diamond x={0} y={0} s={11} fill="#0f172a" />
      </Card>
      <Diamond x={60} y={120} s={13} fill="#fbbf24" glow />
    </Frame>
  )
}

function HiloArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="hlo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
        <Sheen />
      </defs>
      <path d="M60 18 l11 14 h-22 z" fill="#bbf7d0" />
      <Card x={60} y={76} w={42} h={58}>
        <text x={-15} y={-13} fontFamily="Georgia, serif" fontSize="15" fontWeight="700" fill="#0f172a">
          K
        </text>
        <Spade x={0} y={4} s={12} />
      </Card>
      <path d="M60 138 l-11 -14 h22 z" fill="#fca5a5" />
    </Frame>
  )
}

function WheelArt() {
  const segs = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
  return (
    <Frame>
      <defs>
        <linearGradient id="whl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f2937" />
          <stop offset="100%" stopColor="#0b1220" />
        </linearGradient>
        <Sheen />
      </defs>
      <circle cx="60" cy="80" r="42" fill="#0f172a" />
      {segs.map((c, i) => (
        <path key={i} d={wedge(60, 80, 40, (360 / segs.length) * i, (360 / segs.length) * (i + 1))} fill={c} />
      ))}
      <circle cx="60" cy="80" r="11" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
      <path d="M60 30 l-6 12 h12 z" fill="#ffffff" />
    </Frame>
  )
}

function VideoPokerArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="vpk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        <Sheen />
      </defs>
      <rect x="14" y="44" width="92" height="62" rx="7" fill="#0b1220" stroke="#38bdf8" strokeWidth="2" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={20 + i * 22} y={56} width="17" height="38" rx="3" fill="#ffffff" />
          {i % 2 === 0 ? <Spade x={20 + i * 22 + 8.5} y={75} s={6} /> : <Heart x={20 + i * 22 + 8.5} y={75} s={5} />}
        </g>
      ))}
      <rect x="40" y="116" width="40" height="8" rx="4" fill="#38bdf8" opacity="0.7" />
    </Frame>
  )
}

function DiceX2Art() {
  return (
    <Frame>
      <defs>
        <linearGradient id="dx2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b0f86" />
        </linearGradient>
        <Sheen />
      </defs>
      <Die x={46} y={62} r={-10} s={38} pips={[[-1, -1], [1, 1], [0, 0]]} />
      <Die x={78} y={84} r={12} s={32} pips={[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]} fill="#fde68a" />
      <g transform="translate(60 122)">
        <rect x="-20" y="-12" width="40" height="24" rx="7" fill="#22d3ee" />
        <text x="0" y="6" textAnchor="middle" fontFamily="Arial" fontSize="16" fontWeight="800" fill="#06283a">
          ×2
        </text>
      </g>
    </Frame>
  )
}

function CrapsArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="crp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
        <Sheen />
      </defs>
      <path d="M10 104 q50 -24 100 0" fill="none" stroke="#fca5a5" strokeWidth="2" opacity="0.7" />
      <Die x={44} y={70} r={-18} s={36} pips={[[0, -1], [0, 0], [0, 1]]} fill="#fee2e2" />
      <Die x={80} y={84} r={16} s={32} pips={[[-1, -1], [1, 1], [-1, 1], [1, -1]]} fill="#ffffff" />
      <text x="60" y="132" textAnchor="middle" fontFamily="Georgia, serif" fontSize="16" fontWeight="800" fill="#fde68a">
        7
      </text>
    </Frame>
  )
}

function BlackjackMultiArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="bjm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#0a3d20" />
        </linearGradient>
        <Sheen />
      </defs>
      <path d="M8 50 a52 30 0 0 0 104 0" fill="#1f7a45" stroke="#facc15" strokeWidth="1.5" opacity="0.7" />
      <Card x={60} y={58} w={26} h={36}>
        <Spade x={0} y={0} s={8} />
      </Card>
      <Card x={40} y={60} r={-10} w={24} h={34} fill="#fef2f2">
        <Heart x={0} y={0} s={7} />
      </Card>
      <Card x={80} y={60} r={10} w={24} h={34}>
        <Spade x={0} y={0} s={7} />
      </Card>
      <g fill="#bbf7d0">
        <circle cx="34" cy="112" r="9" />
        <path d="M22 132 a12 12 0 0 1 24 0 z" />
        <circle cx="60" cy="108" r="10" />
        <path d="M47 130 a13 13 0 0 1 26 0 z" />
        <circle cx="86" cy="112" r="9" />
        <path d="M74 132 a12 12 0 0 1 24 0 z" />
      </g>
    </Frame>
  )
}

function LotteryArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="lto" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <Sheen />
      </defs>
      <g transform="translate(60 66) rotate(-8)">
        <rect x="-40" y="-22" width="80" height="44" rx="6" fill="#fffbeb" stroke="#92400e" strokeWidth="1.5" />
        <line x1="-12" y1="-22" x2="-12" y2="22" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x="-26" y="6" textAnchor="middle" fontFamily="Georgia, serif" fontSize="18" fontWeight="800" fill="#b45309">
          $
        </text>
        <text x="14" y="3" textAnchor="middle" fontFamily="Arial" fontSize="8" fontWeight="700" fill="#92400e">
          LOTTO
        </text>
      </g>
      {[
        { x: 34, c: '#ef4444', n: 7 },
        { x: 60, c: '#2563eb', n: 22 },
        { x: 86, c: '#16a34a', n: 41 },
      ].map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={120} r="12" fill={b.c} />
          <circle cx={b.x - 3} cy={116} r="3.5" fill="#ffffff" opacity="0.5" />
          <text x={b.x} y={124} textAnchor="middle" fontFamily="Arial" fontSize="9" fontWeight="700" fill="#ffffff">
            {b.n}
          </text>
        </g>
      ))}
    </Frame>
  )
}

function MonteArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="mnt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0f5f57" />
        </linearGradient>
        <Sheen />
      </defs>
      <g fill="#0e7490" stroke="#5eead4" strokeWidth="1.4">
        <rect x="14" y="72" width="30" height="44" rx="4" transform="rotate(-6 29 94)" />
        <rect x="78" y="72" width="30" height="44" rx="4" transform="rotate(6 93 94)" />
      </g>
      <g transform="translate(60 60) rotate(-3)">
        <rect x="-16" y="-24" width="32" height="46" rx="4" fill="#0e7490" stroke="#5eead4" strokeWidth="1.4" />
      </g>
      <Diamond x={60} y={108} s={15} fill="#22d3ee" glow />
    </Frame>
  )
}

function ThreeCardPokerArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="tcp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#062a36" />
        </linearGradient>
        <Sheen />
      </defs>
      <ellipse cx="60" cy="120" rx="48" ry="13" fill="#000" opacity="0.16" />
      {/* a fanned three-card hand */}
      <Card x={42} y={70} r={-16} w={30} h={42}>
        <Spade x={0} y={0} s={9} />
      </Card>
      <Card x={60} y={64} w={30} h={42} fill="#fef2f2">
        <text x={-11} y={-9} fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#dc2626">A</text>
        <Heart x={3} y={6} s={8} />
      </Card>
      <Card x={78} y={70} r={16} w={30} h={42}>
        <text x={-11} y={-9} fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#0f172a">K</text>
        <Spade x={3} y={6} s={8} />
      </Card>
      <text x="60" y="128" textAnchor="middle" fontFamily="Arial" fontSize="11" fontWeight="800" fill="#fde68a" opacity="0.95">3</text>
    </Frame>
  )
}

function GreedDiceArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="grd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#06283a" />
        </linearGradient>
        <Sheen />
      </defs>
      <ellipse cx="60" cy="120" rx="44" ry="12" fill="#000" opacity="0.16" />
      {/* scoring die — cyan-glowing */}
      <g style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.85))' }}>
        <Die x={44} y={64} r={-12} s={42} fill="#0b1c28" pips={[[0, 0]]} />
      </g>
      <Die x={80} y={90} r={11} s={34} fill="#0b1c28" pips={[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]} />
      <text x="60" y="36" textAnchor="middle" fontFamily="Arial" fontSize="13" fontWeight="800" fill="#fde68a" opacity="0.95">
        +1k
      </text>
      <Diamond x={60} y={120} s={10} fill="#22d3ee" glow />
    </Frame>
  )
}

function CipherArt() {
  const cols = ['#22d3ee', '#f59e0b', '#fb7185', '#34d399']
  return (
    <Frame>
      <defs>
        <linearGradient id="cph" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#062a36" />
        </linearGradient>
        <Sheen />
      </defs>
      {/* sealed code row (top, hidden pegs) */}
      {Array.from({ length: 4 }).map((_, i) => (
        <circle key={`s${i}`} cx={33 + i * 18} cy={34} r={7.5} fill="#0a1a24" stroke="#22d3ee" strokeOpacity={0.35} strokeWidth={1.5} />
      ))}
      <text x="60" y="38" textAnchor="middle" fontFamily="monospace" fontSize="9" fontWeight="700" fill="#64748b">????</text>
      {/* two solved guess rows of colour pegs */}
      {[64, 86].map((y, r) =>
        Array.from({ length: 4 }).map((_, i) => (
          <circle key={`g${r}-${i}`} cx={33 + i * 18} cy={y} r={7.5} fill={cols[(i + r) % 4]} />
        )),
      )}
      {/* feedback pegs: exact (filled) + partial (ring) */}
      <circle cx="104" cy="60" r="2.6" fill="#22d3ee" />
      <circle cx="104" cy="68" r="2.6" fill="none" stroke="#94a3b8" strokeWidth="1.4" />
      {/* lock glyph anchoring the bottom */}
      <g transform="translate(60 122)">
        <rect x={-13} y={-4} width={26} height={20} rx={4} fill="#243140" stroke="url(#cph)" strokeWidth={2} />
        <path d="M -7 -4 v -6 a 7 7 0 0 1 14 0 v 6" fill="none" stroke="#22d3ee" strokeWidth={2.4} />
        <circle cx={0} cy={5} r={2.6} fill="#22d3ee" />
      </g>
    </Frame>
  )
}

function FirewalkArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="fwk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
        <Sheen />
      </defs>
      {/* bed of coals */}
      <rect x="10" y="120" width="100" height="14" rx="4" fill="url(#fwk)" opacity="0.9" />
      <g fill="#f59e0b" opacity="0.85">
        <circle cx="22" cy="127" r="2.4" /><circle cx="40" cy="129" r="2" />
        <circle cx="60" cy="126" r="2.6" /><circle cx="80" cy="129" r="2" />
        <circle cx="98" cy="127" r="2.3" />
      </g>
      {/* stepping stones over the coals */}
      <rect x="26" y="92" width="20" height="16" rx="4" fill="#46566a" />
      <rect x="52" y="84" width="20" height="16" rx="4" fill="#22d3ee" opacity="0.9" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.8))' }} />
      <rect x="78" y="96" width="20" height="16" rx="4" fill="#3a4654" transform="rotate(10 88 104)" opacity="0.7" />
      {/* embers */}
      <circle cx="48" cy="70" r="2" fill="#fb923c" opacity="0.9" />
      <circle cx="68" cy="58" r="1.6" fill="#fbbf24" opacity="0.8" />
      <circle cx="36" cy="60" r="1.4" fill="#fb923c" opacity="0.7" />
    </Frame>
  )
}

function HeistArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="hst" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0b4a5a" />
        </linearGradient>
        <Sheen />
      </defs>
      {/* vault door */}
      <rect x="34" y="46" width="52" height="64" rx="8" fill="#243140" stroke="#3b4a5e" strokeWidth="2" />
      <circle cx="60" cy="78" r="20" fill="none" stroke="url(#hst)" strokeWidth="4" />
      <circle cx="60" cy="78" r="5" fill="#22d3ee" />
      <line x1="60" y1="58" x2="60" y2="98" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
      <line x1="40" y1="78" x2="80" y2="78" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
      {/* alarm laser */}
      <line x1="20" y1="34" x2="100" y2="40" stroke="#fb7185" strokeWidth="1.5" opacity="0.6" />
      <Diamond x={96} y={120} s={11} fill="#f59e0b" glow />
    </Frame>
  )
}

function PachinkoArt() {
  const rows = [3, 4, 5, 6]
  return (
    <Frame>
      <defs>
        <linearGradient id="pch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0891b2" />
          <stop offset="100%" stopColor="#083344" />
        </linearGradient>
        <Sheen />
      </defs>
      {rows.map((count, ri) =>
        Array.from({ length: count }).map((_, ci) => {
          const spacing = 15
          const y = 50 + ri * 15
          const x = 60 - ((count - 1) * spacing) / 2 + ci * spacing
          return <circle key={`${ri}-${ci}`} cx={x} cy={y} r={2.4} fill="#7dd3fc" opacity={0.8} />
        }),
      )}
      <circle cx="60" cy="30" r="7" fill="#a5f3fc" style={{ filter: 'drop-shadow(0 0 7px rgba(34,211,238,0.9))' }} />
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          x={16 + i * 10}
          y={128}
          width={8}
          height={14}
          rx={2}
          fill={i === 4 ? '#f59e0b' : i <= 1 || i >= 7 ? '#22d3ee' : '#334155'}
          opacity={0.9}
        />
      ))}
    </Frame>
  )
}

function CascadeArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="csc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#06283a" />
        </linearGradient>
        <Sheen />
      </defs>
      {/* a small cluster of neon gems tumbling */}
      <circle cx="38" cy="52" r="11" fill="#48C39A" />
      <circle cx="64" cy="46" r="11" fill="#48C39A" />
      <circle cx="50" cy="72" r="11" fill="#48C39A" />
      <path d="M84 60 l10 16 -20 0 z" fill="#9B8CF0" />
      <path d="M40 100 l8 -14 8 14 -8 14 z" fill="#E2658C" />
      <path d="M78 104 l9 0 3 9 -7 6 -8 -6 z" fill="#E0913C" />
      <Diamond x={60} y={130} s={10} fill="#22d3ee" glow />
    </Frame>
  )
}

function DragonTigerArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="dgt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#072a36" />
        </linearGradient>
        <Sheen />
      </defs>
      <ellipse cx="60" cy="120" rx="50" ry="14" fill="#000" opacity="0.16" />
      {/* Dragon side — King (winner, cyan glow) */}
      <g style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.85))' }}>
        <Card x={40} y={66} r={-9} w={30} h={42}>
          <text x={-11} y={-9} fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#0f172a">K</text>
          <Spade x={2} y={6} s={9} />
        </Card>
      </g>
      {/* Tiger side — 7 of hearts */}
      <Card x={80} y={68} r={9} w={30} h={42} fill="#fef2f2">
        <text x={-11} y={-9} fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#dc2626">7</text>
        <Heart x={3} y={6} s={8} />
      </Card>
      <text x="60" y="60" textAnchor="middle" fontFamily="Arial" fontSize="11" fontWeight="800" fill="#fde68a" opacity="0.95">VS</text>
    </Frame>
  )
}

function AndarBaharArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="anb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#062a36" />
        </linearGradient>
        <Sheen />
      </defs>
      {/* joker, cut face-up at the top */}
      <Card x={60} y={40} fill="#fffbeb">
        <text x={-11} y={-9} fontFamily="Georgia, serif" fontSize="12" fontWeight="700" fill="#0f172a">J</text>
        <Spade x={2} y={6} s={9} />
      </Card>
      {/* Andar row (cyan) */}
      <Card x={42} y={104} r={-10} w={28} h={40} fill="#ecfeff">
        <Heart x={0} y={0} s={8} fill="#0e7490" />
      </Card>
      {/* Bahar row (amber) — the matching card, ringed */}
      <Card x={78} y={104} r={10} w={28} h={40} fill="#fffbeb">
        <text x={-9} y={-7} fontFamily="Georgia, serif" fontSize="11" fontWeight="700" fill="#b45309">J</text>
        <Spade x={2} y={5} s={8} fill="#b45309" />
      </Card>
      <Diamond x={60} y={130} s={11} fill="#22d3ee" glow />
    </Frame>
  )
}

const ART: Record<string, () => ReactNode> = {
  blackjack: BlackjackArt,
  plinko: PlinkoArt,
  mines: MinesArt,
  keno: KenoArt,
  poker: PokerArt,
  dice: DiceArt,
  crash: CrashArt,
  chicken: ChickenArt,
  limbo: LimboArt,
  towers: TowersArt,
  roulette: RouletteArt,
  baccarat: BaccaratArt,
  hilo: HiloArt,
  wheel: WheelArt,
  'video-poker': VideoPokerArt,
  dicex2: DiceX2Art,
  'dragon-tiger': DragonTigerArt,
  'andar-bahar': AndarBaharArt,
  pachinko: PachinkoArt,
  cascade: CascadeArt,
  firewalk: FirewalkArt,
  heist: HeistArt,
  'three-card-poker': ThreeCardPokerArt,
  'greed-dice': GreedDiceArt,
  cipher: CipherArt,
  craps: CrapsArt,
  'blackjack-multi': BlackjackMultiArt,
  lottery: LotteryArt,
  monte: MonteArt,
}

export function GameArt({ gameKey }: { gameKey: string }) {
  const Art = ART[gameKey]
  if (!Art) {
    return (
      <Frame>
        <defs>
          <linearGradient id="dfl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#0b1220" />
          </linearGradient>
        </defs>
      </Frame>
    )
  }
  return <Art />
}
