/**
 * /video-poker — chips Video Poker (off-chain chips, provably fair, 9/6 Jacks
 * or Better).
 *
 * Theme: "Deep-Sea Neon" — the cyan arcade2 direction shared with /baccarat,
 * /hilo and /towers: #050E16 abyss base, cyan #22D3EE accent, Chakra Petch
 * display + JetBrains Mono numerals (the arcade2 font variables).
 *
 * Backend: /api/video-poker/* — deal/hold/draw on the shared provably-fair
 * shuffle pipeline. Dual-auth (Telegram initData or the SIWE morb_session
 * cookie), same chip wallet as the rest of the arcade2 family.
 */

import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/PLINKO/Footer';
import { StakeVideoPokerGame } from '@/components/StakeVideoPoker/StakeVideoPokerGame';

const arcDisplay = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-arc-display',
});

const arcMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arc-mono',
});

export default function VideoPokerPage() {
  return (
    <GlobalMainNav>
      <div
        className={`arcade2-scope relative min-h-screen h-full w-full flex flex-col text-slate-200 ${arcDisplay.variable} ${arcMono.variable}`}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(5,14,22,0.92), rgba(2,7,11,0.96) 55%, rgba(5,14,22,0.98))',
          backgroundColor: '#050E16',
        }}
      >
        {/* Deep-sea lighting: a cool cyan shaft from above, vignette below. */}
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(34,211,238,0.12),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <div className="relative flex-1 w-full mx-auto px-3 py-4 sm:px-6 sm:py-8">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-2">
            <header className="mb-6 text-center">
              <h1 className="arc-display text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl">
                Video Poker
                <span className="ml-2 align-middle text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]">
                  ♣
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                jacks or better · hold &amp; draw · provably fair · played in chips
              </p>
            </header>
            <StakeVideoPokerGame />
          </main>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  );
}
