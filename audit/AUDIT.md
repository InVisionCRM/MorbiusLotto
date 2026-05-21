# MORBlotto — Full Site Audit

**Audit date:** 2026-05-18
**Auditor:** Claude (Opus 4.7), six specialized agents in parallel
**Scope:** Next.js 16 frontend, Express + WebSocket backend, 15 Solidity contracts on PulseChain, dependencies, build/infra
**Approach:** Static code review only — no penetration testing, no fuzzing, no on-chain or load testing was performed.

---

## How to read this report

This top-level file is the executive summary and prioritized action plan. **Six sub-reports** in the same `audit/` directory carry the detailed findings, and two tracking docs sequence the remediation work:

| File | Purpose | Findings |
|---|---|---|
| [`audit/security.md`](security.md) | Security (auth, RNG, secrets, headers) | 30 |
| [`audit/smart-contracts.md`](smart-contracts.md) | Smart contracts (Solidity, PulseChain) | 25 |
| [`audit/backend.md`](backend.md) | Backend (Express + WebSocket + DB) | 30 |
| [`audit/frontend.md`](frontend.md) | Frontend (React, a11y, TypeScript) | 32 |
| [`audit/performance.md`](performance.md) | Performance (Lighthouse, bundles, images) | 25 |
| [`audit/dependencies-infra.md`](dependencies-infra.md) | Dependencies & infra (npm, build, CI) | 32 |
| [`audit/IMPLEMENTATION.md`](IMPLEMENTATION.md) | **Remediation tracker** — one row per fix with Status / Owner / Notes | — |
| [`audit/siwe-manual.md`](siwe-manual.md) | **SIWE overview & manual** — how identity auth works once turned on, and how to flip routes onto it | — |
| [`audit/rng-v6-plan.md`](rng-v6-plan.md) | **RNG V6 sub-plan** — staged work breakdown for the smart-contract RNG fix | — |
| **Total findings** | | **174** |

Each finding has an ID (`SEC-001`, `SC-001`, `BE-001`, `FE-001`, `PERF-001`, `DEP-001`), a severity, a complexity (1–5 effort), a file/line location, and a concrete recommendation. This summary references those IDs without re-stating them in full — open the sub-report for the details. Track *progress* against findings in `IMPLEMENTATION.md`.

---

## TL;DR

**The site has a working core economy but a wide attack surface and serious code-hygiene debt.** Three categories of issue stand out:

1. **Drain-the-casino bugs** (smart contracts). On-chain RNG in five game contracts is fully predictable, and one game (BigWheel) has a reserve check commented out for "testing." A wrapper-contract attacker today can extract EV from every PLS-path game; once liquidity is in BigWheel, anyone can over-pay themselves.
2. **Impersonate-anyone bugs** (web + backend). The `/api/admin/*` proxy attaches a privileged secret to any request that hits it, so 149 admin endpoints are callable by anonymous users. `/api/withdraw` and a dozen other money routes accept the player's address in the body with no signature. WebSocket auth is opt-in via env flag; default behavior is to trust `?address=`.
3. **Quiet-failure infrastructure**. `next.config.ts` sets `typescript.ignoreBuildErrors: true`. `tsconfig.json` has `strict: false` plus 8 strictness flags disabled. There are zero error boundaries in the App Router. The page ships 22 MB of images and 11 s LCP. There's no CI quality gate beyond Cypress.

**What's working (validated across audits):**

- Fee split 1.25 + 0.5 + 1.75 + 1.5 = 5% is correctly implemented in `BlackjackV2`, `Plinko`, `CryptoKeno`, `InstantLottery6of55`, and the server money service.
- Money arithmetic is BigInt-only; off-chain balance updates are atomic (`UPDATE … WHERE balance >= $`); the hot-wallet worker uses `FOR UPDATE SKIP LOCKED`.
- Poker provably-fair shuffle correctly overrides chevtek's `Math.random` and uses `pfService.fisherYatesShuffle`. The `CLAUDE.md` guardrail is being honored everywhere.
- SQL is parameterized everywhere ($1 placeholders / `sql\`\`` template tag) — no injection found.
- The TournamentPrizeEscrowV5/V6 contracts, the staking contracts, and the merkle claim contracts use `nonReentrant`, `Ownable`, EIP-712 signatures, and `SafeERC20` correctly.
- The documented wallet user-gesture footgun (`writeContractAsync` after `await`) is well-followed throughout `hooks/` and `components/` — no violations found.

