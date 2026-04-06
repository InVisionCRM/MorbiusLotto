# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Key contracts: Lottery6of55, Plinko, Blackjack, Keno, MorbiusTournament, TournamentPrizeEscrowV3
- Contract addresses centralized in `lib/contracts.ts`

## Key Patterns

**Wagmi wallet popups**: Never call `writeContractAsync` after an `await` (e.g., `waitForTransactionReceipt`) — this loses the user-gesture context and the wallet popup won't appear. Use a two-step UI flow with separate user-initiated clicks.

**Fee distribution** (applied on payouts/withdrawals, consistent across Blackjack, Plinko, Keno, Lottery): 1.25% MORBIUS holder distribution, 0.5% burn, 1.75% platform/house, 1.5% LP holders. Total: 5% fee on payouts. The old "70/10/10/5/5" split was incorrect — do not use it.

**PulseChain / Solidity**: PLS behaves exactly like ETH. `msg.value` is in beats (= wei). No wrappers needed. Unmodified Ethereum contracts deploy and run without changes.

**Currency**: The in-game currency ticker is **MORBIUS** — never abbreviate as MRB. Display as "MORBIUS" in all UI labels and code comments.

**PulseChain APIs**:
- Token search: `api.scan.pulsechain.com/api/v2/search?q=`
- Token details: `api.scan.pulsechain.com/api/v2/tokens/{address}`
- Logo fallback: DexScreener API

**Avatar / cosmetics (planned follow-ups)**:
- **Animations**: hair/features drifting off-head during motion — revisit anchoring / rigging in `AvatarPreview` later.
- **Props**: expand mouth/hand props (e.g. cigar + smoke); easier authoring pipeline later. Picker option lists live in `lib/avatar-editor-options.ts`; catalog + `AvatarPreview` render paths stay separate — props work does not conflict with that file.
