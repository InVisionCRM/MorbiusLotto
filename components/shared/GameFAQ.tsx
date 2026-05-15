'use client'

import React from 'react'
import { ExternalLink } from 'lucide-react'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const EXPLORER_BASE = 'https://scan.pulsechain.com/address/'

export interface FAQAddress {
  label: string
  address: string
}

interface GameFAQProps {
  game: 'plinko' | 'blackjack' | 'keno' | 'lottery' | 'poker' | 'roulette'
  addresses: FAQAddress[]
  /** Blackjack-only: render an inline link in the deposit answer that opens the wallet modal. */
  onDepositClick?: () => void
  /** Blackjack-only: render an inline link in the how-to-play answer that opens the walkthrough video. */
  onHowToPlayClick?: () => void
}

function InlineActionLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200 font-medium transition-colors"
    >
      {children}
    </button>
  )
}

const GAME_FAQS: Record<GameFAQProps['game'], { q: string; a: React.ReactNode }[]> = {
  plinko: [
    {
      q: 'How does Plinko work?',
      a: 'You choose a wager and risk level (Green, Yellow, or Red). Balls are dropped from the top and bounce off pegs into buckets. Each bucket has a multiplier—higher risk means higher possible payouts and higher variance. Results are provably fair and recorded on-chain.',
    },
    {
      q: 'What are the risk levels?',
      a: 'Green is lower variance with smaller multipliers. Yellow is medium. Red offers the highest multipliers and highest variance. Your payout is (wager × bucket multiplier) minus the fee.',
    },
    {
      q: 'What are the fees?',
      a: 'A fee is taken on each wager (e.g. 5% total: distribution, burn, platform, LP). Your payout is paid out in the same transaction—no separate claim.',
    },
    {
      q: 'What token do I need?',
      a: 'You can play with MORBIUS or WPLS (wrapped PLS). Approve the contract once, then buy balls and drop. Winnings are paid in the same token you wagered.',
    },
    {
      q: 'How is the RNG calculated?',
      a: 'The contract builds a random seed from on-chain data: previous block hash, block timestamp, your address, a global drop counter, gas price, and a per-ball nonce. That seed is hashed (keccak256) and mapped to a bucket via fixed weighted thresholds. The seed is emitted in the BallDropped event so anyone can verify the result.',
    },
    {
      q: 'Do I need to claim my winnings?',
      a: 'No. Payouts are sent automatically in the same transaction when the ball lands. Nothing to claim.',
    },
    {
      q: 'My transaction is stuck. What can I do?',
      a: 'Try sending 1 PLS to yourself (your own wallet address) from the same wallet. This can clear stuck nonces and help the network process pending transactions.',
    },
    {
      q: 'Who do I contact if there\'s an issue?',
      a: 'Contact @Morbius_io on X (x.com) or use the Report tab in the site menu.',
    },
    {
      q: 'Where are the contract addresses?',
      a: null, // Rendered from addresses prop
    },
  ],
  blackjack: [
    {
      q: 'How do I play Blackjack?',
      a: 'Connect your wallet, deposit MORBIUS into the table reserve, then place a bet and hit Deal. Use Hit, Stand, Double, or Split according to standard blackjack rules. The game is provably fair with server-revealed seeds.',
    },
    {
      q: 'How do I deposit and withdraw?',
      a: 'Use the Deposit/Withdraw button to move MORBIUS between your wallet and the table. You need a small amount of PLS for gas.',
    },
    {
      q: 'What are the fees?',
      a: 'Blackjack applies a 5% fee on withdrawals only (moving MORBIUS from your table balance back to your wallet). The 5% is split: 0.5% burn, 1.25% holders, 1.5% LP providers, 1.75% platform. Amounts are enforced by the contract and reflected in the UI when you withdraw.',
    },
    {
      q: 'How is the RNG calculated?',
      a: 'Blackjack uses a provably fair system. Before the game you see a hash of the server seed. Your client seed and a nonce are combined with the server seed (revealed after the game) via HMAC-SHA256. The deck is shuffled with a Fisher–Yates algorithm from that output. You can verify any hand on the Blackjack Verify page using the server seed, client seed, and nonce.',
    },
    {
      q: 'Do I need to claim my winnings?',
      a: 'Winnings stay in your table reserve automatically. When you\'re done playing, use Withdraw to send your balance (including winnings) back to your wallet. No separate claim step.',
    },
    {
      q: 'My transaction is stuck. What can I do?',
      a: 'Try sending 1 PLS to yourself (your own wallet address) from the same wallet. This can clear stuck nonces and help the network process pending transactions.',
    },
    {
      q: 'Who do I contact if there\'s an issue?',
      a: 'Contact @Morbius_io on X (x.com) or use the Report tab in the site menu.',
    },
    {
      q: 'Where are the contract addresses?',
      a: null,
    },
  ],
  keno: [
    {
      q: 'How does Keno work?',
      a: 'Pick 1–10 numbers from 1–80. Choose your wager and click Play. The contract draws 20 winning numbers in the same transaction. You are paid based on how many of your picks match (see the paytable).',
    },
    {
      q: 'What are the payouts?',
      a: 'Payouts depend on spot size (how many numbers you picked) and how many hits you get. The paytable is shown on the ticket. More hits mean higher multipliers up to the max for that spot size.',
    },
    {
      q: 'What are the fees?',
      a: 'A fee is taken on each wager. Your payout is sent in the same transaction—no separate claim.',
    },
    {
      q: 'How is the RNG calculated?',
      a: 'The contract builds a seed from on-chain data: previous block hash, block timestamp, your address, a global ticket counter, and gas price. That seed is hashed (keccak256). The 20 winning numbers are drawn from 1–80 using a deterministic algorithm (Fisher–Yates style) from that seed, so the result is reproducible and verifiable on-chain.',
    },
    {
      q: 'Do I need to claim my winnings?',
      a: 'No. Payouts are sent automatically in the same transaction when the draw completes. Nothing to claim.',
    },
    {
      q: 'My transaction is stuck. What can I do?',
      a: 'Try sending 1 PLS to yourself (your own wallet address) from the same wallet. This can clear stuck nonces and help the network process pending transactions.',
    },
    {
      q: 'Who do I contact if there\'s an issue?',
      a: 'Contact @Morbius_io on X (x.com) or use the Report tab in the site menu.',
    },
    {
      q: 'Where are the contract addresses?',
      a: null,
    },
  ],
  lottery: [
    {
      q: 'How does the Instant Lottery work?',
      a: 'Pick 6 numbers from 1–55. Submit a wager in MORBIUS. The contract draws 6 winning numbers and pays out instantly based on how many match. No waiting for rounds—each play is a single transaction.',
    },
    {
      q: 'What are the fees?',
      a: 'A fee is taken on each wager. Your payout is sent in the same transaction—no separate claim.',
    },
    {
      q: 'How is the RNG calculated?',
      a: 'Instant lottery uses the same provably fair system as Blackjack. The server generates a server seed (you get its hash before the draw), and combines it with your client seed and a nonce. The 6 winning numbers are produced with HMAC-SHA256 and a Fisher–Yates draw from 1–55. The server then submits that result on-chain via the operator; after the game you can verify any play on the Lottery Verify page using the revealed server seed, client seed, and nonce.',
    },
    {
      q: 'Do I need to claim my winnings?',
      a: 'No. Payouts are sent automatically in the same transaction. Nothing to claim.',
    },
    {
      q: 'My transaction is stuck. What can I do?',
      a: 'Try sending 1 PLS to yourself (your own wallet address) from the same wallet. This can clear stuck nonces and help the network process pending transactions.',
    },
    {
      q: 'Who do I contact if there\'s an issue?',
      a: 'Contact @Morbius_io on X (x.com) or use the Report tab in the site menu.',
    },
    {
      q: 'Where are the contract addresses?',
      a: null,
    },
  ],
  poker: [
    {
      q: 'How do multiplayer Poker tables work?',
      a: 'Join a table from the lobby, choose your buy-in, and play no-limit Texas Hold\'em against other players. A hand runs through pre-flop, flop, turn, river, and showdown.',
    },
    {
      q: 'How do chips and buy-ins work?',
      a: 'Your table stack comes from your in-game MORBIUS balance. When you join a table, your selected buy-in is moved into your seat stack for that table.',
    },
    {
      q: 'How do I leave a table?',
      a: 'Click Leave. You\'ll get a confirmation showing your leaving amount, and your remaining stack is returned to your game balance.',
    },
    {
      q: 'Is there a separate claim step for Poker winnings?',
      a: 'No separate claim is needed during table play. Pots and stacks update automatically as hands resolve.',
    },
    {
      q: 'How do I know the cards aren\'t rigged?',
      a: 'Poker uses the same provably fair system as Blackjack. Before each hand starts the server commits to a deck by publishing a hash of its secret seed; the plaintext seed stays hidden until the hand ends. The deck order is derived from that seed via HMAC-SHA256 and a Fisher–Yates shuffle, so once the seed is revealed anyone can re-run the math and confirm the deck was fixed before any card was dealt. After the hand, visit the Poker Verify page (or click "Verify this hand ↗" in your hand history) to see the commitment, the revealed seed, the deck order, and three green ✅ checks: hash match, deck reproducible, deal order matches.',
    },
    {
      q: 'My transaction is stuck. What can I do?',
      a: 'Try sending 1 PLS to yourself (your own wallet address) from the same wallet. This can clear stuck nonces and help the network process pending transactions.',
    },
    {
      q: 'Who do I contact if there\'s an issue?',
      a: 'Contact @Morbius_io on X (x.com) or use the Report tab in the site menu.',
    },
    {
      q: 'Where are the contract addresses?',
      a: null,
    },
  ],
  roulette: [
    {
      q: 'What kind of roulette is this?',
      a: 'European single-zero roulette (numbers 0–36). There is no double-zero, giving players a better house edge than American roulette.',
    },
    {
      q: 'What bet types are available?',
      a: 'Inside bets: Straight (35:1), Split (17:1), Street (11:1), Corner (8:1), Line (5:1). Outside bets: Column/Dozen (2:1), Red/Black, Even/Odd, Low/High (1:1 each).',
    },
    {
      q: 'Can I place multiple bets per spin?',
      a: 'Yes — up to 15 simultaneous bet positions per spin. Select a chip value, click any number or outside bet area, and stack chips as you like before spinning.',
    },
    {
      q: 'How does the result work?',
      a: 'The result is determined on-chain in the same transaction using blockhash randomness. Payout is instant — no waiting.',
    },
    {
      q: 'What are the fees?',
      a: '5% total on wagers: 1.25% MORBIUS holder distribution, 1.75% platform/house, 1.5% LP holders, 0.5% burn.',
    },
    {
      q: 'Where are the contract addresses?',
      a: null,
    },
  ],
}