---

## Stop-the-presses items

These cross-cut multiple sub-reports and should be addressed before any further user-onboarding or contract deposits. Each is exploitable today against any wallet whose public address is known.

| # | Issue | Sub-reports | Effort |
|---|---|---|---|
| **STP-1** | `/api/admin/*` proxy auto-injects `x-admin-secret` for any caller — 149 admin endpoints are open to the internet | [SEC-001](security.md), [BE-005](backend.md) | 1–2 days |
| **STP-2** | On-chain RNG in Plinko/Roulette/BigWheel/CryptoKeno/InstantLottery is predictable by the caller — bankrolls drainable | [SEC-002](security.md), [SC-001](smart-contracts.md) | ≥1 week + pause + redeploy |
| **STP-3** | `/api/withdraw` and ~10 other money routes accept caller address with no signature | [SEC-003](security.md), [BE-001](backend.md), [BE-003](backend.md), [BE-004](backend.md), [BE-005](backend.md), [BE-009](backend.md) | 1–2 days per route family |
| **STP-4** | `REQUIRE_WS_AUTH` defaults to **off** — WebSocket trusts `?address=` and the entire real-time domain (poker, blackjack-multi, tournaments, profile, tip-dealer) is impersonable | [SEC-004](security.md), [BE-002](backend.md) | <1 hour (flip default + boot guard) |
| **STP-5** | `BigWheel` has a `// TESTING:` reserve check commented out and double-processes the PLS payment | [SC-002](smart-contracts.md), [SC-014](smart-contracts.md) | 1 day + redeploy |
| **STP-6** | `dangerouslySetInnerHTML` rendering WebSocket-supplied chat HTML — XSS via spoofed `welcome` message | [FE-008](frontend.md) | <1 hour |
| **STP-7** | `protobufjs` critical RCE advisory in transitive deps via WalletConnect | [DEP-001](dependencies-infra.md) | ~half day + dep bump |

STP-1, STP-2, STP-3, STP-4, STP-6, STP-7 are immediate. STP-5 is gated by whether anyone has put liquidity into BigWheel yet — if not, it's "before the deposit" not "before tomorrow."

---

## Findings by severity (aggregate)

| Severity | Security | Contracts | Backend | Frontend | Performance | Deps/Infra | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critical | 4 | 3 | 6 | 3 | 2 | 2 | **20** |
| High | 9 | 7 | 8 | 9 | 8 | 8 | **49** |
| Medium | 9 | 7 | 10 | 12 | 9 | 13 | **60** |
| Low / Info | 8 | 8 | 6 | 8 | 6 | 9 | **45** |
| **Total** | **30** | **25** | **30** | **32** | **25** | **32** | **174** |

> Note: Some criticals appear in multiple sub-reports (e.g. the withdraw signature gap is both SEC-003 and BE-001). The total above counts each per-report row separately for navigability; the real unique-issue count is ~12 Critical and ~30 High.

---

## Prioritized action plan

### Phase 0 — Today / first 48 hours (you can do these without a contract redeploy)

The goal of Phase 0 is to make today's site safe for the users it already has, without redeploying contracts.

