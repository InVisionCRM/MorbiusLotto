# Instant Lottery (`app/lottery`)

This document describes the current instant lottery implementation in MORBlotto: UI flow, play modes, settlement, verification, and key files.

## What This Route Is

- Route: `app/lottery/page.tsx`
- Game: Instant 6-of-55 lottery
- Primary token: `MORBIUS`
- Optional payment path: `PLS` (contract `playLotteryWithPLS`)
- Chain: PulseChain (`chainId 369`)

## Play Modes

The frontend supports two MORBIUS play modes plus one PLS mode:

1. **Direct on-chain (default)**  
   Calls contract `playLottery(numbers, wager)` from wallet.

2. **Provably-fair API mode (optional)**  
   Enabled only when `NEXT_PUBLIC_INSTANT_LOTTERY_PROVABLY_FAIR=true` and backend URL is available.  
   UI calls backend `POST /api/lottery/instant/play`, backend generates winning numbers, then operator submits `resolvePlay(...)`.

3. **PLS mode (on-chain)**  
   Calls contract `playLotteryWithPLS(numbers)` with `msg.value` in raw wei/beats.  
   MORBIUS-equivalent wager is derived via router quote on-chain.

## Frontend Result + Animation Pipeline

After play:

- For direct on-chain modes, UI waits for tx receipt, decodes `InstantLotteryResult` from receipt logs, and immediately forwards the result to animation/UI state.
- `InstantBallDraw` animates all 6 winning balls.
- Result modal opens after draw completion callback.
- Chain watch/history still updates in parallel and becomes source-of-truth.

This avoids delays from waiting only on log indexing or event polling.

## Key Files

- `app/lottery/page.tsx`  
  Route composition, animation orchestration, history + modal wiring.

- `components/lottery/InstantLotteryPlayPanel.tsx`  
  Ticket builder, wager/payment UX, wallet writes, optional API play, receipt decode.

- `components/lottery/ball-draw-simulator/InstantBallDraw.tsx`  
  Winning-number animation state machine.

- `hooks/use-instant-lottery.ts`  
  Contract reads/writes, event watch, recent results load, leaderboard/player stats hooks.

- `server/src/services/instant-lottery.service.ts`  
  Backend provably-fair play and operator `resolvePlay` settlement path.

- `server/src/server.ts`  
  Instant lottery API endpoints, including verification payload with recompute checks.

## API Endpoints Used

- `POST /api/lottery/instant/play` (backend express; provably-fair mode only)
- `GET /api/lottery/instant/play/verify/:txHash` (backend express)
- `GET /api/lottery/instant/verify/:txHash` (Next.js proxy route)
- `GET /api/lottery/top-players`
- `GET /api/lottery/player/:address/stats`

## Contract / Payout Notes

- Contract event: `InstantLotteryResult(player, playerNumbers, winningNumbers, matchCount, wager, grossPayout, netPayout)`
- Current multipliers:
  - 0: `0x`
  - 1: `0.5x`
  - 2: `1.5x`
  - 3: `5x`
  - 4: `15x`
  - 5: `50x`
  - 6: `100x`
- Wager fee split remains contract-defined (5% total, 4-way split in contract).

## Environment Flags

- `NEXT_PUBLIC_LOTTERY_INSTANT_ADDRESS`
- `NEXT_PUBLIC_INSTANT_LOTTERY_PROVABLY_FAIR` (`true` enables API mode for MORBIUS plays)
- `NEXT_PUBLIC_API_URL` (or backend URL routing used by app/server)
- Backend operator key: `LOTTERY_OPERATOR_PRIVATE_KEY` or fallback `SETTLEMENT_PRIVATE_KEY`

## Troubleshooting

- **Ball animation does not show after buy**  
  Check that tx receipt is returning logs and `InstantLotteryResult` is emitted by the configured contract address.

- **Result modal appears late**  
  Confirm direct receipt decode path is active and not blocked by API mode errors.

- **Verification response has null verification fields**  
  `server_seed` may not be revealed yet, or nonce may be outside JS safe integer range for recompute.
