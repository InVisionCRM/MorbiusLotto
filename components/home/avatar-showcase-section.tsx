'use client'

import React, { useCallback, useState } from 'react'
import type { AvatarConfig } from '@/lib/websocket-client'
import { AvatarView, type Emotion } from '@/components/avatar'
import { MAX_SUPPLY, type ItemTier } from '@/lib/cosmetics-catalog'
import { cn } from '@/lib/utils'
import { homeSectionSubtitleClass, homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'
import { Button as MotionButton } from '@/components/animate-ui/primitives/buttons/button'
import { Particles, ParticlesEffect } from '@/components/animate-ui/primitives/effects/particles'
import { motion } from 'framer-motion'
import { Gem, PieChart, Sparkles, Store, UserRound } from 'lucide-react'

const DEMO_BASE: AvatarConfig = {
  skinColor: '#F1C27D',
  hairStyle: 'Messy',
  hairColor: '#3B3024',
  accessoryColor: '#111111',
  eyeShape: 'Almond',
  eyeColor: '#5c4033',
  noseShape: 'Small',
  lipShape: 'Thin',
  accessory: 'None',
  shirtColor: '#1a1a1a',
  shirtStyle: 'Tuxedo',
  hat: 'None',
  hatColor: '',
  necklace: 'None',
  mouthAccessory: 'Cigar',
  makeup: 'None',
  facialHair: 'None',
  backgroundImage: '',
  overlayImage: '',
  faceShape: 'Square',
  customPattern: '',
}

const PANEL: React.CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.85), rgba(40, 40, 40, 0.65))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.08), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

const RAINBOW_SKIN = 'url(#rainbow)' as const

const SKIN_PRESETS: { label: string; patch: Pick<AvatarConfig, 'skinColor'>; tier?: ItemTier }[] = [
  { label: 'Light', patch: { skinColor: '#F1C27D' } },
  { label: 'Medium', patch: { skinColor: '#C68642' } },
  { label: 'Dark', patch: { skinColor: '#3E2723' } },
  { label: 'Legend', tier: 'legendary', patch: { skinColor: RAINBOW_SKIN } },
]

const HAT_PRESETS: { label: string; patch: Pick<AvatarConfig, 'hat' | 'hatColor'> }[] = [
  { label: 'No hat', patch: { hat: 'None', hatColor: '' } },
  { label: 'Top hat', patch: { hat: 'Top Hat', hatColor: '#0f172a' } },
]

const EMOTION_MOVES: { id: Emotion; label: string }[] = [
  { id: 'wink', label: 'Wink' },
  { id: 'sad', label: 'Sad' },
  { id: 'surprised', label: 'Surprised' },
]

const particleDot = 'size-1 rounded-full bg-cyan-400/80 shadow-[0_0_10px_rgba(34,211,238,0.65)]'

const glowCard =
  'relative overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-purple-950/25 shadow-[0_0_48px_-16px_rgba(34,211,238,0.35)]'

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
}

const controlRow = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
}

