# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Frontend (Next.js 16)
npm run dev          # Development server on port 3000
npm run build        # Production build (bypasses TS errors)
npm run start        # Run production build
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix

# Smart Contracts (Hardhat)
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy-6of55-v2.js --network pulsechain

# Blackjack Server (Express + WebSocket)
cd server
npm run dev          # Development with auto-reload (port 3001)
npm run build        # TypeScript compilation
npm start            # Production server
```

## Architecture Overview

This is a **Web3 casino platform** on **PulseChain** (EVM-compatible, Chain ID 369). MORBIUS tokens are the primary game currency.

### Stack
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + Radix UI
- **Blockchain:** Wagmi v2 + Viem + RainbowKit
- **Backend (Blackjack):** Express + WebSocket + PostgreSQL (Neon)
- **Contracts:** Solidity 0.8.28 + Hardhat

### Games & Contract Addresses
| Game | Address | Hook |
|------|---------|------|
| Plinko | `0x37B1db8F06870BFFeFed862C06535BEFc4383ff8` | `use-plinko-contract.ts` |
| Blackjack | `0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080` | `use-blackjack-contract.ts` |
| Big Wheel | `0x53331B63ef24904Ea470Cf07b924c7C13A699d8F` | `use-bigwheel-contract.ts` |
| Lottery (6/55) | `0xD66b4489fbfF99A8d62f969203899840F2ec69c5` | `use-lottery-6of55.ts` |
| Keno | `0x734A1460b4131F8cFE4950894Be89d1a852c957A` | `lib/keno-abi.ts` |

### Key Tokens
- **MORBIUS:** `0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1` (18 decimals)
- **WPLS:** `0xA1077a294dDE1B09bB078844df40758a5D0f9a27`

### Project Structure
- `app/` - Next.js App Router (game pages: `/PLINKO`, `/BLACKJACK`, `/BIG-WHEEL`, `/lottery`, `/keno`)
- `components/` - React components organized by game (PLINKO/, BLACKJACK/, BIG-WHEEL/, etc.)
- `hooks/` - Contract interaction hooks and game logic
- `lib/` - Utilities, contract addresses (`contracts.ts`), wagmi config, WebSocket client
- `abi/` - Contract ABIs (TypeScript and JSON)
- `contracts/` - Solidity contracts and Hardhat deployment scripts
- `server/` - Blackjack WebSocket server (Express + PostgreSQL)
- `docs/` - Comprehensive game and contract documentation

### Revenue Distribution
All game revenue splits: 5% Keeper + 5% Deployer + 10% Burn + 10% MegaBank + 70% Player Pool

## PulseChain Notes

PulseChain is a full Ethereum fork. Solidity contracts work identically—no special handling needed:
- `msg.value` contains PLS in beats (1 PLS = 1e9 beats, like wei)
- Gas paid in PLS
- RPC: `https://rpc.pulsechain.com`

## Blackjack Server

The Blackjack game uses a separate WebSocket server for real-time gameplay with provably fair HMAC-SHA256 random generation.

- WebSocket: `ws://localhost:3001?address=<player_address>`
- REST: `/health`, `/api/player/:address/stats`, `/api/game/:gameId/verify`
- Database: PostgreSQL (Neon) - schema in `server/schema.sql`

## Build Notes

- TypeScript strict mode is disabled; build uses `TSC_COMPILE_ON_ERROR=true`
- ESLint has relaxed rules
- Webpack fallbacks configured for node/react-native dependencies
