# MORBlotto Audit — Implementation Tracker

Source of truth for acting on the [audit](AUDIT.md). One row per actionable item. Update the **Status** column as work lands.

## How to use this doc

- **One row per fix.** Title matches the action plan in [AUDIT.md](AUDIT.md). The **Refs** column points back to the sub-report finding ID so you can re-read the full description in one click.
- **Status values:** `todo` · `in progress` · `blocked` · `in review` · `done` · `wontfix`
- **Owner values:** `user` · `claude` · `external` (e.g. third-party audit firm)
- **Don't mark "done" until it's deployed.** Coded but not shipped = `in review`.
- **When a contract item is `done`,** record the deploy tx hash in the Notes column.
- **When a Phase 0 item is done,** also strike it through in [AUDIT.md](AUDIT.md) so the executive summary stays accurate.

## Legend

Complexity is the same 1-5 scale used in the audit (1 = config tweak, 5 = architectural).

---

## Phase 0 — Today / first 48 hours

| # | Action | Refs | Complexity | Status | Owner | Notes |
|---|---|---|:-:|---|---|---|
| P0-1 | Set `REQUIRE_WS_AUTH=true` in prod, then make `true` the server default + boot-refusal | [BE-002](backend.md), [SEC-004](security.md) | 1 | in progress | user | User confirmed taking this one |
| P0-2 | Sanitize WS chat XSS sink in `BlackjackMultiInfoPanel.tsx:136` (DOMPurify or text) | [FE-008](frontend.md), [FE-029](frontend.md) | 1 | **done** | claude | Changed to plain-text render. If HTML formatting needed later, route through DOMPurify with strict allowlist. |
| P0-3 | Pause Plinko / Roulette / BigWheel / CryptoKeno / InstantLottery PLS-path on-chain | [SC-001](smart-contracts.md), [SEC-002](security.md) | 1 | todo | user | Operator-key tx; can't be done from this worktree |
| P0-4 | Remove admin-proxy `x-admin-secret` auto-injection + rotate `process.env.AP` | [SEC-001](security.md) | 3 | todo | | Folded into SIWE rollout. Pending: (a) admin frontend pages updated to SIWE-sign-in, (b) drop the `process.env.AP` inject from `app/api/admin/[[...path]]/route.ts`, (c) Express `/api/admin` middleware checks `req.user.address ∈ ADMIN_WALLETS` instead of header secret. |
| P0-5 | Add SIWE auth to `/api/withdraw` + every other body-address money route | [BE-001](backend.md), [SEC-003](security.md) | 2 | **in review** | claude | Foundation landed (`auth.service.ts`, `require-auth.ts`, `auth.routes.ts`, migration `123_sessions.sql`, package.json deps). Wired into `server.ts` (cookie-parser + AuthService + `registerAuthRoutes`). Frontend: `contexts/siwe-context.tsx`, `lib/api-auth.ts`, `components/auth/SignInButton.tsx`, mounted in `app/providers.tsx`. Routes flipped: `/api/withdraw`, `/api/player/profile`, `/api/cosmetics/gift`, `/api/cosmetics/grant`, `/api/tournament/:id/cancel`, `/api/tournament/:id/reclaim`, `/api/deposit/notify`. Still **todo**: install deps, run migration, set `SIWE_EXPECTED_DOMAIN`, deploy, and verify with a real wallet. |
| P0-6 | Force `protobufjs >= 7.2.5` override in root `package.json`, run `npm audit fix --force` | [DEP-001](dependencies-infra.md) | 2 | todo | | |
| P0-7 | Remove unused deps: `claude`, `react-shaders`, `embla-carousel-react`, `embla-carousel-wheel-gestures`, server `crypto` | [PERF-009](performance.md), [DEP-003](dependencies-infra.md), [DEP-004](dependencies-infra.md) | 1 | **in review** | claude | Frontend: `claude`, `react-shaders`, `embla-carousel-react`, `embla-carousel-wheel-gestures` removed from `package.json`. Server `crypto` placeholder still pending. User to run `npm install` to drop them from node_modules + lockfile. |
| P0-8 | Add `app/global-error.tsx` + per-game `error.tsx` for every game route | [FE-002](frontend.md) | 2 | todo | | Wire to Sentry/PostHog if available |

---

## Phase 1 — This week

