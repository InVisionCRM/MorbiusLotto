/**
 * /crash — chips Crash (off-chain chips, provably fair, LIVE cashout).
 *
 * The web port of the Morbius Crash prototype: cyber-neon space theme
 * (#06070a base, #00ffa3 neon green, Inter), canvas rocket flight with a
 * real mid-flight CASH OUT, played with the SIWE session + chip wallet like
 * the rest of the arcade2 family (/plinko2, /limbo2, /mines2).
 *
 * Backend: /api/arcade/crash/* — live rounds (start → cashout/poll-settle)
 * on the shared provably-fair HMAC pipeline.
 */

import { Inter } from 'next/font/google';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { StakeCrashGame } from '@/components/StakeCrash/StakeCrashGame';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '700', '800', '900'] });

export default function CrashPage() {
  return (
    <GlobalMainNav>
      <div className={`${inter.className} min-h-screen w-full bg-[#06070a] text-white antialiased`}>
        <StakeCrashGame />
      </div>
    </GlobalMainNav>
  );
}
