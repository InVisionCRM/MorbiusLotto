'use client';

import Image from 'next/image';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

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

export function PokerHowToPlayModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div
        className="bg-[#e0e5ec] rounded-[2rem] max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{ boxShadow: '4px 4px 8px rgba(163,177,198,0.4), -4px -4px 8px rgba(255,255,255,0.4)' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-300/60 shrink-0">
          <div
            className="w-10 h-10 rounded-full bg-[#e0e5ec] flex items-center justify-center text-slate-500 text-lg"
            style={{ boxShadow: 'inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.4)' }}
          >
            ♠
          </div>
          <h2 className="text-xl font-bold text-slate-700">How to Play</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#e0e5ec] flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
            style={{ boxShadow: '2px 2px 4px rgba(163,177,198,0.4), -2px -2px 4px rgba(255,255,255,0.4)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Overview</h3>
            <p className="text-slate-700 text-sm leading-relaxed">
              Texas Hold&apos;em is a community-card poker game. Each player gets two private cards (hole cards) and shares five community cards. You make the best five-card hand using any combination of your two cards and the five on the table.
            </p>
          </section>

          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Objective</h3>
            <p className="text-slate-700 text-sm leading-relaxed">
              Win chips by having the best hand at showdown, or by making all other players fold. In no-limit Hold&apos;em you can bet any amount up to your full stack at any time.
            </p>
          </section>

          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Game flow</h3>
            <ul className="text-slate-700 text-sm space-y-2 list-disc pl-4">
              <li><strong className="text-slate-600">Blinds:</strong> Before each hand, the two players to the left of the dealer post the small blind and big blind.</li>
              <li><strong className="text-slate-600">Pre-flop:</strong> You receive two hole cards. First betting round (everyone can fold, call the big blind, or raise).</li>
              <li><strong className="text-slate-600">Flop:</strong> Three community cards are dealt. Second betting round.</li>
              <li><strong className="text-slate-600">Turn:</strong> One more community card. Third betting round.</li>
              <li><strong className="text-slate-600">River:</strong> Final community card. Fourth betting round.</li>
              <li><strong className="text-slate-600">Showdown:</strong> Remaining players reveal their hands. Best five-card hand wins the pot.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Actions</h3>
            <ul className="text-slate-700 text-sm space-y-1.5 list-none">
              <li><strong className="text-slate-600">Fold</strong> — Drop out of the hand and give up your cards.</li>
              <li><strong className="text-slate-600">Check</strong> — Stay in without betting (only when no one has bet this round).</li>
              <li><strong className="text-slate-600">Bet</strong> — Put chips into the pot (first to act in a round).</li>
              <li><strong className="text-slate-600">Call</strong> — Match the current bet to stay in.</li>
              <li><strong className="text-slate-600">Raise</strong> — Increase the bet; others must call the new amount or fold.</li>
              <li><strong className="text-slate-600">All-in</strong> — Bet your entire stack. You can only win up to what each opponent has put in for that hand.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Hand rankings</h3>
            <p className="text-slate-500 text-xs mb-3">Best (1) to worst (10). Examples use cards from the deck.</p>
            <ol className="space-y-4 text-sm">
              {HAND_RANKINGS.map(({ rank, name, desc, cards }) => (
                <li key={rank} className="flex gap-3 items-start">
                  <span
                    className="shrink-0 w-6 h-6 rounded-full bg-[#e0e5ec] flex items-center justify-center text-[10px] font-bold text-slate-500"
                    style={{ boxShadow: 'inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.4)' }}
                  >
                    {rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-1">
                      {cards.map((c) => (
                        <Image
                          key={c}
                          src={`/BlackJack/Cards/PNG/${c}.png`}
                          alt={c}
                          width={36}
                          height={50}
                          className="rounded shadow-sm object-contain"
                        />
                      ))}
                    </div>
                    <span className="font-bold text-slate-700">{name}</span>
                    <span className="text-slate-600"> — {desc}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="p-4 border-t border-slate-300/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-bold uppercase tracking-widest text-xs text-white transition-all duration-200 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', boxShadow: '2px 2px 6px rgba(0,0,0,0.2)' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