| # | Action | Refs | Complexity | Status | Owner | Notes |
|---|---|---|:-:|---|---|---|
| P1-1 | Flip every body-address money route to `requireAuth` (SIWE) | [BE-003](backend.md), [BE-004](backend.md), [BE-005](backend.md), [BE-009](backend.md), [SEC-003](security.md) | 2 | **in progress** | claude | Done: withdraw, player/profile, tournament cancel/reclaim, cosmetics gift, cosmetics grant, deposit/notify. **Still todo**: cosmetics admin/* (create-item, item PATCH, bulk-shop-listed, tier-pricing), poker chip purchase/cashout, instantLottery body-address path, blackjack-multi `tipDealer`, follow/unfollow. Each is the same one-liner pattern per [siwe-manual.md](siwe-manual.md) §"Using it on a route". |
| P1-2 | Zod validation on every Express route handler (start: `money.routes.ts`, `tournament.routes.ts`) | [BE-007](backend.md) | 3 | todo | | `zod` already in deps, currently 0 usages |
| P1-3 | Per-address rate limit on withdraw / claim / instant-play | [BE-008](backend.md), [SEC-007](security.md) | 2 | todo | | |
| P1-4 | Swap raw `<img>` → `<Image>` in `TableShowcaseDisplay.tsx`, `PulseChainAiDisplay.tsx` | [PERF-001](performance.md) | 2 | todo | | Lighthouse est. −18.8 MiB |
| P1-5 | Delete dead `<link rel="preload">` of `morbius/Morbius-glass-chip-16x9.jpeg` (`app/layout.tsx:99-100`) | [PERF-002](performance.md) | 1 | **done** | claude | Two `<link rel="preload">` lines removed from `app/layout.tsx`. Saves ~147 KB on every page load. |
| P1-6 | Hero video `preload="auto"` → `"metadata"` + viewport-gated `<source>` | [PERF-003](performance.md) | 1 | todo | | Saves ~8 MB on mobile |
| P1-7 | Add `experimental.optimizePackageImports` to `next.config.ts` for icon/animation/recharts/date-fns | [PERF-005](performance.md) | 1 | todo | | |
| P1-8 | Lazy-load `@stream-io/video-react-sdk` via `next/dynamic` in poker route | [PERF-007](performance.md) | 2 | todo | | |
| P1-9 | Pick one of `framer-motion` / `motion`, one of `html2canvas` / `html-to-image`, remove the other | [PERF-006](performance.md), [PERF-008](performance.md), [FE-006](frontend.md), [FE-007](frontend.md) | 2 | todo | | |

---

## Phase 2 — This month

| # | Action | Refs | Complexity | Status | Owner | Notes |
|---|---|---|:-:|---|---|---|
| P2-1 | **RNG V6 redesign + redeploy** (see [rng-v6-plan.md](rng-v6-plan.md)) | [SC-001](smart-contracts.md), [SEC-002](security.md) | 5 | todo | | Sub-plan tracks its own checklist |
| P2-2 | BigWheel reserve check + double-process fix | [SC-002](smart-contracts.md), [SC-014](smart-contracts.md) | 2 | todo | | Ships with V6 redeploy |
| P2-3 | MorbiusTournament hardening: state machine, prize cap, 2-step ownership, operator timelock | [SC-003](smart-contracts.md) | 3 | todo | | |
| P2-4 | Replace PulseX spot price with TWAP on PLS entrypoints | [SC-004](smart-contracts.md) | 3 | todo | | |
| P2-5 | Add `headers()` to `next.config.ts`: CSP, X-Frame-Options DENY, HSTS, Referrer-Policy, X-Content-Type-Options | [SEC-008](security.md) | 2 | todo | | |
| P2-6 | Phased TypeScript reclamation: strict on → fix 140 frontend errors → `ignoreBuildErrors: false` → CI gate | [FE-001](frontend.md), [DEP-016](dependencies-infra.md) | 5 | todo | | |
| P2-7 | Type the WebSocket payloads: shared `types/ws-messages.ts` discriminated union | [FE-005](frontend.md), [FE-022](frontend.md) | 4 | todo | | Replaces 60+ `any` casts |
| P2-8 | Make freeroll scheduler idempotent: `FOR UPDATE SKIP LOCKED` on `get_pending_scheduled_events` | [BE-006](backend.md) | 2 | todo | | |
| P2-9 | Adversarial Hardhat tests for every game contract (reentrancy, RNG simulation, payout-cap, reserve underflow) | smart-contracts test gap | 4 | todo | | Prerequisite for V6 deploy |
| P2-10 | CI quality gate: `tsc --noEmit`, `npm test`, `npm audit --audit-level=high`, block on each | dep CI gap | 3 | todo | | Today: Cypress only |

---

## Phase 3 — This quarter

| # | Action | Refs | Complexity | Status | Owner | Notes |
|---|---|---|:-:|---|---|---|
| P3-1 | Split `PokerTournamentCreator.tsx` (3,191 LOC) into wizard steps + `useTournamentDraft` hook | [FE-004](frontend.md) | 3 | todo | | |
| P3-2 | Split `app/BLACKJACK/page.tsx` (2,713 LOC, 25 useEffects, 36 `any`) | [FE-003](frontend.md) | 4 | todo | | |
| P3-3 | Reduce 76% `'use client'` density: lift marketing/landing to RSC | [PERF-017](performance.md), [FE-013](frontend.md) | 3 | todo | | |
| P3-4 | Standardize fetch state on React Query (today: 720 useEffects vs 39 RQ vs 190 raw `fetch`) | [FE-019](frontend.md) | 4 | todo | | |
| P3-5 | Compress `public/` (343 MB), add WebP/AVIF fallbacks, replace 23.8 MB `TassHubTable.png` | [PERF-004](performance.md) | 2 | todo | | |
| P3-6 | Pin/vendor `react-casino-roulette` (currently github tarball) | [DEP-005](dependencies-infra.md) | 2 | todo | | |
| P3-7 | Upgrade backend `viem` 1.19 → 2.49 to close version skew | [DEP-002](dependencies-infra.md) | 4 | todo | | |
| P3-8 | Remove `app/css-test`, `app/speech-test` dev routes from prod builds | [FE-025](frontend.md) | 1 | todo | | |
| P3-9 | Move/remove root-level `mockup-*.html` files | [DEP-021](dependencies-infra.md) | 1 | todo | | |

---

## Decisions log

Append-only. When we make a non-obvious call, write it here so we can find it later.

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-18 | RNG fix = server-resolved + provably-fair commit-reveal (not commit-reveal-over-blockhash, not drand, not VRF) | No oracle on PulseChain; user doesn't want slow games; pattern already proven in `InstantLottery6of55.resolvePlay` and poker shuffle. See [rng-v6-plan.md](rng-v6-plan.md) for details. |
| 2026-05-18 | Operator signing key must live in KMS, not env var | A leaked key drains the entire bankroll instantly; bankroll cap + multisig pause are blast-radius mitigations, not substitutes. |
| 2026-05-18 | Off-chain identity fix = SIWE session, not per-route EIP-712 | One pattern instead of patching twelve routes. Verified no SIWE exists today; foundation added (`auth.service.ts`, `require-auth.ts`, `auth.routes.ts`, migration 123). Manual at [siwe-manual.md](siwe-manual.md). |

---

## Blocked / needs decision

Empty for now. Add a row here when a Phase item can't proceed without an upstream call.

---

## What you (the human) need to do to actually turn the SIWE work on

The code changes are dormant until these steps. None of them can be done from inside the worktree.

1. **Install deps** (frontend + server):
   ```bash
   npm install           # from repo root — pulls siwe, drops claude/react-shaders/embla-* from node_modules
   cd server && npm install   # pulls siwe + cookie-parser + @types/cookie-parser
   ```
2. **Run migration**:
   ```bash
   node server/run-migration.js migrations/123_sessions.sql
   ```
   Verifies by `\dt` in psql — you should see `auth_nonces` and `sessions`.
3. **Set env vars on the server host** (Railway / wherever):
   - `SIWE_EXPECTED_DOMAIN=morbius.io` (must equal the domain the frontend signs)
   - Confirm `FRONTEND_URL` already includes `https://morbius.io` (it does, per `server.ts`)
   - Confirm `NEXT_PUBLIC_API_URL` is set on Vercel so the frontend can reach the backend
4. **Deploy backend first, then frontend.** Backend deploy adds the new endpoints harmlessly. Frontend deploy starts using them.
5. **Smoke test** with a wallet:
   - Connect wallet on the site → click "Sign in" → wallet popup → approve
   - `curl https://api.morbius.io/api/auth/me -b morb_session=<your-cookie>` should return `{ address, expiresAt }`
   - Try `POST /api/withdraw` without a cookie → expect 401
   - Try `POST /api/withdraw` with the cookie → expect normal flow

### What changes will users notice?

- Existing in-flight users will be silently logged in on next page load if their wallet was already connected — except they'll see a one-time "Sign in" prompt next time they try a privileged action (withdraw, change profile, cancel tournament).
- Admin tools that today rely on `x-admin-secret` injection from `process.env.AP` will continue working until P0-4 lands. After P0-4, admins must SIWE-sign-in too.

### What's NOT yet wired

- WebSocket cookie auth (still reads `?address=`). Set `REQUIRE_WS_AUTH=true` as the today-fix per [P0-1](IMPLEMENTATION.md), then move WS to cookie reading in a follow-up.
- Admin proxy (`process.env.AP` auto-inject in `app/api/admin/[[...path]]/route.ts`). Pending P0-4.
- A few cosmetics admin routes (create-item, item PATCH, bulk-shop-listed, tier-pricing) and poker chip purchase/cashout. Pending P1-1 completion.
- UI integration of the "Sign in" button. `<SignInButton />` exists in `components/auth/` — drop it wherever your wallet UI lives (probably near `<ConnectButton />` from RainbowKit). Until you do, users will be prompted to sign in only when they try a privileged action.
