/**
 * Blackjack house-edge simulation using the same V2 RNG as production.
 *
 * Uses:
 * - ProvablyFairService.fisherYatesShuffle(serverSeed, clientSeed, nonce) for deck
 * - ProvablyFairService.calculateHandTotalV2 / isNaturalBlackjackV2 for totals and BJ
 * - Same deal order as server: player, dealer, player, dealer (deck indices 0,1,2,3)
 * - Dealer hits soft 17; blackjack pays 3:2; win 1:1, push return stake
 *
 * Player strategy: basic strategy hit/stand only (no split/double). So house
 * edge will be higher than full basic strategy (~0.5%); expect ~3–4% with
 * hit/stand only.
 *
 * Run from server directory:
 *   npm run simulate:blackjack [numHands]
 *   npx ts-node src/scripts/simulate-blackjack-house-edge.ts [numHands]
 * Default 100_000 hands. Example:
 *   npm run simulate:blackjack -- 500000
 */

import { ProvablyFairService } from '../services/provably-fair.service';
import crypto from 'crypto';

const pf = new ProvablyFairService();

// Fixed seeds for reproducible run; each game uses nonce = game number (fresh deck per hand)
const SERVER_SEED = crypto.randomBytes(32).toString('hex');
const CLIENT_SEED = 'simulation';

function cardIndexToRank(idx: number): number {
  return (idx % 13) + 1;
}

/** Dealer upcard "value" for basic strategy: 2-10, 11 for Ace */
function dealerUpcardValue(cardIdx: number): number {
  const rank = cardIndexToRank(cardIdx);
  return rank === 1 ? 11 : Math.min(rank, 10);
}

/**
 * Basic strategy hit/stand (no double/split).
 * Stand on 17+; stand on 12-16 when dealer shows 2-6; otherwise hit.
 */
function shouldHit(
  total: number,
  isSoft: boolean,
  dealerUpcardVal: number
): boolean {
  if (total >= 17) return false;
  if (total >= 12 && total <= 16 && dealerUpcardVal >= 2 && dealerUpcardVal <= 6)
    return false;
  return true;
}

function runOneHand(deck: number[], position: { current: number }): { payout: number; wagered: number } {
  const wagered = 1;
  // Deal: player 0,2; dealer 1,3
  const playerCards = [deck[position.current++], deck[position.current++]];
  const dealerCards = [deck[position.current++], deck[position.current++]];

  const playerTotal = pf.calculateHandTotalV2(playerCards);
  const dealerTotal = pf.calculateHandTotalV2(dealerCards);
  const playerBJ = pf.isNaturalBlackjackV2(playerCards);
  const dealerBJ = pf.isNaturalBlackjackV2(dealerCards);

  // Immediate outcomes
  if (playerBJ && dealerBJ) return { payout: 1, wagered };
  if (playerBJ) return { payout: 2.5, wagered };
  if (dealerBJ) return { payout: 0, wagered };

  // Player turn (basic strategy)
  let playerTotalNow = playerTotal.total;
  let playerHasAce = playerTotal.hasAce;
  const dealerUpcardVal = dealerUpcardValue(dealerCards[0]);

  while (shouldHit(playerTotalNow, playerHasAce, dealerUpcardVal)) {
    const card = deck[position.current++];
    playerCards.push(card);
    const next = pf.calculateHandTotalV2(playerCards);
    playerTotalNow = next.total;
    playerHasAce = next.hasAce;
    if (playerTotalNow > 21) {
      // Bust
      return { payout: 0, wagered };
    }
  }

  // Dealer turn (hit soft 17)
  const dealerHand = [...dealerCards];
  while (true) {
    const d = pf.calculateHandTotalV2(dealerHand);
    if (d.total >= 17 && !(d.total === 17 && d.hasAce)) break;
    dealerHand.push(deck[position.current++]);
  }

  const finalDealerTotal = pf.calculateHandTotalV2(dealerHand).total;

  if (finalDealerTotal > 21) return { payout: 2, wagered };
  if (playerTotalNow > finalDealerTotal) return { payout: 2, wagered };
  if (playerTotalNow < finalDealerTotal) return { payout: 0, wagered };
  return { payout: 1, wagered };
}

function main(): void {
  const numHands = parseInt(process.argv[2] || '100000', 10) || 100000;
  let totalWagered = 0;
  let totalReturned = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let blackjacks = 0;

  const start = Date.now();
  for (let game = 0; game < numHands; game++) {
    const deck = pf.fisherYatesShuffle(SERVER_SEED, CLIENT_SEED, game);
    const position = { current: 0 };
    const { payout, wagered } = runOneHand(deck, position);
    totalWagered += wagered;
    totalReturned += payout;
    if (payout === 2.5) blackjacks++;
    else if (payout === 2) wins++;
    else if (payout === 1) pushes++;
    else losses++;
  }
  const elapsed = Date.now() - start;

  const rtp = totalWagered > 0 ? totalReturned / totalWagered : 0;
  const houseEdge = 1 - rtp;

  console.log('--- Blackjack house-edge simulation (V2 RNG) ---');
  console.log('RNG: Fisher-Yates 52-card deck (same as production ProvablyFairService)');
  console.log('Hands:', numHands.toLocaleString());
  console.log('Time:', (elapsed / 1000).toFixed(2), 's');
  console.log('Total wagered:', totalWagered.toLocaleString());
  console.log('Total returned:', totalReturned.toLocaleString());
  console.log('RTP:', (rtp * 100).toFixed(4) + '%');
  console.log('House edge:', (houseEdge * 100).toFixed(4) + '%');
  console.log('Wins:', wins, '| Losses:', losses, '| Pushes:', pushes, '| Blackjacks:', blackjacks);
  console.log('---');
}

main();