function AddressBlock({ addresses }: { addresses: FAQAddress[] }) {
  return (
    <div className="space-y-3 pt-1">
      {addresses.map(({ label, address }) => (
        <div
          key={address}
          className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2 border border-cyan-500/20"
        >
          <span className="text-xs font-medium text-cyan-300/90">{label}:</span>
          <code className="text-xs font-mono text-white/90 break-all flex-1 min-w-0">
            {address}
          </code>
          <div className="flex items-center gap-1 shrink-0">
            <CopyButton
              content={address}
              copyToast={`${label} address copied`}
              variant="ghost"
              size="sm"
              className="p-1.5 h-8 w-8 text-white/70 hover:text-cyan-300"
              title={`Copy ${label}`}
              aria-label={`Copy ${label}`}
            />
            <a
              href={`${EXPLORER_BASE}${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-cyan-300 transition-colors"
              title="View on PulseScan"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}

export function GameFAQ({ game, addresses, onDepositClick, onHowToPlayClick }: GameFAQProps) {
  const faqs = GAME_FAQS[game].map((item) => {
    if (item.a === null) {
      return { q: item.q, a: <AddressBlock addresses={addresses} /> }
    }
    if (game === 'blackjack' && onHowToPlayClick && item.q === 'How do I play Blackjack?') {
      return {
        q: item.q,
        a: (
          <>
            {item.a}{' '}
            <InlineActionLink onClick={onHowToPlayClick}>Watch the walkthrough →</InlineActionLink>
          </>
        ),
      }
    }
    if (game === 'blackjack' && onDepositClick && item.q === 'How do I deposit and withdraw?') {
      return {
        q: item.q,
        a: (
          <>
            {item.a}{' '}
            <InlineActionLink onClick={onDepositClick}>Click here to open Deposit / Withdraw →</InlineActionLink>
          </>
        ),
      }
    }
    return item
  })

  return (
    <section
      className="relative w-full max-w-3xl mx-auto px-4 py-6"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
        borderRadius: '1rem',
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.08),transparent_70%)] rounded-[1rem] pointer-events-none" aria-hidden />
      <h2 className="text-lg font-bold text-cyan-300/95 mb-4 relative">FAQ</h2>
      <Accordion type="single" collapsible className="w-full relative">
        {faqs.map((faq, i) => (
          <AccordionItem
            key={i}
            value={`item-${i}`}
            className="border-cyan-500/20 text-left"
          >
            <AccordionTrigger className="text-white/90 hover:text-cyan-300 py-3 text-sm font-medium [&[data-state=open]>svg]:rotate-180">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-white/80 text-sm pb-3">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