| Order | Action | Refs | Complexity |
|:-:|---|---|:-:|
| 1 | **Set `REQUIRE_WS_AUTH=true` in prod, redeploy.** Then change the server default to `true` and refuse to boot in prod when unset. | BE-002, SEC-004 | 1 |
| 2 | **Sanitize the chat XSS sink** in `BlackjackMultiInfoPanel.tsx:136`. Replace `dangerouslySetInnerHTML` with text rendering or run through DOMPurify. | FE-008, FE-029 | 1 |
| 3 | **Pause Plinko / Roulette / BigWheel / CryptoKeno / InstantLottery PLS-path** at the contract level until RNG is replaced. Only the MORBIUS `resolvePlay` flow is currently provably fair. | SC-001, SEC-002 | 1 (call `pause()`) |
| 4 | **Remove the admin-proxy secret auto-injection.** Hot-fix: require an EIP-712 signature on the Next.js admin proxy before forwarding. Rotate `process.env.AP` immediately afterward. | SEC-001 | 3 |
| 5 | **Add EIP-712 signature verification to `/api/withdraw`.** The signing utility already exists at `server/src/utils/withdraw-sign.ts`. Add a `withdraw_nonces` table and per-wallet nonce. | BE-001, SEC-003 | 2 |
| 6 | **Force a `protobufjs` override** in root `package.json`, run `npm audit fix --force` after pinning a compatible WalletConnect/Reown stack. | DEP-001 | 2 |
| 7 | **Delete dead/unused frontend deps** (`claude`, `react-shaders`, `embla-carousel-react`, `embla-carousel-wheel-gestures`) and the `crypto` placeholder in `server/`. Shaves transitive surface and shrinks the lockfile. | PERF-009, DEP-003, DEP-004 | 1 |
| 8 | **Add `app/global-error.tsx` and a per-game `error.tsx`** so a render exception in `PokerTable` or `BlackjackTable` no longer blanks the page silently. Wire to Sentry/PostHog if you have one. | FE-002 | 2 |

### Phase 1 — This week (auth shape + biggest UX wins)

The goal of Phase 1 is to close the remaining "trust an unsigned address" routes and reclaim ~70% of page weight.

| Order | Action | Refs | Complexity |
|:-:|---|---|:-:|
| 9 | **Sign every money-moving route.** Tournament cancel/reclaim, profile edits, cosmetics gift/list/grant/admin, `/api/deposit/notify`, `/api/poker/chips/{purchase,cashout}`, `instantLottery.play` body-address path. Pattern: EIP-712 challenge → short-lived bearer; backend verifies `recoverAddress`. | BE-003, BE-004, BE-005, BE-009, SEC-003 | 4 (cross-cutting refactor) |
| 10 | **Add zod validation** to every Express route handler. `zod` is already in `server/package.json` with zero usages today. Start with `money.routes.ts` and `tournament.routes.ts`. | BE-007 | 3 |
| 11 | **Per-address rate limit on withdraw / claim / instant-play.** The global `1000 req/min` limiter isn't enough; key on player address. | BE-008, SEC-007 | 2 |
| 12 | **Marketing image swap.** Replace raw `<img>` with `next/image` in `TableShowcaseDisplay.tsx` and `PulseChainAiDisplay.tsx`. Lighthouse estimates **−18.8 MiB** transfer. | PERF-001 | 2 |
| 13 | **Delete the dead `<link rel="preload">`** of `morbius/Morbius-glass-chip-16x9.jpeg` in `app/layout.tsx:99-100` — 147 KB wasted on every page load, asset is unused. | PERF-002 | 1 |
| 14 | **Switch hero video `preload="auto"` → `preload="metadata"`** and gate sources by viewport — recovers ~8 MB on mobile. | PERF-003 | 1 |
| 15 | **Add `experimental.optimizePackageImports`** to `next.config.ts` for `@tabler/icons-react`, `lucide-react`, `framer-motion`, `motion`, `recharts`, `date-fns`. | PERF-005 | 1 |
| 16 | **Lazy-load `@stream-io/video-react-sdk`** (>1 MB) in the poker route via `next/dynamic`; it's currently statically imported. | PERF-007 | 2 |
| 17 | **Pick one of `framer-motion` / `motion`** and remove the other; pick one of `html2canvas` / `html-to-image` and remove the other. Both pairs are dual-installed today. | PERF-006, PERF-008, FE-006, FE-007 | 2 |

### Phase 2 — This month (contract redeploy + type safety + observability)

The goal of Phase 2 is the irreversible changes: contract redeploys, type-system reclamation, and security headers.

