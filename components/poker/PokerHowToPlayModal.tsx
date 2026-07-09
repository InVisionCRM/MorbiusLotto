'use client';

import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GameHowTo } from '@/components/shared/GameHowTo';
import { PokerScene } from '@/components/home2/scenes';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const ACTIONS: Array<{ name: string; desc: string }> = [
  { name: 'Fold', desc: 'Drop out of the hand and give up your cards.' },
  { name: 'Check', desc: 'Stay in without betting (only when no one has bet this round).' },
  { name: 'Bet', desc: 'Put chips into the pot when first to act.' },
  { name: 'Call', desc: 'Match the current bet to stay in.' },
  { name: 'Raise', desc: 'Increase the bet; others must call or fold.' },
  { name: 'All-in', desc: 'Bet your entire stack — you can only win up to what each opponent matches.' },
];

const HAND_RANKINGS: Array<{ rank: number; name: string; desc: string; cards: string[] }> = [
  { rank: 1, name: 'Royal Flush', desc: 'A, K, Q, J, 10 of the same suit.', cards: ['AS', 'KS', 'QS', 'JS', '10S'] },
  { rank: 2, name: 'Straight Flush', desc: 'Five consecutive cards of the same suit.', cards: ['9H', '8H', '7H', '6H', '5H'] },
  { rank: 3, name: 'Four of a Kind', desc: 'Four cards of the same rank.', cards: ['KC', 'KH', 'KD', 'KS', '3D'] },
  { rank: 4, name: 'Full House', desc: 'Three of a kind plus a pair.', cards: ['AC', 'AD', 'AH', 'KS', 'KD'] },
  { rank: 5, name: 'Flush', desc: 'Five cards of the same suit (not in sequence).', cards: ['AH', 'JH', '9H', '6H', '2H'] },
  { rank: 6, name: 'Straight', desc: 'Five consecutive cards of mixed suits.', cards: ['10C', '9D', '8H', '7S', '6C'] },
  { rank: 7, name: 'Three of a Kind', desc: 'Three cards of the same rank.', cards: ['QC', 'QD', 'QH', '5S', '2D'] },
  { rank: 8, name: 'Two Pair', desc: 'Two different pairs.', cards: ['JC', 'JD', '9H', '9S', '3C'] },
  { rank: 9, name: 'One Pair', desc: 'Two cards of the same rank.', cards: ['KC', 'KD', '10H', '5D', '2S'] },
  { rank: 10, name: 'High Card', desc: 'No pair; highest card wins.', cards: ['AS', 'KD', '10C', '5H', '2S'] },
];

const ACCENT = '#a78bfa';

export function PokerHowToPlayModal({ isOpen, onClose }: Props) {
  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="z-[100000] sm:max-w-[440px] p-0 gap-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0c1521] max-h-[88vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>How to play Poker</DialogTitle>
        </DialogHeader>
        <GameHowTo
          name="Poker"
          tagline="No-limit Texas Hold'em — outplay the table, take the pot."
          accent={ACCENT}
          art={<PokerScene />}
          pills={[
            { label: 'Provably Fair' },
            { label: 'Multiplayer' },
            { label: "No-Limit Hold'em", muted: true },
            { label: 'Cash Tables', muted: true },
          ]}
          steps={[
            { title: 'Join a table', detail: 'Pick a table and buy in from your MORBIUS balance.' },
            { title: 'Play the streets', detail: 'Pre-flop, flop, turn, river — bet, call, raise, or fold each round.' },
            { title: 'Make the best hand', detail: 'Combine your 2 hole cards with the 5 community cards.' },
            { title: 'Win the pot', detail: 'Best hand at showdown — or make everyone else fold.' },
          ]}
          notes={[
            { title: 'Provably fair.', body: 'The deck is committed (hashed) before the hand and the seed is revealed after, so you can verify the order on the Poker Verify page.' },
            { title: 'Rake.', body: 'A small rake is taken from each pot — the standard way poker works.' },
          ]}
        >
          <style>{`
            .pk-list{display:flex;flex-direction:column;gap:7px}
            .pk-act{display:flex;gap:9px;font-size:12.5px;line-height:1.4}
            .pk-act b{color:${ACCENT};font-weight:700;flex:none;min-width:52px}
            .pk-act span{color:#8ea3ba}
            .pk-hand{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
            .pk-hand:last-child{margin-bottom:0}
            .pk-rank{flex:none;width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:10px;font-weight:800;color:${ACCENT};background:color-mix(in srgb, ${ACCENT} 14%, transparent);border:1px solid color-mix(in srgb, ${ACCENT} 26%, transparent);margin-top:1px}
            .pk-cards{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:3px}
            .pk-cards img{border-radius:3px;object-fit:contain;box-shadow:0 1px 3px rgba(0,0,0,.4)}
            .pk-hn{font-size:12.5px;font-weight:700;color:#e6eef8}
            .pk-hd{font-size:11.5px;color:#8ea3ba}
          `}</style>

          <section className="gh-sec">
            <h3 className="gh-h3">Actions</h3>
            <div className="pk-list">
              {ACTIONS.map((a) => (
                <div key={a.name} className="pk-act"><b>{a.name}</b><span>{a.desc}</span></div>
              ))}
            </div>
          </section>

          <section className="gh-sec">
            <h3 className="gh-h3">Hand rankings · best to worst</h3>
            {HAND_RANKINGS.map(({ rank, name, desc, cards }) => (
              <div key={rank} className="pk-hand">
                <div className="pk-rank">{rank}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="pk-cards">
                    {cards.map((c) => (
                      <Image key={c} src={`/BlackJack/Cards/PNG/${c}.png`} alt={c} width={30} height={42} />
                    ))}
                  </div>
                  <span className="pk-hn">{name}</span> <span className="pk-hd">— {desc}</span>
                </div>
              </div>
            ))}
          </section>
        </GameHowTo>
      </DialogContent>
    </Dialog>
  );
}
