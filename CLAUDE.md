# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Prototypes ARE the spec — reproduce them faithfully (READ FIRST)

When the user has built a prototype/mockup together with Claude (e.g. `public/poker-mobile-lab.html`, `public/avatar-lab.html`, any `public/*-lab.html`), **that prototype is the approved design and the source of truth for the port.** It represents real, often day-long, user work. When implementing it in the app:

- **Reproduce the prototype faithfully** — its layout, components, visuals, interactions, and feel. Build *that* design, not an approximation of it.
- **Do NOT substitute or repurpose existing app components as a shortcut**, and do NOT "just reposition the old UI." Bolting new coordinates onto the existing components instead of building the prototype's design **discards the user's work and is unacceptable.**
- **Faithfulness to the agreed design outranks saving effort, code, or tokens.** Never choose the quickest/cheapest implementation path when it diverges from what was designed. If the faithful port is large, do it in batches — surface the scope honestly; never silently shortcut it.
- If you genuinely cannot verify the result (no local render available), **say so up front and get the user's eyes early** — do not quietly ship a divergent shortcut and present it as the port.

This rule exists because a faithful port (the poker mobile lab) was skipped in favor of a reuse-the-old-UI shortcut. It cost the user a day of design work and their trust. It must never happen again. Being genuinely helpful — delivering what was actually designed and asked for — always comes before minimizing tokens or effort.

## Commands

```bash
# Frontend (Next.js) - run from repo root
npm run dev          # Dev server with Turbopack
npm run build        # Production build (uses Webpack, not Turbopack)
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix

# Backend (Express) - run from repo root or server/
cd server && npm run dev    # Start Express + WebSocket server

# Database migrations - run from repo root
node server/run-migration.js migrations/<filename>.sql
# Loads .env from server/; uses DATABASE_URL. Apply migrations in numeric order.

# Smart contracts - run from contracts/
cd contracts && npx hardhat compile
cd contracts && npx hardhat test
```

**Build note**: `TSC_COMPILE_ON_ERROR=true` is set — TypeScript errors do not fail the build. Pre-existing errors in unrelated files are normal. Verify your specific changes by transpiling with `ts.transpileModule()`.

## Architecture

**MORBlotto** is a Web3 casino gaming platform on PulseChain (chainId 369, EVM-compatible Ethereum fork). It has three main layers:

### Frontend — Next.js App Router (`app/`, `components/`, `hooks/`)
- Games: Lottery 6-of-55, Plinko (Matter.js physics), Blackjack (single + multiplayer), Poker, Keno
- Other tools: Morb-It (meme maker, not a game)
- Wallet integration via Wagmi v2 + RainbowKit; contracts interact via Viem
- Custom hooks in `hooks/` encapsulate all contract reads/writes and real-time state
- Shared UI primitives in `components/ui/` (Shadcn/Radix); game-specific components grouped by game name
- Path alias `@/*` resolves to repo root

### Backend — Express + WebSocket (`server/src/`)
- Real-time game state, tournament management, and chat via WebSocket (`websocket.service.ts`)
- Game logic validation in service files (`blackjack-game.service.ts`, `poker-game.service.ts`, etc.)
- PostgreSQL via Neon serverless (`database.service.ts`); 42+ migrations in `server/migrations/`
- Tournament lifecycle (create → join → play → payout/cancel) managed by `tournament.service.ts`

### Smart Contracts (`contracts/`, `abi/`)
- Solidity contracts deployed on PulseChain; ABIs compiled to `abi/`
- Key contracts: Lottery6of55, Plinko, Blackjack, Keno, MorbiusTournament, TournamentPrizeEscrow (V5 live, V6 gas-optimized successor pending deploy)
- Contract addresses centralized in `lib/contracts.ts`

## Key Patterns

**Wagmi wallet popups**: Never call `writeContractAsync` after an `await` (e.g., `waitForTransactionReceipt`) — this loses the user-gesture context and the wallet popup won't appear. Use a two-step UI flow with separate user-initiated clicks.

**Economy (updated 2026-07 — per owner, overrides older docs/code)**: The 5% payout fee and its splits (holder distribution, burn, platform, LP) are **GONE**. There is **no burn** and **no holder/LP distribution** anymore — do not reference burns, "MORBIUS burned" counters, fee splits, or holder payouts in UI copy or new code (hooks like `use-morbius-burned.ts` and burn UI are legacy). Player value-back is now the **VIP tier rakeback system** (Bronze 5% → Silver 8% → Gold 12% → Platinum 16% → Diamond 20% → Obsidian 25%; config from `/api/vip/config`, user tier from `/api/vip/tier/{address}`).

**Games are NOT on-chain (updated 2026-07)**: Game logic runs server-side (Express backend + PostgreSQL). Do not describe games, draws, or payouts as "on-chain" or "provably fair on-chain" in UI copy. The MORBIUS token itself lives on PulseChain (wallet connect, balances, price via DexScreener remain real); the on-chain game contracts in `contracts/` are legacy.

**PulseChain / Solidity**: PLS behaves exactly like ETH. `msg.value` is in beats (= wei). No wrappers needed. Unmodified Ethereum contracts deploy and run without changes.

**Currency**: The in-game currency ticker is **MORBIUS** — never abbreviate as MRB. Display as "MORBIUS" in all UI labels and code comments.

**Poker all-in runout (server-driven)**: When chevtek auto-resolves multiple streets in one tick (all-in showdown), the server *paces* the reveal by emitting separate flop / turn / river / showdown broadcasts on a timer chain (`scheduleRunout` in `poker-game.service.ts`). Hole cards appear at the first runout frame (`showdownHands` is exposed once `runout_resolved_at` is set in DB, even while `street` is still flop/turn/river). The client just renders whatever street the server says — there is **no** client-side staged reveal anymore. If you find yourself adding `setTimeout` reveal logic in `PokerTable.tsx`, you're on the wrong path; the timing belongs on the server. `setRunoutDelaysForTesting(false)` (default under NODE_ENV=test) collapses the runout to a single inline `persistShowdown` call so existing tests keep their fast/synchronous assertions.

**Poker provably-fair shuffle**: Each hand's deck is deterministically derived from `pfService.fisherYatesShuffle(serverSeed, clientSeed, 0)` — chevtek's `Math.random()` shuffle is bypassed by overriding `table.newDeck` on the instance before `dealCards()`. The plaintext `serverSeed` is hidden in `poker_hand_pending_seeds` during the hand and only published to `poker_hands.server_seed` at showdown (via `persistShowdown`). The verify endpoint `GET /api/poker/verify/:handId` returns the commitment, the revealed seed, and the deck-deal recipe so anyone can independently confirm card order wasn't rigged. **Never re-introduce `Math.random()`-driven dealing** — search for any `table.deck = newDeck()` pattern and route it through `pfService.fisherYatesShuffle` instead.

**PulseChain APIs**:
- Token search: `api.scan.pulsechain.com/api/v2/search?q=`
- Token details: `api.scan.pulsechain.com/api/v2/tokens/{address}`
- Logo fallback: DexScreener API

**Avatar / cosmetics (planned follow-ups)**:
- **Animations**: hair/features drifting off-head during motion — revisit anchoring / rigging in `AvatarPreview` later.
- **Props**: expand mouth/hand props (e.g. cigar + smoke); easier authoring pipeline later. Picker option lists live in `lib/avatar-editor-options.ts`; catalog + `AvatarPreview` render paths stay separate — props work does not conflict with that file.
