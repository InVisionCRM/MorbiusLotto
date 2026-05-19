# MORBlotto Frontend Audit

**Scope**: Next.js 16 / React 19 frontend (app/, components/, hooks/, lib/) — 363 components, 65 hooks, 35 routes, ~656 TS/TSX files. Server (Express, ~648 TS errors of its own) is out of scope of this audit, except where shared types leak in.

## TL;DR

- **TypeScript safety is effectively disabled at every layer.** `tsconfig.json` ships with `strict: false`, `noImplicitAny: false`, and 6 other strictness flags off; `next.config.ts` adds `typescript.ignoreBuildErrors: true`. The build currently has **789 TS errors** (140 in frontend, the rest in server) but none fail CI.
- **213 explicit `any` annotations** across 55 frontend files (~8% of files). The top offenders are `app/BLACKJACK/page.tsx` (36 uses), `hooks/use-tournament.ts` (26), and `components/admin/AdminContractsTab.tsx` (15) — primarily for WebSocket payloads and contract-call return shapes.
- **No error boundaries anywhere** in the App Router (no `error.tsx`, no `global-error.tsx`, no `<ErrorBoundary>`). One uncaught throw in `PokerTable`, `BlackjackTable`, or `MorbItPage` blanks the entire route.
- **Two monstrous client components** (`PokerTournamentCreator` at 3191 LOC, `app/BLACKJACK/page.tsx` at 2713 LOC) carry too much logic, state, and JSX for any single file. Both are top-of-tree `"use client"` files that import wagmi, framer-motion, and dozens of child components inline.
- **Two redundant dependency pairs** are both installed and both imported: `framer-motion` (46 imports) and `motion` (24 imports), plus `html2canvas` and `html-to-image`. Pick one of each.

## Legend

| Severity | Meaning |
|----------|---------|
| Critical | Bug that breaks the UI, blocks users, or hides serious correctness risk |
| High     | Significant UX harm or maintainability hazard |
| Medium   | Code smell with real downside |
| Low      | Polish |

| Complexity | Meaning |
|------------|---------|
| Trivial    | <1 hour, one or two grep-and-replace passes |
| Small      | 1-4 hours, contained to a small set of files |
| Medium     | 4-16 hours, touches a feature area or requires refactor |
| Large      | 1+ day, multi-day refactor or systemic change |

---

## Findings

### FE-001 — `ignoreBuildErrors: true` with 140 frontend TS errors and `strict: false`
- **Severity**: Critical
- **Complexity**: Large
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/next.config.ts:94-97`, `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/tsconfig.json`
- **Description**: `next.config.ts` ships `typescript.ignoreBuildErrors: true`, and `tsconfig.json` has `strict: false` plus all individual strictness flags disabled (`noImplicitAny`, `noImplicitReturns`, `noImplicitThis`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — all off). `npx tsc --noEmit` reports **789 total errors**, of which **140 live in core frontend code** (94 components, 26 hooks, 8 lib, 6 app, 6 cypress). The top error code is `TS2339` (property does not exist on type) — 542 occurrences. This is concerning for a casino app handling real money: the type system is silently telling you the code shape doesn't match the types it claims, and CI lets it through.
- **Recommendation**:
  1. Phase 1: Set `tsconfig.json` `strict: true` and re-run `tsc --noEmit`. Triage error count.
  2. Phase 2: Fix the ~140 frontend errors. Start with `TS2339` in core game files (`app/BLACKJACK/page.tsx`, `app/poker/[tableId]/PokerPopups.tsx`).
  3. Phase 3: Flip `ignoreBuildErrors: false`. Add a CI check.
  4. Phase 4: Backfill stricter flags one at a time (`noImplicitAny` first).

### FE-002 — Zero error boundaries in App Router
- **Severity**: Critical
- **Complexity**: Small
- **Location**: `app/` (no `error.tsx`, no `global-error.tsx`); only `app/loading.tsx` and `app/not-found.tsx` exist
- **Description**: Searched for any of `error.tsx`, `global-error.tsx`, `ErrorBoundary`, `componentDidCatch`, or `react-error-boundary` across `app/` and `components/` — **zero hits**. A render exception in any single component (e.g., a `BigInt` deref on undefined, an array map on null) blanks the route via Next's default fallback, with no recovery, no telemetry hook, and no in-app messaging. Particularly dangerous in `PokerTable` (1168 LOC, lots of websocket-driven state) and `BlackjackTable` (2015 LOC).
- **Recommendation**:
  - Add `app/global-error.tsx` for unhandled chunks of the app shell.
  - Add `app/<game>/error.tsx` for each game route (BLACKJACK, poker, PLINKO, lottery, keno, blackjack-multi, claim, Morb-It). Each should offer a Reset button (`reset()`) plus a "report bug" link.
  - Optionally wire to Sentry or PostHog so production crashes are visible.

### FE-003 — `app/BLACKJACK/page.tsx` is 2,713 lines, holds 25 useEffects, 36 `any` annotations
- **Severity**: High
- **Complexity**: Medium
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/BLACKJACK/page.tsx`
- **Description**: Single-file page component owning game state, WebSocket lifecycle, music/SFX, history fetch + transformation, signature flows, three settlement-orchestration paths, and dozens of derived UI flags. 25 separate `useEffect` blocks make ordering and dependency-array correctness extremely fragile (the file already has one suppressed `react-hooks/exhaustive-deps` warning at line 2181). 36 `any` annotations are propagated through gameState helpers that touch real wager values.
- **Recommendation**:
  - Split into `BlackjackPageShell` (mount/route concerns) + dedicated child components for the in-game HUD, completion orchestrator, and history view.
  - Promote the inline `gameState as any` blobs (e.g., lines 1238-1296) into a discriminated union in `app/BLACKJACK/types.ts`.
  - Consolidate the 25 useEffects: many derive booleans that should be `useMemo`, and several music effects can collapse into a single state-machine reducer.

