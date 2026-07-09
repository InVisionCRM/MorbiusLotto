/**
 * how-to-content.tsx — the single source of truth for every game's "How to
 * play" guide. Each entry feeds the shared <GameHowTo/> template (homepage
 * game art + pills + steps + notes). Content is server-side accurate: provably
 * fair via server-seed commit/reveal, no per-bet or per-payout fee, VIP
 * rakeback on losses. No blockchain / smart-contract / fee-split claims.
 */

import React from 'react'
import type { GameHowToProps } from '@/components/shared/GameHowTo'
import {
  CrashScene, DiceScene, DiceX2Scene, MinesScene, LimboScene, TowersScene,
  KenoScene, HiLoScene, ChickenScene, BaccaratScene, VideoPokerScene,
  ThreeCardScene, DragonTigerScene, AndarBaharScene, PachinkoScene,
  CascadeScene, FirewalkScene, HeistScene, GreedDiceScene, CipherScene,
  PlinkoScene,
} from '@/components/home2/scenes'

export type HowToEntry = Omit<GameHowToProps, 'className' | 'children'>

/** Shared "good to know" notes — true for every game. */
const FAIR = {
  title: 'Provably fair.',
  body: 'The result comes from a hashed server seed committed before you bet, plus your client seed and a nonce — you can re-derive and verify any round in your browser.',
}
const FEES = {
  title: 'No fees.',
  body: 'No per-bet or per-payout fee — just a small built-in house edge. Losing bets earn VIP rakeback based on your tier.',
}

const CORE = [{ label: 'Provably Fair' }, { label: 'Instant Play' }, { label: 'VIP Rakeback', muted: true }]