const controlItem = {
  hidden: { opacity: 0, y: -14, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
}

export function AvatarShowcaseSection() {
  const [config, setConfig] = useState<AvatarConfig>(DEMO_BASE)
  const [emotion, setEmotion] = useState<Emotion>('neutral')
  const [glassesAnimationKey, setGlassesAnimationKey] = useState(0)

  const applyCosmetic = useCallback((patch: Partial<AvatarConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
  }, [])

  /** Same as CharacterCreator `handleDealWithIt`: toggle Sunglasses + spring-in when equipping. */
  const handleShades = useCallback(() => {
    let bumpGlasses = false
    setConfig((c) => {
      const isOn = c.accessory === 'Sunglasses'
      bumpGlasses = !isOn
      return {
        ...c,
        accessory: isOn ? 'None' : 'Sunglasses',
        accessoryColor: isOn ? '#111111' : '#0a0a0a',
      }
    })
    if (bumpGlasses) setGlassesAnimationKey((k) => k + 1)
  }, [])

  const hatMatches = (patch: Pick<AvatarConfig, 'hat' | 'hatColor'>) =>
    config.hat === patch.hat && (patch.hat === 'None' ? true : config.hatColor === patch.hatColor)

  return (
    <section
      id="avatar-showcase"
      className="relative w-full max-w-6xl mx-auto px-4 py-14 md:py-24 z-10 overflow-hidden"
      aria-labelledby="avatar-showcase-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.12),transparent),radial-gradient(ellipse_60%_40%_at_100%_50%,rgba(168,85,247,0.08),transparent)]"
        aria-hidden
      />

      <Particles inView inViewOnce inViewMargin="-80px" className="relative">
        <ParticlesEffect side="top" align="start" count={5} radius={120} spread={70} className={particleDot} />
        <ParticlesEffect side="top" align="end" count={5} radius={100} spread={80} delay={0.15} className={particleDot} />
        <ParticlesEffect side="bottom" align="center" count={6} radius={140} spread={90} delay={0.08} className={particleDot} />

        <div className="relative text-center mb-10 md:mb-12">
          <motion.div {...fadeUp}>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400/80 mb-3">Cosmetics</p>
            <h2 id="avatar-showcase-heading" className={cn(homeSectionTitleClass, 'mb-3')}>
              <span className={homeSectionTitleGradientClass}>Wear the chain</span>
            </h2>
            <p className={cn(homeSectionSubtitleClass, 'max-w-xl mx-auto text-slate-400')}>
              Limited drops, profile-bound SVG avatars, peer marketplace.
            </p>
          </motion.div>
        </div>

        <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.06 }} className="mb-12 md:mb-16">
          <div
            className={cn(
              'relative rounded-2xl border-2 border-cyan-500/35 overflow-hidden',
              'shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)_inset]'
            )}
            style={PANEL}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.15),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.1),transparent_50%)]"
              aria-hidden
            />
            <div className="relative flex flex-col lg:flex-row lg:items-stretch gap-6 p-6 md:p-8 lg:p-10">
              <div className="flex-1 flex items-center justify-center min-h-[260px] sm:min-h-[300px] lg:min-h-[360px]">
                <motion.div
                  className="w-full max-w-[min(100%,380px)] aspect-square"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <AvatarView
                    config={config}
                    emotion={emotion}
                    glassesAnimationKey={glassesAnimationKey}
                    compact={false}
                    trackMouse
                    className="w-full h-full [&_svg]:w-full [&_svg]:h-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                  />
                </motion.div>
              </div>

              <div className="lg:w-[min(100%,340px)] flex flex-col gap-5 shrink-0 justify-center">
                <div>
                  <motion.p
                    className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2"
                    variants={controlItem}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-20px' }}
                  >
                    Moves
                  </motion.p>
                  <motion.div
                    className="flex flex-wrap gap-2"
                    variants={controlRow}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-20px' }}
                  >
                    <motion.div variants={controlItem}>
                      <MotionButton
                        type="button"
                        hoverScale={1.04}
                        tapScale={0.96}
                        className={cn(
                          'rounded-xl px-3.5 py-2 text-sm font-semibold border transition-colors',
                          config.accessory === 'Sunglasses'
                            ? 'border-indigo-400/70 bg-indigo-600/35 text-white'
                            : 'border-white/10 bg-black/40 text-zinc-200 hover:border-cyan-500/40 hover:bg-white/5'
                        )}
                        onClick={handleShades}
                      >
                        Shades
                      </MotionButton>
                    </motion.div>
                    {EMOTION_MOVES.map(({ id, label }) => (
                      <motion.div key={id} variants={controlItem}>
                        <MotionButton
                          type="button"
                          hoverScale={1.04}
                          tapScale={0.96}
                          className={cn(
                            'rounded-xl px-3.5 py-2 text-sm font-semibold border transition-colors',
                            emotion === id
                              ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-50'
                              : 'border-white/10 bg-black/40 text-zinc-200 hover:border-cyan-500/40 hover:bg-white/5'
                          )}
                          onClick={() => setEmotion((e) => (e === id ? 'neutral' : id))}
                        >
                          {label}
                        </MotionButton>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
                <div>
                  <motion.p
                    className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2"
                    variants={controlItem}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-20px' }}
                  >
                    Skin
                  </motion.p>
                  <motion.div
                    className="flex flex-wrap gap-2"
                    variants={controlRow}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-20px' }}
                  >
                    {SKIN_PRESETS.map(({ label, patch, tier }) => (
                      <motion.div key={label} variants={controlItem}>
                        <MotionButton
                          type="button"
                          hoverScale={1.04}
                          tapScale={0.96}
                          className={cn(
                            'rounded-xl px-3.5 py-2 text-sm font-semibold border inline-flex items-center gap-2',
                            config.skinColor === patch.skinColor
                              ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-50'
                              : 'border-white/10 bg-black/40 text-zinc-200 hover:border-cyan-500/40'
                          )}
                          onClick={() => applyCosmetic(patch)}
                        >
                          <span
                            className={cn(
                              'size-3.5 rounded-md border border-white/20 shrink-0 shadow-inner',
                              patch.skinColor === RAINBOW_SKIN &&
                                'bg-gradient-to-r from-rose-500 via-amber-300 to-cyan-400'
                            )}
                            style={
                              patch.skinColor === RAINBOW_SKIN ? undefined : { backgroundColor: patch.skinColor }
                            }
                            aria-hidden
                          />
                          {label}
                          {tier === 'legendary' ? (
                            <span className="text-[9px] uppercase tracking-wide text-amber-300/90">L</span>
                          ) : null}
                        </MotionButton>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
                <div>
                  <motion.p
                    className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2"
                    variants={controlItem}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-20px' }}
                  >
                    Hat
                  </motion.p>
                  <motion.div
                    className="flex flex-wrap gap-2"
                    variants={controlRow}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-20px' }}
                  >
                    {HAT_PRESETS.map(({ label, patch }) => (
                      <motion.div key={label} variants={controlItem}>
                        <MotionButton
                          type="button"
                          hoverScale={1.04}
                          tapScale={0.96}
                          className={cn(
                            'rounded-xl px-3.5 py-2 text-sm font-semibold border',
                            hatMatches(patch)
                              ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-50'
                              : 'border-white/10 bg-black/40 text-zinc-200 hover:border-cyan-500/40'
                          )}
                          onClick={() => applyCosmetic(patch)}
                        >
                          {label}
                        </MotionButton>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
                <motion.p
                  className="text-xs text-zinc-500 leading-snug"
                  variants={controlItem}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-20px' }}
                >
                  Demo: tux · messy hair · cigar. Shades matches profile editor (toggle + drop-in). Connect for full wardrobe.
                </motion.p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-5">
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className={cn(glowCard, 'sm:col-span-2 lg:col-span-5 p-6 md:p-7')}
          >
            <div className="absolute -right-8 -top-8 size-32 rounded-full bg-cyan-500/10 blur-2xl" aria-hidden />
            <UserRound className="size-8 text-cyan-400 mb-4 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]" aria-hidden />
            <h3 className="text-lg font-bold text-white tracking-tight mb-2">One puppet, your slots</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Saved <span className="text-cyan-200/90">AvatarConfig</span> → SVG on seats & chat. Legendary shop items cap at{' '}
              <span className="text-white font-mono tabular-nums">1</span> mint each — real scarcity on top of combinatorics.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.14 }}
            className={cn(glowCard, 'sm:col-span-2 lg:col-span-7 p-6 md:p-7')}
          >
            <div className="flex items-center gap-2 mb-5">
              <Gem className="size-7 text-amber-400" aria-hidden />
              <h3 className="text-lg font-bold text-white tracking-tight">Supply / item</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['common', 'uncommon', 'rare', 'legendary'] as const).map((tier) => (
                <div
                  key={tier}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-4 text-center backdrop-blur-sm"
                >
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{tier}</p>
                  <p className="text-2xl md:text-3xl font-bold tabular-nums bg-gradient-to-r from-white to-cyan-100 bg-clip-text text-transparent">
                    {MAX_SUPPLY[tier]}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.18 }}
            className={cn(glowCard, 'sm:col-span-2 lg:col-span-6 p-6 md:p-7')}
          >
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="size-7 text-cyan-400" aria-hidden />
              <h3 className="text-lg font-bold text-white tracking-tight">Cosmetic split</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              {[
                ['Holders', '10%'],
                ['LP', '15%'],
                ['Burn', '5%'],
                ['House', '17.5%'],
              ].map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-950/40 px-3 py-1.5 text-cyan-100/90"
                >
                  {k}
                  <span className="font-mono text-cyan-300">{v}</span>
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Rest → <span className="text-slate-200">poker & blackjack tournaments</span>.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.22 }}
            className={cn(glowCard, 'sm:col-span-2 lg:col-span-6 p-6 md:p-7')}
          >
            <div className="flex items-center gap-2 mb-4">
              <Store className="size-7 text-violet-400" aria-hidden />
              <h3 className="text-lg font-bold text-white tracking-tight">Marketplace</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed flex items-start gap-2">
              <Sparkles className="size-4 text-violet-400 shrink-0 mt-0.5" aria-hidden />
              List what you own for MORBIUS. Buyers get the item; you set the price — liquidity for rare cosmetics.
            </p>
          </motion.div>
        </div>
      </Particles>
    </section>
  )
}
