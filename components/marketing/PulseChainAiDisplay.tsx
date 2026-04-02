'use client'

import { Crown, BadgeCheck, TrendingUp, Globe, MessagesSquare } from 'lucide-react'

// ── 3D Gold Badge ─────────────────────────────────────────────────────────────
function GoldBadge() {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Outer spinning ring */}
      <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
        {/* Animated dashed outer ring */}
        <div
          className="absolute inset-0 rounded-full border-2 border-dashed border-amber-400/50"
          style={{ animation: 'spin 20s linear infinite' }}
        />
        {/* Static outer glow ring */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 8,
            boxShadow: '0 0 40px 12px rgba(245,158,11,0.35), inset 0 0 24px rgba(245,158,11,0.15)',
            borderRadius: '50%',
          }}
        />
        {/* Main badge circle */}
        <div
          className="relative flex flex-col items-center justify-center rounded-full border-2 border-amber-400"
          style={{
            width: 148,
            height: 148,
            background:
              'radial-gradient(circle at 35% 35%, #fde68a 0%, #f59e0b 40%, #b45309 100%)',
            boxShadow:
              '0 8px 40px rgba(245,158,11,0.55), inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -4px 8px rgba(120,53,15,0.4)',
          }}
        >
          {/* Shine overlay */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
            }}
          />
          {/* Content */}
          <Crown className="w-9 h-9 mb-1 drop-shadow-sm" style={{ color: '#78350f' }} />
          <span
            className="text-sm font-black tracking-widest uppercase"
            style={{ color: '#78350f', textShadow: '0 1px 2px rgba(255,255,255,0.3)' }}
          >
            GOLD
          </span>
          <span
            className="text-[9px] font-bold tracking-wider uppercase mt-0.5"
            style={{ color: '#92400e', opacity: 0.85 }}
          >
            Verified
          </span>
        </div>
      </div>

      {/* Label under badge */}
      <div className="text-center">
        <p className="text-amber-300 font-bold text-sm">GOLD Badge</p>
        <p className="text-slate-500 text-xs">PulseChainAi.com</p>
      </div>

      {/* Spin keyframe injected inline — avoids needing a global CSS file */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Browser Mockup ────────────────────────────────────────────────────────────
function AiBrowserMockup({
  src,
  label,
  url,
  rotateY,
}: {
  src: string
  label: string
  url: string
  rotateY: number
}) {
  const isRight = rotateY < 0
  return (
    <div className="relative flex-1 min-w-0">
      {/* Amber glow */}
      <div
        className="absolute inset-x-4 inset-y-4 rounded-3xl blur-3xl pointer-events-none"
        style={{ background: 'rgba(245,158,11,0.18)' }}
      />

      {/* 3D frame */}
      <div
        className="relative rounded-2xl overflow-hidden border border-amber-500/20 shadow-2xl"
        style={{
          transform: `perspective(1100px) rotateY(${rotateY}deg) rotateX(3deg) scale(0.97)`,
          transformOrigin: isRight ? 'right center' : 'left center',
          background: 'linear-gradient(160deg, #1e2a1a 0%, #0f1a0f 100%)',
          boxShadow:
            '0 28px 72px rgba(0,0,0,0.65), 0 0 0 1px rgba(245,158,11,0.12)',
        }}
      >
        {/* Chrome */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b border-amber-500/10"
          style={{ background: 'rgba(10,18,10,0.95)' }}
        >
          <div className="flex gap-1.5 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <div
            className="flex-1 px-3 py-1 rounded-md text-[11px] text-amber-600/80 text-center truncate"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          >
            {url}
          </div>
        </div>

        {/* Screenshot */}
        { }
        <img src={src} alt={label} className="w-full block" />
      </div>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────
export function PulseChainAiDisplay() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider mb-5"
            style={{
              background: 'rgba(120,53,15,0.25)',
              borderColor: 'rgba(245,158,11,0.35)',
              color: '#fbbf24',
            }}
          >
            <Crown className="w-3.5 h-3.5" />
            PulseChainAi.com — Gold Badge Package
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Get Your Token on{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(to right, #fbbf24, #f59e0b)' }}
            >
              PulseChainAi.com
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            A standalone listing on the fastest-growing PulseChain token directory —
            or included free with any custom table package.
          </p>
        </div>

        {/* Badge + Mockups row */}
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-6">
          {/* Left mockup: Top Tokens */}
          <AiBrowserMockup
            src="/Marketing%20/PulseChain-AI/PulseChainAiTopTokens.png"
            label="PulseChainAi Top Tokens"
            url="pulsechainai.com/tokens"
            rotateY={9}
          />

          {/* Center: Gold Badge */}
          <div className="flex flex-col items-center gap-6 shrink-0">
            <GoldBadge />

            {/* Price callout */}
            <div
              className="rounded-2xl px-6 py-4 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(120,53,15,0.3) 0%, rgba(78,29,5,0.2) 100%)',
                border: '1px solid rgba(245,158,11,0.3)',
                minWidth: 200,
              }}
            >
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-bold uppercase tracking-wider mb-2">
                Limited Time 50% Off
              </div>
              <p className="text-xs text-amber-400/80 uppercase tracking-widest mb-1 font-semibold">Standalone</p>
              <div className="flex items-baseline justify-center gap-2 mb-0.5">
                <p className="text-3xl font-black text-white">$24</p>
                <p className="text-base font-semibold text-slate-600 line-through">$49</p>
              </div>
              <p className="text-xs text-slate-500">Paid in PLS at live rate</p>

              <div className="mt-4 flex flex-col gap-2">
                <a
                  href="https://t.me/kylecruise"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    boxShadow: '0 4px 16px rgba(245,158,11,0.35)',
                  }}
                >
                  <MessagesSquare className="w-3.5 h-3.5" />
                  Get Started
                </a>
              </div>

              <p
                className="text-[10px] mt-3 leading-relaxed"
                style={{ color: 'rgba(245,158,11,0.55)' }}
              >
                Already included free with the $49 Custom Table package (was $99)
              </p>
            </div>
          </div>

          {/* Right mockup: Profile Page */}
          <AiBrowserMockup
            src="/Marketing%20/PulseChain-AI/PulseChainAiProfilePage.png"
            label="PulseChainAi Token Profile"
            url="pulsechainai.com/token/..."
            rotateY={-9}
          />
        </div>

        {/* What's included */}
        <div className="mt-12 grid sm:grid-cols-3 gap-4">
          {[
            { icon: BadgeCheck, label: 'GOLD Verified Badge', desc: 'Displayed on your token listing across the site' },
            { icon: Globe, label: 'Custom Token Description', desc: 'Your pitch, exactly how you want it' },
            { icon: TrendingUp, label: 'Featured on the Front Page', desc: 'Your token showcased on the PulseChainAi.com front page' },
          ].map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{
                background: 'rgba(120,53,15,0.12)',
                border: '1px solid rgba(245,158,11,0.15)',
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(245,158,11,0.2)' }}>
                <Icon className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">{label}</p>
                <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