### FE-004 — `PokerTournamentCreator.tsx` is 3,191 lines
- **Severity**: High
- **Complexity**: Medium
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/components/poker/tournament/PokerTournamentCreator.tsx`
- **Description**: Largest file in the repo. Combines form state, step-by-step wizard, escrow on-chain interactions, image upload, and ABI calls. Hard to navigate, hard to test in isolation, and difficult to code-review.
- **Recommendation**: Break into the standard wizard primitives: `BasicsStep`, `PayoutStep`, `EscrowStep`, `ReviewStep`, each as its own file consuming a shared `useTournamentDraft()` hook for state. Aim for <400 LOC per file.

### FE-005 — 213 `any` annotations + 32% of frontend files affected (in 55 files)
- **Severity**: High
- **Complexity**: Medium
- **Location**: Top offenders: `app/BLACKJACK/page.tsx` (36), `hooks/use-tournament.ts` (26), `components/admin/AdminContractsTab.tsx` (15), `lib/websocket-client.ts` (11), `components/admin/AdminMerkleDropsTab.tsx` (9), `components/admin/AdminLPStakingTab.tsx` (9)
- **Description**: Distribution: components (74), hooks (69), app (50), lib (20). The patterns repeat: `(payload: any) =>` for WebSocket handlers, `as any` for ABI-typed Viem calls (especially in admin tabs casting `chain` and `account`), and `(s: any) => s.playerAddress?.toLowerCase()` style nested map callbacks. Notable hotspots:
  - WebSocket payloads (`hooks/use-tournament.ts` lines 239, 245, 262, 273) — these decode real money state from the server with no typing.
  - Blackjack hand processing (`app/BLACKJACK/page.tsx` lines 1238-1296) — payout determination reads `playerHands.some((h: any) => h.result === 'blackjack')`.
- **Recommendation**:
  - Define WebSocket message types in a shared `types/ws-messages.ts` (or import from the server). The server has types — use them.
  - Stop using `as unknown as Parameters<typeof contract.writeContractAsync>[0]` (used 6 times in `use-blackjack-contract.ts`). The fact that you need a double-cast is the Wagmi/Viem type system telling you the call shape is wrong.

### FE-006 — Both `framer-motion` and `motion` installed and imported
- **Severity**: Medium
- **Complexity**: Trivial
- **Location**: `package.json` (`"framer-motion": "^12.23.24"`, `"motion": "^12.38.0"`); 46 `from 'framer-motion'` imports, 24 `from 'motion/react'` imports
- **Description**: `motion` is the renamed successor of `framer-motion` (same author). Shipping both adds ~50KB+ of duplicated runtime code, doubles tree-shaking surface area, and creates inconsistent animation defaults across the app.
- **Recommendation**: Migrate everything to `motion/react` (the newer package) and remove `framer-motion`. Single sed pass plus a removal from `package.json`.

### FE-007 — Both `html2canvas` and `html-to-image` installed
- **Severity**: Low
- **Complexity**: Trivial
- **Location**: `package.json`; `html2canvas` used in `components/BLACKJACK/ShareButton.tsx` and `components/PLINKO/ShareButton.tsx`; `html-to-image` used in `components/poker/tournament/PokerTournamentSharePanel.tsx`
- **Description**: Three share-screenshot features using two different libraries. Both libraries do the same job; pick one.
- **Recommendation**: Migrate to one (prefer `html-to-image` — faster, smaller). Remove the other from `package.json`.

### FE-008 — `dangerouslySetInnerHTML` rendering server-supplied chat content
- **Severity**: High (XSS surface)
- **Complexity**: Small
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/components/BLACKJACK/multi/BlackjackMultiInfoPanel.tsx:136`
- **Description**: `{isWelcome ? <span dangerouslySetInnerHTML={{ __html: m.text }} /> : m.text}` — welcome messages received over the multiplayer WebSocket are rendered as raw HTML. If the server (or someone who can spoof a `welcome` message) emits attacker-controlled HTML, it executes in every viewer's session. Cookies/wallet provider state are inside the same origin.
- **Recommendation**: Eliminate `dangerouslySetInnerHTML`. If the welcome message needs basic formatting (bold/link), parse a small allow-listed Markdown subset client-side. Server should never send raw HTML to clients.