export const HOWTO: Record<string, HowToEntry> = {
  crash: {
    name: 'Crash',
    tagline: 'Ride the rocket — cash out before it crashes.',
    accent: '#00ffa3',
    art: <CrashScene />,
    pills: [{ label: 'Provably Fair' }, { label: 'Auto-Cashout' }, { label: 'Up to 100×', muted: true }, { label: 'VIP Rakeback', muted: true }],
    steps: [
      { title: 'Place your bet', detail: 'Set your MORBIUS wager before the round launches.' },
      { title: 'Watch it climb', detail: 'The multiplier rises from 1.00× along the same curve for everyone.' },
      { title: 'Cash out in time', detail: 'Tap Cash Out to lock in bet × the current multiplier.' },
      { title: 'Beat the crash', detail: 'If it crashes before you cash out, the bet is lost.' },
    ],
    notes: [
      { title: 'Auto-cashout.', body: 'Set a target and the server banks your win the instant the curve hits it — even if you disconnect.' },
      FAIR,
    ],
  },
  dice: {
    name: 'Dice',
    tagline: 'Roll over or under your number — you set the odds.',
    accent: '#fbbf24',
    art: <DiceScene />,
    pills: [...CORE, { label: 'Auto-Bet', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager.' },
      { title: 'Pick your target', detail: 'Slide the number and choose roll over or under — that sets your win chance and multiplier.' },
      { title: 'Roll', detail: 'A number from 0–100 is drawn.' },
      { title: 'Win instantly', detail: 'Land on the right side of your target to win bet × multiplier.' },
    ],
    notes: [{ title: 'Your call, your odds.', body: 'A slimmer win chance pays a bigger multiplier, and vice-versa.' }, FEES],
  },
  dicex2: {
    name: 'Dice X2',
    tagline: 'Set a band with two handles — land inside to win.',
    accent: '#a78bfa',
    art: <DiceX2Scene />,
    pills: [...CORE, { label: 'Auto-Bet', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager.' },
      { title: 'Drag the band', detail: 'Two handles set a win band; its width is your win chance.' },
      { title: 'Roll', detail: 'A number from 0–100 is drawn.' },
      { title: 'Win inside the band', detail: 'Land within your band to win bet × multiplier.' },
    ],
    notes: [{ title: 'Width sets the odds.', body: 'A narrower band pays more; sliding it left or right doesn\'t change the odds.' }, FEES],
  },
  mines: {
    name: 'Mines',
    tagline: 'Uncover gems, dodge the mines, cash out any time.',
    accent: '#f87171',
    art: <MinesScene />,
    pills: [...CORE, { label: 'Cash Out Anytime', muted: true }],
    steps: [
      { title: 'Set bet & mines', detail: 'Choose your wager and how many mines hide on the grid — more mines, bigger multipliers.' },
      { title: 'Reveal tiles', detail: 'Each safe tile you flip raises your multiplier.' },
      { title: 'Cash out', detail: 'Bank your winnings any time before hitting a mine.' },
      { title: 'Avoid the mines', detail: 'Hit one and the round ends — the bet is lost.' },
    ],
    notes: [FAIR, FEES],
  },
  limbo: {
    name: 'Limbo',
    tagline: 'Pick a target multiplier — win if the round clears it.',
    accent: '#34d399',
    art: <LimboScene />,
    pills: [...CORE, { label: 'Up to 1000×', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager.' },
      { title: 'Choose a target', detail: 'Set the multiplier you\'re aiming for — up to 1000×.' },
      { title: 'Launch', detail: 'A random multiplier is drawn for the round.' },
      { title: 'Clear it to win', detail: 'If the round\'s multiplier is at least your target, you win bet × target.' },
    ],
    notes: [{ title: 'Higher aim, rarer hit.', body: 'The bigger your target, the less often it lands — and the bigger the payout when it does.' }, FEES],
  },
  towers: {
    name: 'Towers',
    tagline: 'Climb the tower — cash out on any floor.',
    accent: '#a78bfa',
    art: <TowersScene />,
    pills: [...CORE, { label: 'Cash Out Anytime', muted: true }],
    steps: [
      { title: 'Set bet & difficulty', detail: 'Higher difficulty means fewer safe tiles per row but bigger steps.' },
      { title: 'Pick a tile each row', detail: 'A safe tile climbs you one floor and raises your multiplier.' },
      { title: 'Cash out', detail: 'Bank your winnings on any floor before you climb again.' },
      { title: 'Mind the trap', detail: 'Hit a trap tile and the climb ends — the bet is lost.' },
    ],
    notes: [FAIR, FEES],
  },
  keno: {
    name: 'Keno',
    tagline: 'Pick your numbers — more hits, bigger pay.',
    accent: '#22d3ee',
    art: <KenoScene />,
    pills: [...CORE, { label: 'Pick up to 10', muted: true }],
    steps: [
      { title: 'Pick your numbers', detail: 'Choose 1–10 spots from the grid of 40.' },
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager.' },
      { title: 'Draw', detail: '10 winning numbers are drawn.' },
      { title: 'Get paid on hits', detail: 'Your payout scales with how many of your picks match — see the paytable.' },
    ],
    notes: [FAIR, FEES],
  },
  hilo: {
    name: 'Hi-Lo',
    tagline: 'Higher or lower — chain guesses to grow the multiplier.',
    accent: '#22d3ee',
    art: <HiLoScene />,
    pills: [...CORE, { label: 'Cash Out Anytime', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager and see the starting card.' },
      { title: 'Call it', detail: 'Guess whether the next card is higher or lower — the odds set each step\'s multiplier.' },
      { title: 'Chain wins', detail: 'Every correct call multiplies your winnings and deals the next card.' },
      { title: 'Cash out', detail: 'Bank any time — a wrong guess ends the run.' },
    ],
    notes: [FAIR, FEES],
  },
  chicken: {
    name: 'Chicken',
    tagline: 'Cross the road — one more lane, one bigger multiplier.',
    accent: '#fbbf24',
    art: <ChickenScene />,
    pills: [...CORE, { label: 'Cash Out Anytime', muted: true }],
    steps: [
      { title: 'Set bet & difficulty', detail: 'Higher difficulty means more traffic but bigger steps.' },
      { title: 'Step forward', detail: 'Each safe lane you cross raises your multiplier.' },
      { title: 'Cash out', detail: 'Bank your winnings before the next step.' },
      { title: 'Don\'t get caught', detail: 'Get hit and the round ends — the bet is lost.' },
    ],
    notes: [{ title: 'Sealed at the start.', body: 'The traffic is committed the moment you bet — it can\'t shift under you.' }, FEES],
  },
  baccarat: {
    name: 'Baccarat',
    tagline: 'Bet Player, Banker, or Tie — closest to 9 wins.',
    accent: '#fbbf24',
    art: <BaccaratScene />,
    pills: [{ label: 'Provably Fair' }, { label: 'Instant Play' }, { label: 'Player · Banker · Tie', muted: true }, { label: 'VIP Rakeback', muted: true }],
    steps: [
      { title: 'Place your bet', detail: 'Back the Player, the Banker, or a Tie.' },
      { title: 'Deal', detail: 'Both hands are dealt; a third card may be drawn by the standard rules.' },
      { title: 'Closest to 9 wins', detail: 'Player and Banker pay even money; Tie pays more but hits rarely.' },
    ],
    notes: [FAIR, FEES],
  },
  videopoker: {
    name: 'Video Poker',
    tagline: 'Jacks or better — hold, draw, get paid.',
    accent: '#22d3ee',
    art: <VideoPokerScene />,
    pills: [{ label: 'Provably Fair' }, { label: 'Instant Play' }, { label: 'Jacks or Better', muted: true }, { label: 'VIP Rakeback', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager and get five cards.' },
      { title: 'Hold what you want', detail: 'Keep the cards you like; discard the rest.' },
      { title: 'Draw', detail: 'New cards replace the ones you dropped.' },
      { title: 'Get paid', detail: 'A pair of Jacks or better pays — bigger hands pay much more (see the paytable).' },
    ],
    notes: [FAIR, FEES],
  },
  threecard: {
    name: 'Three Card Poker',
    tagline: 'Three cards each — beat the dealer, fast.',
    accent: '#34d399',
    art: <ThreeCardScene />,
    pills: [{ label: 'Provably Fair' }, { label: 'Instant Play' }, { label: 'vs Dealer', muted: true }, { label: 'VIP Rakeback', muted: true }],
    steps: [
      { title: 'Ante up', detail: 'Place your ante and get three cards.' },
      { title: 'Play or fold', detail: 'Match your ante to Play, or fold to forfeit it.' },
      { title: 'Dealer reveals', detail: 'The dealer must qualify with Queen-high or better.' },
      { title: 'Best hand wins', detail: 'Beat a qualifying dealer to win; strong hands earn bonus pay.' },
    ],
    notes: [FAIR, FEES],
  },
  dragontiger: {
    name: 'Dragon Tiger',
    tagline: 'One card each — pick the higher side.',
    accent: '#fb923c',
    art: <DragonTigerScene />,
    pills: [{ label: 'Provably Fair' }, { label: 'Instant Play' }, { label: 'Dragon · Tiger · Tie', muted: true }, { label: 'VIP Rakeback', muted: true }],
    steps: [
      { title: 'Pick a side', detail: 'Bet Dragon, Tiger, or a Tie.' },
      { title: 'Deal', detail: 'One card goes to each side.' },
      { title: 'Higher rank wins', detail: 'Suits don\'t matter and Ace is low, so a King is strongest.' },
    ],
    notes: [FAIR, FEES],
  },
  andarbahar: {
    name: 'Andar Bahar',
    tagline: 'Pick a side — first to match the cut card wins.',
    accent: '#a78bfa',
    art: <AndarBaharScene />,
    pills: [{ label: 'Provably Fair' }, { label: 'Instant Play' }, { label: 'Andar · Bahar', muted: true }, { label: 'VIP Rakeback', muted: true }],
    steps: [
      { title: 'See the cut card', detail: 'A single card is turned face-up.' },
      { title: 'Pick a side', detail: 'Bet whether its match lands on Andar or Bahar.' },
      { title: 'Deal it out', detail: 'Cards are dealt one at a time to alternating sides.' },
      { title: 'First match wins', detail: 'Whichever side draws the matching rank first pays your bet.' },
    ],
    notes: [FAIR, FEES],
  },
  pachinko: {
    name: 'Pachinko',
    tagline: 'Drop a ball through the pins into a multiplier.',
    accent: '#f472b6',
    art: <PachinkoScene />,
    pills: [...CORE, { label: 'Center Jackpot', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager.' },
      { title: 'Drop the ball', detail: 'It bounces down through the pins into one of nine pockets.' },
      { title: 'Land a pocket', detail: 'Each pocket pays its multiplier — the outer pockets pay most, the rare center gate is the jackpot.' },
    ],
    notes: [FAIR, FEES],
  },
  cascade: {
    name: 'Cascade',
    tagline: 'Match, pop, and let the wins chain down.',
    accent: '#2dd4bf',
    art: <CascadeScene />,
    pills: [...CORE, { label: 'Combo Multiplier', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager and drop the grid.' },
      { title: 'Clusters pay & pop', detail: 'Any big enough cluster of matching gems pays and clears.' },
      { title: 'Chains build up', detail: 'Gems tumble down and new ones fall in — each fresh cluster raises the combo multiplier.' },
      { title: 'Collect the total', detail: 'When the chain stops, your winnings are paid.' },
    ],
    notes: [{ title: 'No decisions.', body: 'A drop plays out on its own — the whole cascade is fixed the moment you bet.' }, FEES],
  },
  firewalk: {
    name: 'Firewalk',
    tagline: 'Cross the coals — every step raises the heat.',
    accent: '#fb923c',
    art: <FirewalkScene />,
    pills: [...CORE, { label: 'Cash Out Anytime', muted: true }],
    steps: [
      { title: 'Set bet & pace', detail: 'Pace is how many stones you commit per move — bolder moves pay more.' },
      { title: 'Step across', detail: 'Each safe stone raises your multiplier.' },
      { title: 'Cash out', detail: 'Bank your winnings before the next step.' },
      { title: 'Don\'t get burned', detail: 'Land on a hot coal and the walk ends — the bet is lost.' },
    ],
    notes: [{ title: 'Sealed at the start.', body: 'The coals are committed the moment you bet — they can\'t change under you.' }, FEES],
  },
  heist: {
    name: 'Heist',
    tagline: 'Crack the vault room by room — bank before the alarm.',
    accent: '#fbbf24',
    art: <HeistScene />,
    pills: [...CORE, { label: 'Cash Out Anytime', muted: true }],
    steps: [
      { title: 'Set bet & difficulty', detail: 'Harder jobs wire more doors to the alarm but pay bigger.' },
      { title: 'Crack a door', detail: 'A safe door advances you to the next room and compounds your multiplier.' },
      { title: 'Cash out', detail: 'Grab the loot any time before you trip an alarm.' },
      { title: 'Mind the alarm', detail: 'Trip one and the job\'s over — the bet is lost.' },
    ],
    notes: [FAIR, FEES],
  },
  greeddice: {
    name: 'Greed Dice',
    tagline: 'Roll, bank points, and push your luck.',
    accent: '#fbbf24',
    art: <GreedDiceScene />,
    pills: [...CORE, { label: 'Push Your Luck', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager and roll.' },
      { title: 'Score & bank', detail: 'Scoring dice bank automatically — 1s and 5s score, and triples pay big.' },
      { title: 'Roll again or stop', detail: 'Keep rolling to build points, or cash out your multiplier.' },
      { title: 'Beware the farkle', detail: 'Roll no scoring dice and you farkle — the bet is lost.' },
    ],
    notes: [FAIR, FEES],
  },
  cipher: {
    name: 'Cipher',
    tagline: 'Break the secret code before your guesses run out.',
    accent: '#34d399',
    art: <CipherScene />,
    pills: [...CORE, { label: 'Crack Ladder', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose your MORBIUS wager — a secret code of coloured pegs is sealed.' },
      { title: 'Make a guess', detail: 'Each guess returns exact pegs (right colour, right slot ●) and partial pegs (right colour, wrong slot ○).' },
      { title: 'Narrow it down', detail: 'Use the clues to close in on the code.' },
      { title: 'Crack to win', detail: 'Solve it and win the crack-ladder payout for the try you cracked on — the sooner, the bigger.' },
    ],
    notes: [{ title: 'Fixed from the start.', body: 'The code is committed the moment you bet — it can\'t change as you guess.' }, FEES],
  },
  plinko: {
    name: 'Plinko',
    tagline: 'Drop the ball, ride the pegs, catch a multiplier.',
    accent: '#22d3ee',
    art: <PlinkoScene />,
    pills: [...CORE, { label: '3 Risk Levels', muted: true }],
    steps: [
      { title: 'Set your bet', detail: 'Choose how many MORBIUS to wager.' },
      { title: 'Pick a risk level', detail: 'Low, Medium, or High — higher risk, bigger top multipliers.' },
      { title: 'Drop the ball', detail: 'It bounces through the pegs into a multiplier slot.' },
      { title: 'Get paid instantly', detail: 'Your payout is the bet × the slot it lands in.' },
    ],
    payouts: {
      heading: 'Top multipliers',
      rows: [
        { label: 'Low', value: 'up to 16×', color: '#34d399' },
        { label: 'Medium', value: 'up to 110×', color: '#fbbf24' },
        { label: 'High', value: 'up to 200×', color: '#f87171' },
      ],
    },
    notes: [
      { title: 'Committed before the drop.', body: 'Each risk level has a published multiplier table, and the slot is fixed before the ball falls — the physics just replays into it.' },
      FEES,
    ],
  },
}
