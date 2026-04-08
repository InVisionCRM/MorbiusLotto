'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function ElevenLabsWidget() {
  const router = useRouter()

  useEffect(() => {
    if (document.querySelector('script[src*="elevenlabs/convai-widget-embed"]')) return
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
    script.async = true
    script.type = 'text/javascript'
    document.body.appendChild(script)
  }, [])

  useEffect(() => {
    function handleCallEvent(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail?.config) return
      detail.config.clientTools = {
        // — Games —
        open_blackjack: () => { router.push('/BLACKJACK'); return 'Navigating to Blackjack.' },
        open_plinko: () => { router.push('/PLINKO'); return 'Navigating to Plinko.' },
        open_keno: () => { router.push('/keno'); return 'Navigating to Keno.' },
        open_lottery: () => { router.push('/lottery'); return 'Navigating to Lottery.' },
        open_poker: () => { router.push('/poker'); return 'Navigating to Poker.' },
        open_multiplayer_blackjack: () => { router.push('/blackjack-multi'); return 'Navigating to Multiplayer Blackjack.' },
        open_morbit: () => { router.push('/Morb-It'); return 'Navigating to Morb-It.' },

        // — Wallet & Finance —
        open_deposit_withdraw_modal: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_deposit_withdraw'))
          return 'Wallet modal opened.'
        },
        open_swap: () => {
          window.dispatchEvent(new CustomEvent('sophie:open_swap'))
          return 'Swap modal opened.'
        },
        open_claim: () => { router.push('/claim'); return 'Navigating to Claim page.' },
        open_claim_fees: () => { router.push('/claim-fees'); return 'Navigating to Claim Fees page.' },
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
        open_creators: () => { router.push('/creators'); return 'Navigating to Creators page.' },
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
  }, [router])

  return (
    <>
      {/* @ts-expect-error custom element */}
      <elevenlabs-convai
        agent-id="agent_6501knjaw524ff2bc6wvxagf49ga"
      />
    </>
  )
}