### FE-009 — No `error.tsx` per route + no Sentry-style global handler means client crashes are invisible
- **Severity**: High
- **Complexity**: Small
- **Location**: Repo-wide
- **Description**: Companion to FE-002. Even setting aside the route-blanking UX, you have no signal a crash occurred. Wallet integration code throws in `useEffect` blocks all over the place (caught silently via `catch (err: any)` swallow), but any render-phase throw is just gone.
- **Recommendation**: Add Sentry (or Vercel's analytics error stream) at the layout level. Wire `error.tsx` boundaries to ping it.

### FE-010 — ESLint passes with 14 "Unused eslint-disable" warnings
- **Severity**: Low
- **Complexity**: Trivial
- **Location**: Multiple files: `app/BLACKJACK/page.tsx:301`, `:2181`, `app/blackjack-multi/BlackjackMultiLobbyClient.tsx:338`, `app/marketing/MarketingPageClient.tsx:256,301`, `app/poker/[tableId]/page.tsx:373,584`, `app/poker/verify/page.tsx:201`, `components/admin/AdminBJSingleTab.tsx:196,316`, `components/poker/PokerTopPlayers.tsx:272,417`, `components/poker/tournament/EscrowBuyInJoinPanel.tsx:340`
- **Description**: 14 stale `// eslint-disable-next-line` directives that no longer suppress anything. Either the rule was satisfied, or the rule was renamed (looks like `@next/next/no-img-element` checks moved). These are harmless but signal that lint discipline is loose.
- **Recommendation**: Run `npm run lint:fix` and review.

### FE-011 — Casino game routes have no `loading.tsx` or route-segment loading state
- **Severity**: Medium
- **Complexity**: Small
- **Location**: `app/BLACKJACK/`, `app/poker/`, `app/PLINKO/`, `app/lottery/`, `app/keno/`, `app/roulette/`, `app/blackjack-multi/` — only `app/loading.tsx` exists at root
- **Description**: When a user navigates from `/` to `/BLACKJACK`, there is no Suspense boundary or route loading UI. With all game pages marked `"use client"`, hydration of the multi-megabyte client bundle results in a multi-second blank screen on slower connections.
- **Recommendation**: Add `app/<game>/loading.tsx` showing the game's branding splash. For PLINKO/BLACKJACK in particular, a skeleton table reduces perceived latency.

### FE-012 — `app/BLACKJACK/layout.tsx`, `app/poker/layout.tsx`, `app/blackjack-multi/layout.tsx` set `dynamic = 'force-dynamic'` defensively
- **Severity**: Medium
- **Complexity**: Trivial
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/BLACKJACK/layout.tsx`, `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/poker/layout.tsx`, `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/blackjack-multi/layout.tsx`
- **Description**: All three layouts export `export const dynamic = 'force-dynamic';` to force dynamic rendering. Since every page inside is already `"use client"`, this opt-out is redundant — and it prevents Next.js from serving even a static shell that hydrates into the client app. With Next.js 16's PPR / Cache Components, you could ship a static frame instantly.
- **Recommendation**: Remove `force-dynamic`. Convert layouts to server components that render a static frame plus a `<Suspense>`-wrapped client island.

### FE-013 — Server-vs-client component split is upside-down: 22 of 35 pages are `"use client"` at the top
- **Severity**: Medium
- **Complexity**: Medium
- **Location**: 22 client pages including `app/BLACKJACK/page.tsx`, `app/poker/page.tsx`, `app/PLINKO/page.tsx`, `app/keno/page.tsx`, `app/roulette/page.tsx`, `app/lottery/page.tsx`, `app/claim/page.tsx`, `app/poker/verify/page.tsx`, `app/BLACKJACK/verify/page.tsx`
- **Description**: Next.js 16's recommended pattern: each `page.tsx` is a server component that renders one or more client islands (`<HomePageClient />`-style). Here, only the root page follows that pattern; every game page is a 1000+ LOC top-level client component. This negates server-rendered above-the-fold HTML, defeats RSC bundle splitting, and forces full-client hydration for routes that don't actually need wagmi at first paint (e.g., `verify` pages).
- **Recommendation**:
  - `verify` pages especially: convert to server components, fetch via a server-side `fetch()` to your verify API, and only inline a small client island for "copy hash" buttons.
  - Game pages: keep `<page>` server, wrap the game in `<GameClient />`.

### FE-014 — Buttons routinely use `disabled={isPending || isConfirming}` but no `aria-busy` or live announcement
- **Severity**: Medium (a11y)
- **Complexity**: Small
- **Location**: `components/admin/AdminConfigTab.tsx`, `hooks/use-tournament.ts`, throughout game controls
- **Description**: Action buttons go disabled while a contract write is in-flight, but no screen-reader notification is emitted (no `aria-busy="true"`, no `aria-live="polite"` regions for "Transaction submitted, waiting for confirmation"). Keyboard-only / SR users have no idea why the button stopped responding.
- **Recommendation**: Add an `aria-live="polite"` toast region (Sonner is already in use — confirm it has `role="status"`/SR support enabled). Set `aria-busy` on the wrapping panel during pending writes.

### FE-015 — Game canvas/table layouts have no keyboard-accessible bet entry on `BettingPanel`
- **Severity**: Medium (a11y)
- **Complexity**: Small
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/components/BLACKJACK/BettingPanel.tsx`
- **Description**: Bet entry is exclusively through chip-stack buttons. There is no `<input type="number">` fallback. Keyboard users tab through chip buttons but cannot quickly enter "5000" without clicking 5 chips. Poker's `<input type="text" inputMode="numeric" aria-label="Bet amount">` is good — the blackjack flow should mirror it.
- **Recommendation**: Add a hidden-but-accessible numeric input alongside the chips. Validate on blur.

### FE-016 — No form-validation library; all bet/withdraw input validation is hand-rolled with `parseFloat`
- **Severity**: Medium
- **Complexity**: Medium
- **Location**: `BettingPanel.tsx`, `BlackjackTable.tsx`, `PokerActions.tsx`, withdraw flows in `use-blackjack-contract.ts`
- **Description**: No `zod`, `valibot`, `react-hook-form`, or similar in `package.json`. Bet validation looks like `parseFloat(betAmount || '0') > 0` (lines 1413, 1418 in `BlackjackTable.tsx`). `parseFloat('5abc')` returns `5` — silent partial-parse bugs. `parseFloat('1e100')` overflows BigInt conversion downstream. No min/max bounds checks at the boundary; that lives deep in the WebSocket handler.
- **Recommendation**: Adopt `zod` (or `valibot`) for client-side guards on every numeric input. Re-validate server-side (which the codebase mostly does for bet amounts via the WebSocket).

### FE-017 — `<img>` tag for non-decorative content slipping past `next/image`
- **Severity**: Low (perf/a11y)
- **Complexity**: Small
- **Location**: `components/ui/expandable-card-demo-standard.tsx:74`, `:137`, `components/ui/apple-cards-carousel.tsx:279`, `components/poker/FloatingTableLogo.tsx:175`, `components/poker/PokerTableSettingsModal.tsx:249`, `app/Morb-It/page.tsx:1098` (saved memes thumbnails), `app/BLACKJACK/page.tsx:302`, `app/blackjack-multi/BlackjackMultiLobbyClient.tsx:339`
- **Description**: 54 `<img>` tags in `components/` and `app/`. While 48 of them have `alt=""` (intentional decorative), the remaining ones include non-decorative content like saved meme thumbnails and table theme cards. Skipping `next/image` means no automatic responsive sizes, no lazy-loading default before Chrome's `loading="lazy"` (which several files do specify), and no AVIF/WebP optimization.
- **Recommendation**: Replace `<img>` with `next/image` where the source is a known local asset. For user-uploaded memes (`meme.image_data` data URLs), `next/image` doesn't help — leave `<img>` but ensure `alt` is descriptive.

### FE-018 — Icon-only buttons routinely missing `aria-label`
- **Severity**: Medium (a11y)
- **Complexity**: Small
- **Location**: 250 `aria-label` usages across the codebase (good!) but spot checks of `components/ui/file-upload.tsx:76`, `components/ResponsibleGaming/SelfExclusionModal.tsx:173,238,278`, and `components/home/PwaHomeInstallSplash.tsx:99,141` show icon-only close buttons without `aria-label="Close"`
- **Description**: Several modal close buttons rely on an SVG X with no accessible name. Screen reader announces "button".
- **Recommendation**: Add `aria-label="Close"` to every icon-only close/dismiss button. Consider lint rule `jsx-a11y/control-has-associated-label`.

### FE-019 — 720 useEffect occurrences with 39 react-query usages
- **Severity**: Medium
- **Complexity**: Large
- **Location**: Across `app/`, `components/`, `hooks/`; `@tanstack/react-query` is in deps (`5.90.11`) but only 39 imports
- **Description**: 720 `useEffect` to 39 react-query imports — even allowing for non-data effects, the ratio suggests a lot of manual data fetching that should be `useQuery`. Examples: 190 raw `fetch()` calls in `hooks/` and `components/`. Each one needs `useEffect` for trigger, `useState` for loading/error/data, and a cleanup-on-unmount flag. `hooks/use-latest-burns.ts`, `hooks/use-latest-wins.ts`, `hooks/use-morbius-burned.ts`, `hooks/use-pls-quote.ts`, `hooks/use-contract-balance.ts` all roll their own.
- **Recommendation**: Migrate the leaderboard/stats/feed hooks to `useQuery`. You already pay the bundle cost — use it. This removes boilerplate, gives stale-while-revalidate for free, and unifies the cache.

### FE-020 — `process.env.AP` (admin secret) referenced directly in API route handlers, not behind a config module
- **Severity**: Medium (devexp/security)
- **Complexity**: Trivial
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/api/bj-multi/admin/tables/route.ts:15,32`, `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/api/bj-multi/admin/tables/[tableId]/route.ts:16`, `app/api/poker/admin/status/route.ts:21`, `app/api/poker/admin/tournament-dev-reset/route.ts:21`, others
- **Description**: A two-letter env var name (`AP`) for the admin secret is referenced from multiple API routes. If it isn't set in production, `process.env.AP ?? ''` silently sends an empty admin header — possibly bypassing some backends, possibly hitting a 401. Not a frontend issue per se but it lives in `app/api/`.
- **Recommendation**: Centralize in `lib/server-env.ts` with a startup assertion. Rename to `ADMIN_SECRET` to be self-documenting.

### FE-021 — `react-hooks/exhaustive-deps` warnings suppressed in known fragile spots
- **Severity**: Medium
- **Complexity**: Small
- **Location**: `app/BLACKJACK/page.tsx:2181`, `app/poker/[tableId]/page.tsx:373,584`, `app/poker/verify/page.tsx:201`
- **Description**: ESLint is reporting that these `// eslint-disable-next-line react-hooks/exhaustive-deps` directives are now unused (rule passed). Either the deps were fixed and the comment forgotten, or the suppressions were copy-pasted aspirationally. Either way, the prior code clearly tripped the rule and the developer overrode it rather than fixing the deps array.
- **Recommendation**: Delete the stale suppressions, then revisit the deps arrays one more time to make sure they really are correct.

### FE-022 — `as unknown as Parameters<typeof X.writeContractAsync>[0]` double-cast used 6 times
- **Severity**: High (correctness)
- **Complexity**: Medium
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/hooks/use-blackjack-contract.ts:347-432`
- **Description**: Six contract write calls all need a `as unknown as Parameters<typeof contract.writeContractAsync>[0]` cast to compile. This is the TypeScript way of saying "I know better than the types, force it through." Wagmi's typed-ABI inference is the whole point of Viem — if you're double-casting around it, the ABI mapping is wrong or the function name doesn't exist. With `ignoreBuildErrors: true`, a typo here would deploy. These are real-money writes (deposits, withdrawals).
- **Recommendation**: Investigate why the type inference fails. Most likely the contract ABIs are using `readonly` arrays in some places and mutable in others. Fix the ABI imports and remove the double-casts.

### FE-023 — Inline TypeScript types only partially shared between client and server
- **Severity**: Medium
- **Complexity**: Medium
- **Location**: `app/BLACKJACK/types.ts:22` (`actions?: any[]`), `app/BLACKJACK/verify/page.tsx:39` (`actions: any[]`), `hooks/use-tournament.ts:98,105,106` (`playerHands/actions/dealerActions: any[]`)
- **Description**: The shape of `PlayerAction`, `DealerAction`, and `PlayerHand` over the WebSocket is critical (it's the audit trail of game decisions), but typed as `any[]`. The server (`server/src/`) presumably knows the type. There's no shared `types/` module.
- **Recommendation**: Create `types/blackjack-events.ts` (and similar for poker/keno/plinko). Import the same types into the server. Use codegen if necessary.

### FE-024 — `eslint.config.mjs` has no `jsx-a11y` rules enabled
- **Severity**: Medium
- **Complexity**: Trivial
- **Location**: Root `eslint.config.mjs` (lint output shows only `react-hooks/exhaustive-deps` and `@next/next/no-img-element` running)
- **Description**: For a consumer-facing casino with money on the line, the lack of a11y lint rules means regressions go uncaught. `eslint-plugin-jsx-a11y` should at minimum warn on missing alt text, missing button labels, click-without-keyboard handlers, and label-has-associated-control.
- **Recommendation**: Add `eslint-plugin-jsx-a11y` with `recommended` config. Expect a flood of warnings on first run; triage by severity.

### FE-025 — `app/css-test/page.tsx` is 1329 lines and ships in production
- **Severity**: Low (cleanup)
- **Complexity**: Trivial
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/css-test/page.tsx`, `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/css-test/poker/page.tsx`, `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/app/speech-test/page.tsx`
- **Description**: Two `css-test` routes and a `speech-test` route are publicly reachable in production. `css-test` alone is 1329 LOC and is a `"use client"` page — gets bundled.
- **Recommendation**: Gate behind `process.env.NODE_ENV !== 'production'` via a server-side redirect in middleware, or move into `pages/_dev/` and exclude from production builds. At minimum, add `robots: { index: false }` metadata.

### FE-026 — 93 files containing 171 `console.log/warn/error` calls
- **Severity**: Low
- **Complexity**: Small
- **Location**: Across `hooks/`, `lib/`, `app/`, `components/` — examples: `hooks/use-audio.ts:29,60,82,110`, `hooks/use-pls-quote.ts:189`, `hooks/use-contract-balance.ts:56,61`
- **Description**: 171 `console` calls in production code paths. A few are `console.warn` for genuine recoverable conditions (e.g., Audio API unsupported). Many are debug-shaped (`console.error('Approval error:', error)` followed by no rethrow). Console pollution slows DevTools, leaks data to extension content scripts, and creates noise that masks real bugs.
- **Recommendation**: Introduce `lib/logger.ts` (file already exists — line 1 imports `console.error` placeholder) and route everything through it, gated on `NODE_ENV`. Wire to Sentry/PostHog for production paths.

### FE-027 — Pages use `useEffect` to derive state instead of `useMemo` (suggests pre-React-18 idioms)
- **Severity**: Low
- **Complexity**: Medium
- **Location**: `app/BLACKJACK/page.tsx` (multiple), `app/blackjack-multi/[tableId]/page.tsx`, `components/poker/PokerActivityFeed.tsx`
- **Description**: Files with 15-25 useEffects often hide derivations behind effects (e.g., compute `processedGame` in a `useEffect` and stash it in `useState`). This causes an unnecessary render cycle and makes data flow harder to reason about. The pattern is endemic in `app/BLACKJACK/page.tsx`.
- **Recommendation**: Treat each useEffect as suspect. If the body is pure (no fetch, no subscription, no timer), it should be `useMemo` or a plain const above the JSX.

### FE-028 — Index-as-key React anti-pattern in 94 spots
- **Severity**: Low
- **Complexity**: Small
- **Location**: e.g., `components/ui/loader.tsx:190`, `components/ui/marquee.tsx:97`, `components/home/tokenomics-section.tsx:321`, `components/CryptoKeno/keno-prize-pool-modal.tsx:153`, `components/footer/faq-modal.tsx:71`
- **Description**: 94 cases of `key={i}`/`key={idx}`/`key={index}` in components. For static or append-only lists this is harmless; for reorderable lists (game history, leaderboards, animated feeds) this causes React to re-mount rather than re-order, losing animation continuity and input focus.
- **Recommendation**: Replace with stable IDs (`key={item.id}`) where the data has them. The home tokenomics section and FAQ modal are safe — leaderboards and activity feeds are not.

### FE-029 — `dangerouslySetInnerHTML` for SVG cosmetics is fine, but the source isn't sanitized
- **Severity**: Medium
- **Complexity**: Small
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/components/admin/AvatarFeaturePlacementEditor.tsx:282`, `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/components/avatar/AvatarPreview.tsx:429`
- **Description**: Both inject `draftDefinition.svgMarkup` / `def.svgMarkup` into an `<g>` tag without sanitization. If avatar SVG markup is admin-uploaded only (per the avatar/cosmetics workflow), risk is low — admin SVG could embed `<script>` and execute. Worth confirming.
- **Recommendation**: Run admin-uploaded SVG through DOMPurify with SVG profile. Whitelist tags. Strip `script` and event-handler attributes.

### FE-030 — Tailwind low-opacity body text on game tables (contrast concern)
- **Severity**: Low (a11y)
- **Complexity**: Trivial
- **Location**: `components/BLACKJACK/BlackjackTable.tsx`, `components/BLACKJACK/multi/BlackjackMultiInfoPanel.tsx:140` (`text-white/35`), `components/BLACKJACK/multi/BlackjackMultiInfoPanel.tsx:132` (`text-white/85`, `text-emerald-400/80`, `text-orange-400/80`)
- **Description**: 10+ uses of opacity modifiers `text-white/35`, `/40`, etc. on body text. On a dark felt background, white at 35% opacity is around #595959 — well below WCAG AA 4.5:1 for normal text.
- **Recommendation**: Use full-opacity colors that pass contrast: `text-white/70` minimum for muted (still risky on dark), or shift to a tested palette like `text-zinc-400` over `bg-zinc-900` (passes AA).

### FE-031 — `BlackjackTable.tsx` is 2015 lines, single component
- **Severity**: High
- **Complexity**: Medium
- **Location**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b/components/BLACKJACK/BlackjackTable.tsx`
- **Description**: Like FE-003 and FE-004 but for the visual table component. 2015 lines of layered JSX with inline styles, motion components, and inline event handlers (e.g., line 1371's onClick is a 350-character single line). Code review and PR diffs become impractical.
- **Recommendation**: Split: `TableFelt`, `BettingControls`, `RebetButton`, `MusicControls`, `ReserveBalanceTile`. Each <300 LOC.

### FE-032 — No `<noscript>` shell for users with JS disabled or while bundle loads
- **Severity**: Low
- **Complexity**: Trivial
- **Location**: `app/layout.tsx` body
- **Description**: With all game pages `"use client"`, a JS-disabled browser sees a blank page. A `<noscript>` block giving a basic "Please enable JavaScript to play" message would help SEO crawlers and users with strict privacy extensions.
- **Recommendation**: Add `<noscript>` to `app/layout.tsx`.

---

## Cross-cutting observations

- **Wallet user-gesture rule is well-followed.** `hooks/use-tournament.ts` lines 961-968 explicitly comments the two-step pattern: `// Do NOT await receipt here — that would lose the user-gesture context`. Search across the repo found no obvious violations: every `writeContractAsync` is either at the top of a click handler or guarded behind a separate user-initiated state (`pendingJoinState` + a "Confirm Join" button). Good discipline here.
- **Wagmi/Viem integration is moderately idiomatic.** Contract reads use `useReadContract` (or `useReadContracts` for batching), writes use `useWriteContract`. The double-cast in `use-blackjack-contract.ts` (FE-022) is the main exception.
- **Shadcn primitives correctly compose Radix.** `components/ui/switch.tsx`, `components/ui/tabs.tsx`, etc. follow the documented composition. Radix gives keyboard nav + ARIA out of the box.
- **Avatar SVG rendering is the most exotic dynamic content.** It's mostly fine but worth a sanitize pass (FE-029).
- **The `key` discipline is mixed.** Most large lists in admin tabs use IDs; cosmetic carousels use indices.
- **No `react-hot-toast` or competing toast libraries** — Sonner is the single source. Good.
- **Provider tree (`app/providers.tsx`) is a client component** wrapping wagmi + react-query — standard. Worth checking it doesn't leak server-only deps into client bundles.

## Things that look fine

- Tailwind/Shadcn theming is consistent.
- Radix primitives are imported correctly.
- Poker action buttons (`components/poker/PokerActions.tsx`) have `data-testid`, `type="button"`, full text labels, `min-h-11` for 44px touch targets, and `aria-label` on the embedded bet-amount input. This is a model of how the rest of the codebase should look.
- `app/not-found.tsx` correctly stays server-rendered to avoid wagmi prerender errors (good comment in the file).
- `useReducedMotion` is at least imported in `components/ui/slide-text.tsx` — though nowhere else.
- WebSocket message routing in `lib/websocket-client.ts` exists as a single client module rather than scattered ad-hoc connection logic.
- ESLint and Prettier are wired and CI-runnable (just with weak rules).
- No `TODO`/`FIXME`/`HACK`/`XXX` markers in the frontend (`app/`, `components/`, `hooks/`, `lib/`) — either developer discipline or scrubbing.

---

## Summary stats

| Metric | Value |
|--------|-------|
| Frontend TS/TSX files | 654 |
| `strict: false` in tsconfig | Yes |
| `ignoreBuildErrors: true` | Yes |
| Total TS errors (whole repo) | 789 |
| Frontend TS errors | ~140 |
| Files with `: any` | 55 (8.4% of files) |
| Total `: any` occurrences | 213 |
| `@ts-ignore` / `@ts-nocheck` | 0 / 0 |
| `@ts-expect-error` | 2 |
| Client pages (`"use client"`) | 22 of 35 (63%) |
| Routes with `error.tsx` | 0 |
| Files >800 LOC | 23 |
| Largest file | `PokerTournamentCreator.tsx` (3191 LOC) |
| `console.log/warn/error` | 171 across 93 files |
| Index-as-key occurrences | 94 |
| `<img>` (vs `next/image`) | 54 |
| `dangerouslySetInnerHTML` | 3 |
| `useEffect` occurrences | 720 |
| `@tanstack/react-query` imports | 39 |
| Raw `fetch()` calls | 190 |