| Order | Action | Refs | Complexity |
|:-:|---|---|:-:|
| 18 | **RNG redesign + V6 redeploy.** Move Plinko/Roulette/BigWheel/CryptoKeno/InstantLottery PLS-path to commit-reveal or server-signed outcomes (the InstantLottery6of55 `resolvePlay` PF path is a working pattern). This is the prerequisite for un-pausing the contracts. | SC-001 | 5 |
| 19 | **BigWheel reserve + payment fix** before any V6 deposits land. Restore the reserve check, fix the double `_processMorbiusPayment` in PLS path. | SC-002 | 2 |
| 20 | **MorbiusTournament hardening.** Add state-machine + `hasJoined` check to `payout()`, add per-tournament prize cap, 2-step ownership transfers, operator timelock. | SC-003 | 3 |
| 21 | **Replace PulseX spot price with a TWAP** on the five PLS entrypoints. Today they're sandwich-attackable. | SC-004 | 3 |
| 22 | **Add `headers()` to `next.config.ts`** with CSP (script-src self + RainbowKit/Stream domains), X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, HSTS preload, X-Content-Type-Options nosniff. | SEC-008 | 2 |
| 23 | **Phased TypeScript reclamation** (FE-001): (a) flip `strict: true`, get error count; (b) fix the 140 frontend errors triaging by domain (game files first); (c) flip `ignoreBuildErrors: false`; (d) add a CI type-check gate. | FE-001, DEP-016 | 5 |
| 24 | **Type the WebSocket payloads.** Replace 60+ `any` casts in `hooks/use-tournament.ts`, `lib/websocket-client.ts`, and `app/BLACKJACK/page.tsx` with a shared `types/ws-messages.ts` discriminated union — same source of truth on server and client. | FE-005, FE-022 | 4 |
| 25 | **Make the freeroll scheduler idempotent.** Add `FOR UPDATE SKIP LOCKED` (or a leader-election guard) to `get_pending_scheduled_events` so two replicas don't double-fire. | BE-006 | 2 |
| 26 | **Write adversarial Hardhat tests** for every game contract before V6 deploy: reentrancy attempts, RNG simulation attacks, payout-cap evasion, reserve underflow. Today only the escrow contracts have tests. | SC test gap | 4 |
| 27 | **Add a CI quality gate.** `.github/workflows/*` runs Cypress only. Add `tsc --noEmit`, `npm test`, and `npm audit --audit-level=high`. Block on each. | DEP CI gap | 3 |

### Phase 3 — This quarter (refactor + polish)

The goal of Phase 3 is the high-ROI debt: split the megacomponents, normalize state management, kill dead code.

- Split `PokerTournamentCreator.tsx` (3,191 LOC) into wizard steps + a shared `useTournamentDraft()` hook. ([FE-004](frontend.md))
- Split `app/BLACKJACK/page.tsx` (2,713 LOC, 25 useEffects, 36 `any`) into shell + child components; collapse the music/state useEffects into a state machine. ([FE-003](frontend.md))
- Reduce the **76% `'use client'` density** by lifting marketing/landing sections into Server Components. ([PERF-017](performance.md), [FE-013](frontend.md))
- **Standardize on React Query** for fetch state (currently 720 useEffects vs 39 react-query imports vs 190 raw `fetch`es). ([FE-019](frontend.md))
- Compress `public/` — it's 343 MB. `TassHubTable.png` alone is 23.8 MB; most images have no WebP/AVIF fallback. ([PERF-004](performance.md))
- Pin or vendor `react-casino-roulette` (currently `github:dozsolti/react-casino-roulette` with no tag — supply-chain risk). ([DEP-005](dependencies-infra.md))
- Upgrade backend to `viem ^2.49.3` to close the version skew with the frontend (server is still on 1.19.9 — unmaintained and not patched). ([DEP-002](dependencies-infra.md))
- Remove dev routes `app/css-test` and `app/speech-test` from production builds. ([FE-025](frontend.md))
- Remove root-level `mockup-*.html` files (or move under `design-previews/`). ([DEP-021](dependencies-infra.md))

---

## What was checked and looked solid

For confidence, these are areas each agent verified and explicitly noted as fine:

- **Fee split** (125 + 50 + 175 + 150 bps = 500 bps = 5%) is correct everywhere it's implemented — `BlackjackV2.sol`, `Plinko.sol`, `CryptoKeno.sol`, `InstantLottery6of55.sol`, and `server/src/services/money.service.ts`.
- **BigInt money math.** No floating-point money ops found in any service or contract.
- **Atomic balance updates.** `players.balance` updates use `UPDATE … WHERE balance >= $`; the hot-wallet worker uses `FOR UPDATE SKIP LOCKED`; poker chip ledger writes are transactional with ledger rows for audit.
- **Provably-fair poker shuffle.** Chevtek's `Math.random()` is correctly bypassed via `table.newDeck` override using `pfService.fisherYatesShuffle(serverSeed, clientSeed, 0)`. The `CLAUDE.md` guardrail holds.
- **SQL safety.** No string-concat queries found. Neon `sql\`\`` template tag and pg `$1` placeholders used consistently.
- **Wallet user-gesture pattern.** The known "`writeContractAsync` after `await`" footgun is followed everywhere; no violations found in `hooks/` or `components/`.
- **Escrow contracts.** `TournamentPrizeEscrowV5`/`V6` use `nonReentrant`, `Ownable2Step`-style patterns, EIP-712 signatures, and `SafeERC20` correctly.
- **Game-ownership check.** The blackjack action handler verifies `ws.playerAddress` matches the game's player address — once WS auth is enforced (Phase 0 #1), this gate is sound.
- **Serwist service worker** does not intercept POST requests to APIs.

---

## Legends (used throughout sub-reports)

### Severity

| Tag | Meaning |
|---|---|
| **Critical** | Exploitable today; funds, PII, or admin surface exposed. Fix before next deploy. |
| **High** | Likely exploitable or major attack surface / UX harm. Fix this week. |
| **Medium** | Limited impact, or requires specific preconditions; or moderate UX/code-quality risk. |
| **Low** | Defense-in-depth, polish, or minor hygiene. |
| **Info** | Observation only — not a vulnerability. |

### Complexity (effort to fix)

| Tag | Meaning |
|---|---|
| **1** | Trivial — config tweak or one-line change (<30 min). |
| **2** | Small — single-file refactor with focused testing (<2 hr). |
| **3** | Moderate — multi-file change, design discussion, real testing (~1 day). |
| **4** | Significant — touches a domain / shape change / cross-cutting (multi-day). |
| **5** | Major — architectural rewrite, contract redeploy with state migration, or systemic refactor (weeks). |

Sub-reports may use slightly different complexity scales (e.g. the backend report uses S/M/L/XL); each sub-report defines its scale at the top.

---

## Methodology notes & limitations

- This audit is **static only**. No transactions were sent, no contracts were fuzzed, no Lighthouse runs were performed in CI, and no dependency was pinned/installed by the auditors.
- The Lighthouse data is from a **pre-existing run** captured in `LIGHTHOUSE.MD` (dated 2026-04-09 against `https://morbius.io/`). Re-run Lighthouse after Phase 1 to validate the metric improvements.
- The smart-contract audit looked at **source code only**. Bytecode-level verification of deployed addresses against the source was not performed. Independently verify that the addresses in `lib/contracts.ts` match the source in `contracts/contracts/` before relying on the contract findings as accurate for prod.
- The `npm audit` data was read from lockfiles; the audit agents did not actually install or build either workspace. The `MISSING` rows in `npm outdated` output reflect that the root `node_modules/` is not populated in this worktree.
- The auditors did not run the test suite or attempt a build. The TS-error counts come from `tsc --noEmit` which the frontend agent did run.
- **No external smart-contract audit firm review has occurred.** Given the funds-at-risk findings (especially SC-001 RNG), I'd strongly recommend a paid third-party audit (Trail of Bits, OpenZeppelin, Spearbit, etc.) before the V6 redeploy.

---

## Quick links

- 🛡️ [Security audit](security.md) — auth, RNG, secrets, headers, file upload, XSS
- 🔗 [Smart contracts](smart-contracts.md) — Solidity findings per contract
- 🖥️ [Backend](backend.md) — Express + WebSocket + DB
- 🎨 [Frontend](frontend.md) — React, a11y, TypeScript, error boundaries
- ⚡ [Performance](performance.md) — Lighthouse, images, bundles, RSC
- 📦 [Dependencies & infra](dependencies-infra.md) — npm advisories, version skew, build config, CI
