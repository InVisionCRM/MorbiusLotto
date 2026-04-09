'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/** Pinned version for stable caching; upgrade intentionally when QAing the widget. */
const CONVAI_EMBED_SRC =
  'https://unpkg.com/@elevenlabs/convai-widget-embed@0.11.2/dist/index.js'

export function ElevenLabsWidget() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const [convaiReady, setConvaiReady] = useState(false)
  const injectedRef = useRef(false)

  useEffect(() => {
    const inject = () => {
      const existing = document.querySelector('script[data-morbius-convai]') as HTMLScriptElement | null
      if (existing) {
        injectedRef.current = true
        if (typeof window.customElements !== 'undefined' && window.customElements.get('elevenlabs-convai')) {
          setConvaiReady(true)
        } else {
          existing.addEventListener('load', () => setConvaiReady(true), { once: true })
        }
        return
      }
      if (injectedRef.current) return
      injectedRef.current = true
      const script = document.createElement('script')
      script.src = CONVAI_EMBED_SRC
      script.async = true
      script.type = 'text/javascript'
      script.dataset.morbiusConvai = '1'
      script.onload = () => setConvaiReady(true)
      document.body.appendChild(script)
    }

    const scheduleIdle = (): (() => void) => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => inject(), { timeout: 12_000 })
        return () => window.cancelIdleCallback(id)
      }
      const id = window.setTimeout(() => inject(), 8_000)
      return () => window.clearTimeout(id)
    }

    // First interaction loads early for users who engage immediately; otherwise idle (better Lighthouse / TBT).
    const onInteract = () => inject()
    document.addEventListener('pointerdown', onInteract, { passive: true, once: true })
    document.addEventListener('keydown', onInteract, { once: true })

    let cancelIdle: (() => void) | undefined
    if (document.readyState === 'complete') {
      cancelIdle = scheduleIdle()
    } else {
      const onLoad = () => {
        cancelIdle = scheduleIdle()
      }
      window.addEventListener('load', onLoad, { once: true })
      return () => {
        window.removeEventListener('load', onLoad)
        document.removeEventListener('pointerdown', onInteract)
        document.removeEventListener('keydown', onInteract)
        cancelIdle?.()
      }
    }

    return () => {
      document.removeEventListener('pointerdown', onInteract)
      document.removeEventListener('keydown', onInteract)
      cancelIdle?.()
    }
  }, [])

  useEffect(() => {
    function handleCallEvent(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail?.config) return
      detail.config.clientTools = {
        // — Games —
        open_blackjack: () => { routerRef.current.push('/BLACKJACK'); return 'Navigating to Blackjack.' },
        open_plinko: () => { routerRef.current.push('/PLINKO'); return 'Navigating to Plinko.' },
        open_keno: () => { routerRef.current.push('/keno'); return 'Navigating to Keno.' },
        open_lottery: () => { routerRef.current.push('/lottery'); return 'Navigating to Lottery.' },
        open_poker: () => { routerRef.current.push('/poker'); return 'Navigating to Poker.' },
        open_multiplayer_blackjack: () => { routerRef.current.push('/blackjack-multi'); return 'Navigating to Multiplayer Blackjack.' },
        open_morbit: () => { routerRef.current.push('/Morb-It'); return 'Navigating to Morb-It.' },

        // — Wallet & Finance —
        open_deposit_withdraw_modal: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_deposit_withdraw'))
          return 'Wallet modal opened.'
        },
        open_swap: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_swap'))
          return 'Swap modal opened.'
        },
        open_claim: () => { routerRef.current.push('/claim'); return 'Navigating to Claim page.' },
        open_claim_fees: () => { routerRef.current.push('/claim-fees'); return 'Navigating to Claim Fees page.' },
        open_provide_lp: () => { window.open('https://pulsex.com', '_blank'); return 'Opening PulseX to provide liquidity.' },

        // — Profile & Customization —
        open_player_dashboard: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_player_dashboard'))
          return 'Player dashboard opened.'
        },
        open_profile_settings: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_profile_settings'))
          return 'Profile settings opened.'
        },
        open_avatar_editor: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_avatar_editor'))
          return 'Avatar editor opened.'
        },
        open_cosmetics_shop: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_avatar_editor'))
          return 'Cosmetics shop opened.'
        },

        // — Platform & Info —
        open_token_analyzer: () => { window.open('https://scan.morbius.io', '_blank'); return 'Opening Token Analyzer.' },
        open_token_chart: () => { window.open('https://scan.morbius.io/geicko', '_blank'); return 'Opening Token Chart.' },
        open_creators: () => { routerRef.current.push('/creators'); return 'Navigating to Creators page.' },
        scroll_to_tokenomics: () => {
          document.getElementById('tokenomics')?.scrollIntoView({ behavior: 'smooth' })
          return 'Scrolling to Tokenomics section.'
        },

        // — Responsible Gaming & Support —
        open_responsible_gaming: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_responsible_gaming'))
          return 'Responsible gaming options opened.'
        },
        open_install_app: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_install_app'))
          return 'App install instructions opened.'
        },
        open_report_issue: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_report_issue'))
          return 'Report issue dialog opened.'
        },
        open_login: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_login'))
          return 'Login modal opened.'
        },
      }
    }

    window.addEventListener('elevenlabs-convai:call', handleCallEvent)
    return () => window.removeEventListener('elevenlabs-convai:call', handleCallEvent)
  }, [])

  if (!convaiReady) return null

  return (
    <>
      {/* @ts-expect-error custom element */}
      <elevenlabs-convai
        agent-id="agent_6501knjaw524ff2bc6wvxagf49ga"
      />
    </>
  )
}
