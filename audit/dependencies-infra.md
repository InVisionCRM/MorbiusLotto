# MORBlotto — Dependencies, Build Config & Infrastructure Audit

**Auditor**: Claude (Opus 4.7)
**Date**: 2026-05-18
**Scope**: Root Next.js app + `server/` Express backend (production deps only unless noted)
**Repo**: `/Users/kyle/MORBlotto/.claude/worktrees/priceless-burnell-b88b0b`

---

## TL;DR

This is a Web3 casino handling real value, but its supply chain and build hygiene are loose. 46 npm advisories across the two `package.json`s (including **1 critical RCE in `protobufjs`**), `ignoreBuildErrors: true` and an ESLint config that turns off virtually every safety rule, no CI gate beyond Cypress (no type-check, no test, no audit), and a server that still pins **viem 1.x** while the frontend uses viem 2.x. Two cosmetically alarming but **not actually malicious** packages live in `dependencies` (`claude` and `crypto`) — both are deprecated placeholder packages from legitimate maintainers; remove them anyway. The Github-tarball pin of `react-casino-roulette` is a real, fixable supply-chain risk. No `.env.example`, no Node engines field, no `vercel.json`, and 343 MB of mostly uncompressed PNGs/audio under `public/`. Headline items: protobufjs RCE, viem version skew, build-error bypass, missing CI quality gates, and unbounded `process.env.*` surface area (88 unique vars, zero documented).

---

## Severity legend

- **Critical** — supply-chain compromise risk, build/security-sensitive bypass actively deployed, or RCE-class advisory
- **High** — known-CVE outdated production dep, or auth/security-relevant config gap
- **Medium** — duplicates, bloat, version skew, missing CI gates that don't block prod
- **Low** — hygiene, naming, cleanup

## Complexity legend (effort to fix)

1. Trivial (delete a line / bump a patch version)
2. Small (1-2 file edits, no API change)
3. Medium (config + code change, plausible regression risk)
4. Large (major-version dep bump, breaking-change migration)
5. Cross-cutting (CI overhaul, security-model rewrite)

---

## Dependency snapshot

| Metric | Frontend (root) | Backend (`server/`) |
|---|---|---|
| `dependencies` count | 62 | 16 |
| `devDependencies` count | 33 | 13 |
| `package-lock.json` | 700 KB present | 263 KB present |
| Outdated (any) | ~60 packages "MISSING" in install state | 19 |
| Major-version-behind direct deps | `lucide-react` (0→1), `react-dropzone` (14→15), `@vercel/analytics` (1→2), `wagmi` (2→3) | `@neondatabase/serverless` (0→1), `@types/express` (4→5), `@types/node` (20→25), `@types/pg` (16→20), `@types/uuid` (9→10), `dotenv` (16→17), `express` (4→5), `express-rate-limit` (7→8), `helmet` (7→8), `typescript` (5→6), `uuid` (9→14), **`viem` (1→2)**, `zod` (3→4) |
| Audit total | 38 | 8 |
| Critical | **1** (protobufjs RCE) | 0 |
| High | 6 | 5 |
| Moderate | 31 | 2 |
| Low | 0 | 1 |
| Direct (`isDirect`) vulnerable deps | `wagmi`, `ethers`, `viem` | `ethers`, `multer`, `viem`, `ws` |

The "MISSING" status from `npm outdated` at the repo root means the frontend hasn't been installed in this worktree; the audit data above is from a successful `npm audit`, so the lockfile resolves cleanly even if `node_modules/` is absent. Counts therefore reflect locked versions.

---

# Findings

## DEP-001 — `protobufjs` critical RCE in transitive deps
- **Severity**: Critical
- **Complexity**: 3
- **Where**: Pulled in via `@walletconnect/*` → `@reown/appkit*` → `wagmi 2.19.5` / `@rainbow-me/rainbowkit 2.2.11`
- **Advisory**: GHSA-xq3m-2v4x-88gg "Arbitrary code execution in protobufjs"
- **Status**: `fixAvailable` would require breaking-change major bump of `wagmi` to 2.15.6+ (npm reports it but the version field looks confused; verify against current `wagmi` releases).
- **Action**: Run `npm audit fix --force` after pinning a compatible WalletConnect / Reown stack; alternatively bump `@walletconnect/*` overrides in `package.json` with a `"overrides"` block to force `protobufjs >= 7.2.5`.

## DEP-002 — `viem` major-version skew between frontend and backend
- **Severity**: High
- **Complexity**: 4
- **Where**: Frontend `package.json` line 93 (`"viem": "^2.47.6"`) vs `server/package.json` line 32 (`"viem": "^1.19.9"`).
- **Risk**: Two completely different `viem` APIs across the boundary. Any shared ABI handling, address parsing, or contract call encoding behaves differently. Active CVE chain in `viem <= 2.15.0` (via `ws`) — backend's 1.19.9 is **far** below the patch line and not even maintained.
- **Action**: Upgrade `server/` to `viem ^2.49.3` and adapt any breaking changes (createPublicClient signature, contract call shape, BigInt return types).

## DEP-003 — `crypto@1.0.1` package in server dependencies
- **Severity**: Critical (cosmetically) / Medium (actually)
- **Complexity**: 1
- **Where**: `server/package.json` line 23 `"crypto": "^1.0.1"`
- **What it is**: Deprecated placeholder squat-prevention package owned by npm (`maintainers: [npm <npm@npmjs.com>]`). Empty body, ISC-licensed. **Not malicious** — npm holds the name to prevent typosquatting. But the codebase imports `crypto` from the Node builtin everywhere (verified in `server/src/services/poker-game.service.ts`, `provably-fair.service.ts`, `blackjack-multi-game.service.ts`, etc.) so the npm package shadows nothing useful and produces noise.
- **Action**: Delete the line from `server/package.json` and `package-lock.json`; the Node builtin is used regardless.

## DEP-004 — `claude@0.1.1` package in frontend dependencies
- **Severity**: Medium (cosmetically); Low (actually)
- **Complexity**: 1
- **Where**: Root `package.json` line 63 `"claude": "^0.1.1"`
- **What it is**: `npm view claude` confirms: published by `boris-anthropic@anthropic.com` (legitimate Anthropic Boris Cherny), 574 bytes, ISC. It is a deprecation redirect pointing at `@anthropic-ai/claude-code` and is **not** used anywhere in source (verified `grep` shows zero imports of `claude`).
- **Risk**: Not malicious but the package name on npm is a known transient-confusion target — keeping it in `dependencies` signals to dependency-trust scanners that the project doesn't audit its deps.
- **Action**: Remove the line. Confirmed not imported.

## DEP-005 — `react-casino-roulette` GitHub tarball, unpinned
- **Severity**: High
- **Complexity**: 2
- **Where**: Root `package.json` line 79 `"react-casino-roulette": "github:dozsolti/react-casino-roulette"`
- **What it is**: GitHub tarball with no version constraint and no integrity hash in package.json (the lockfile pins commit `7fd0e7945b0653c65d277537aec3f4068685a68c`, which mitigates somewhat).
- **Risk**: If the lockfile is regenerated or someone runs `npm i react-casino-roulette@github:...`, npm pulls HEAD of `main` from `dozsolti/react-casino-roulette` and re-resolves. Any compromise of that account or branch lands code on a real-money casino site.
- **Action**: Fork into the org, pin to a specific commit SHA via `npm install github:org/react-casino-roulette#<sha>`, or publish a private copy. At minimum add an `"integrity"` override.

## DEP-006 — `framer-motion` + `motion` duplicate
- **Severity**: Medium
- **Complexity**: 2
- **Where**: Root `package.json` lines 69 (`framer-motion ^12.23.24`) and 76 (`motion ^12.38.0`). Codebase imports `framer-motion` from 46 files, `motion` from 0.
- **Risk**: `motion` is the v12 successor; both ship overlapping bundles, adding ~50 KB gzip and a duplicate React context.
- **Action**: Drop `motion` from dependencies (no imports), or migrate fully to `motion` and drop `framer-motion`.

## DEP-007 — `html2canvas` + `html-to-image` duplicate
- **Severity**: Medium
- **Complexity**: 1
- **Where**: Root `package.json` lines 70-71. `html-to-image` imported from 1 file, `html2canvas` from 2.
- **Risk**: Two DOM-rasterization libraries doing the same job. Each pulls ~150 KB.
- **Action**: Pick one (`html-to-image` is smaller, modern). Remove the other and update the 1 or 2 imports.

## DEP-008 — `react-shaders` zero imports, zero updates
- **Severity**: Low
- **Complexity**: 1
- **Where**: Root `package.json` line 86 `"react-shaders": "^0.0.4"`. Codebase imports: 0.
- **What it is**: Pre-1.0 (`0.0.4`), last published >1 year ago by `jrysana@rysana.com`. Likely an experiment that never landed.
- **Action**: Remove.

## DEP-009 — `ignoreBuildErrors: true` in `next.config.ts`
- **Severity**: Critical
- **Complexity**: 2
- **Where**: `next.config.ts` line 96
- **Risk**: TypeScript errors do not fail the build. The project already documents this in `CLAUDE.md` as an accepted state. For a Web3 casino moving real money this is a major regression vector — wrong-typed contract calls, incorrect BigInt math, missing nullability checks all compile to prod silently.
- **Action**: Drive existing errors to zero, then flip to `ignoreBuildErrors: false`. Use Next.js `strict` mode incrementally if a full cleanup is too big.

## DEP-010 — `tsconfig.json` runs with `strict: false`
- **Severity**: High
- **Complexity**: 4
- **Where**: Root `tsconfig.json` lines 15-24
- **Detail**: `strict`, `noImplicitAny`, `noImplicitReturns`, `noImplicitThis`, `noUnusedLocals`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are **all** off. The server `tsconfig.json` has `strict: true` — the frontend should match.
- **Action**: Enable `strict: true` and `noUncheckedIndexedAccess: true` incrementally (one flag per PR).

## DEP-011 — ESLint config disables every safety rule
- **Severity**: High
- **Complexity**: 3
- **Where**: `eslint.config.mjs` (250+ lines, all `"off"`)
- **Detail**: Everything from `react-hooks/rules-of-hooks` to `no-unsafe-*` to `no-floating-promises` to `no-const-assign` is disabled. The header comment says "Disable most rules to bypass errors". `eslint-config-next`'s recommended set is functionally neutered.
- **Risk**: ESLint is not catching anything. Promises silently swallowed, hooks called conditionally, etc.
- **Action**: Start from `eslint-config-next` defaults and accept the failures as actionable tickets. Keep `no-console: warn` minimum.

## DEP-012 — No `engines.node` field, no `.nvmrc`
- **Severity**: Medium
- **Complexity**: 1
- **Where**: Root and server `package.json` (no `engines` field). No `.nvmrc` at repo root.
- **Risk**: Deploy targets (Vercel, Railway) silently choose a Node version. CI uses Node 20 (Cypress workflow). Server `@types/node ^20.10` suggests Node 20. Default Vercel Node is now 24 LTS — drift possible.
- **Action**: Add `"engines": { "node": ">=20.18 <23" }` to both `package.json`s and an `.nvmrc` with `20` (or upgrade plan to 22/24).

## DEP-013 — `multer` < 2.1.0 with three high-severity advisories
- **Severity**: High
- **Complexity**: 2
- **Where**: `server/package.json` line 29 `"multer": "^2.0.2"`. Audit reports DoS via incomplete cleanup, resource exhaustion, and uncontrolled recursion (CVE GHSA-xf7r/v52c/5528). Latest patched: 2.1.1.
- **Action**: Bump to `^2.1.1`.

## DEP-014 — `ethers v6` with vulnerable `ws` dep (server)
- **Severity**: High
- **Complexity**: 2
- **Where**: `server/package.json` line 25 `"ethers": "^6.8.1"`. Audit fix path is `ethers: 5.8.0` (a downgrade) — that's wrong; bump within the v6 line to >= 6.13 which uses a patched `ws`.
- **Action**: Bump to latest `ethers ^6.16` (matches frontend).

## DEP-015 — `path-to-regexp <0.1.13` (transitive via express 4)
- **Severity**: High
- **Complexity**: 2
- **Where**: Express 4.22.1. Latest express 5.x has the fix.
- **Action**: Either bump express to 5 (breaking) or pin `path-to-regexp` in an overrides block.

## DEP-016 — Backend pinned to obsolete `@neondatabase/serverless 0.7.2`
- **Severity**: High
- **Complexity**: 2
- **Where**: `server/package.json` line 21. Frontend uses `^1.0.2`. Latest 1.1.0.
- **Risk**: Different Neon driver semantics between client and server. Older driver had connection-pooling issues and a different `Pool` API.
- **Action**: Bump backend to `^1.1.0` and adapt any API differences (esp. `Pool` and `transaction()`).

## DEP-017 — Backend `zod ^3.22.4`, latest is `4.x`
- **Severity**: Medium
- **Complexity**: 3
- **Where**: `server/package.json` line 35. Zod 4 is a real major rewrite with API changes.
- **Action**: Stay on 3.x until evaluated; plan migration. Bump to latest 3.x (`3.25.76` is locked) — fine.

## DEP-018 — No CSP / security headers in `next.config.ts`
- **Severity**: High
- **Complexity**: 3
- **Where**: `next.config.ts` has no `async headers()` block.
- **Missing**: `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`. Casino UI is a high-value clickjacking and XSS target.
- **Action**: Add a `headers()` function. Suggested baseline:
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` denying `camera`, `microphone` (except for `@stream-io/video-react-sdk` paths if those exist)
  - Phase in a CSP — wallet-connect + RainbowKit + Stream Video need `connect-src`, `frame-src`, `script-src` allowances.

## DEP-019 — CI runs Cypress only — no type-check, no unit tests, no audit gate
- **Severity**: High
- **Complexity**: 3
- **Where**: `.github/workflows/cypress-e2e.yml` is the only workflow
- **Missing**: No job runs `tsc --noEmit`, `npm run lint`, server `jest`, hardhat tests, or `npm audit --audit-level=high`. No security scanning, no Dependabot config.
- **Action**: Add a `quality.yml` workflow:
  - Frontend: `tsc --noEmit`, `npm run lint`, `npm audit --omit=dev --audit-level=high`
  - Server: same + `jest`
  - Contracts: `hardhat test` + `hardhat compile`
  - Optionally CodeQL/JS for static analysis.

## DEP-020 — `DISABLE_WS_AUTH` / `NEXT_PUBLIC_SKIP_WS_AUTH` env-driven auth bypass
- **Severity**: Critical (if ever enabled in prod)
- **Complexity**: 2
- **Where**: `server/src/runtime/service-registry.ts:87`, `server/src/server.ts:242`. Comment explicitly warns it bypasses EIP-712 signature verification.
- **Risk**: Any operator who fat-fingers the env var into a prod deploy serves an unauthenticated WS — players can impersonate each other. The code logs a warning but doesn't refuse to run.
- **Action**: Refuse to start when `NODE_ENV === 'production'` and bypass flags are truthy. Fail closed.

## DEP-021 — 88 unique `process.env.*` references, zero documented
- **Severity**: High
- **Complexity**: 3
- **Where**: All across `app/`, `hooks/`, `lib/`, `server/src/`
- **Detail**: No `.env.example`, no `.env.example` in `server/`. Sensitive-looking keys include `HOT_WALLET_PRIVATE_KEY`, `LOTTERY_OPERATOR_PRIVATE_KEY`, `MERKLE_KEEPER_PRIVATE_KEY`, `MERKLE_OWNER_PRIVATE_KEY`, `SETTLEMENT_PRIVATE_KEY`, `TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY`, `STREAM_API_SECRET`. Plus 8+ contract addresses and bot configuration.
- **Risk**: An operator who runs `npm start` on a fresh box has no inventory of what to set. Plus `process.env.AP` (likely a typo) is referenced — possibly dead.
- **Action**: Create `.env.example` and `server/.env.example` with every required key, documenting which are public, secret, optional. Add a startup `validate-env.ts` that throws on missing required keys in prod.

## DEP-022 — `.env*` is gitignored but no `.env.example` exists
- **Severity**: Medium
- **Complexity**: 1
- **Where**: `.gitignore` covers `.env*` (verified). Currently no env files on disk in the worktree.
- **Detail**: The `.gitignore` includes both `.env*` and `.env.example` — which means even if someone adds a sanitized example file it would be ignored.
- **Action**: Add `!.env.example` to `.gitignore` so future example files are tracked.

## DEP-023 — No `vercel.json`, no `vercel.ts`
- **Severity**: Low
- **Complexity**: 2
- **Where**: Neither file exists at repo root.
- **Detail**: Project deploys to Vercel (assets reference `@vercel/analytics`, `process.env.RAILWAY_STATIC_URL` for the server). Deploy config relies entirely on dashboard settings — no IaC.
- **Action**: Add a minimal `vercel.json` capturing build command, regions, function timeouts, and any cron/queue config so deploy config is in version control.

## DEP-024 — 343 MB `public/` directory, many uncompressed PNGs > 5 MB
- **Severity**: Medium
- **Complexity**: 2
- **Where**: `public/morbius/` is 57 MB by itself; `Morbius_Blackjack.png` 8.0 MB, `Morbius_Lottery.png` 7.6 MB, `pg1.png` 6.8 MB, `Morbius_Keno.png` 7.3 MB, multiple .mp4 audio cues
- **Risk**: Slow cold loads, expensive CDN bills, bloated repo clone.
- **Action**: Compress with `squoosh-cli` or `oxipng`; ship WebP/AVIF where possible. Move large videos to a CDN or `next/image` remote pattern. Lazy-load.

## DEP-025 — Three mockup HTML files in repo root
- **Severity**: Low
- **Complexity**: 1
- **Where**: `mockup-floating-panels.html` (30 KB), `mockup-poker-rail-glow.html` (10 KB), `poker-lobby-mockups.html` (24 KB)
- **Action**: Move under `design-previews/` (which exists) or delete. Don't ship at root.

## DEP-026 — Loose root-level mjs scripts touching prod private keys
- **Severity**: High
- **Complexity**: 2
- **Where**: `scripts/pulsechain-escrow-fund-then-payout.mjs`, `scripts/pulsechain-tournament-escrow-payout-only.mjs`, `scripts/pulsechain-leflowt-two-tournaments-escrow-smoke.mjs` (and `check_*`, `recent_payouts.mjs`, `sim_payout*.mjs`)
- **Risk**: Read `*_PRIVATE_KEY` env vars, send PulseChain txs. No auth, no usage guard, no documentation. Anyone with shell access on a deploy box can run them.
- **Action**: Move under `scripts/ops/` with a README, require `OPS_CONFIRM=yes` env or `--yes` flag to actually broadcast, and never accept addresses or PIN values from positional args without explicit confirm.

## DEP-027 — `winston ^3.11.0` excluded from bundle but kept in deps
- **Severity**: Low
- **Complexity**: 1
- **Where**: `server/package.json` line 33, but `next.config.ts` aliases `winston: false` in webpack and adds it to `serverExternalPackages`. Comment: only used server-side.
- **Action**: Already correctly externalized. Fine, but worth noting — keep an eye on it if the bundle config ever changes.

## DEP-028 — No `headers()` function and Service Worker is correctly scoped
- **Status**: Looks fine, noted for the record
- `app/sw.ts` is well-disciplined: explicit comment says **do not cache `/api/*` or `/ws*`** because stale balances would be dangerous. Uses Serwist `defaultCache` (network-first for navigations, SWR for static). Confirmed no POST interception.

## DEP-029 — `react-dropzone`, `lucide-react`, `@vercel/analytics`, `wagmi` all one major behind
- **Severity**: Medium
- **Complexity**: 3
- **Detail**: `lucide-react 0.555 → 1.16`, `react-dropzone 14 → 15`, `@vercel/analytics 1 → 2`, `wagmi 2 → 3`. Wagmi 3 in particular changes the connector API surface.
- **Action**: Plan a deliberate upgrade window — wagmi 3 / viem 2 → 3 is the next domino after the protobufjs fix.

## DEP-030 — `.cursorrules` contains casino-relevant policy not mirrored in `CLAUDE.md`
- **Severity**: Low
- **Complexity**: 1
- **Where**: `.cursorrules` is a long file explaining PulseChain ↔ Ethereum equivalence. Most of it is now correctly captured in `CLAUDE.md`. But:
  - `.cursorrules` includes Solidity example contracts (`PulseSiteEscrow`) that aren't in `CLAUDE.md`. Probably fine — they're illustrative.
- **Action**: Consider deleting `.cursorrules` (Cursor IDE is no longer the only tool in the room) or trimming it to a one-liner pointing at `CLAUDE.md`.

## DEP-031 — `tsconfig.tsbuildinfo` committed (or at least present in worktree)
- **Severity**: Low
- **Complexity**: 1
- **Where**: Visible in `ls /repo/`
- **Risk**: Stale incremental build state when multiple agents run in worktrees.
- **Action**: Add `tsconfig.tsbuildinfo` to `.gitignore` (and `.next/`, which is already gitignored).

## DEP-032 — `server/jest.config.ts` has no coverage thresholds
- **Severity**: Medium
- **Complexity**: 1
- **Where**: `server/jest.config.ts` defines projects but no `coverageThreshold`.
- **Risk**: `test:coverage` runs but never fails on missed coverage. Hard to add coverage gates later if there's no baseline.
- **Action**: Add `collectCoverageFrom: ['src/services/**/*.ts']` and a starting threshold (lines: 50) to avoid backsliding.

---

# Cross-cutting observations

- **Two `viem` versions** is the single most concerning version drift — frontend signs / encodes calls with v2 semantics; server reads/decodes with v1. Wherever they exchange ABI-encoded data (chain events, tournament escrow, blackjack settle), there's room for subtle bugs.
- **The build is too forgiving**: `ignoreBuildErrors`, `strict: false`, ESLint everything-off, no type-check in CI. Each one alone is a known anti-pattern; together they mean nothing catches a regression before deploy except Cypress (which doesn't run TypeScript-only files).
- **Operator footgun surface is wide**: `DISABLE_WS_AUTH`, root-level payout scripts with private keys, no `.env.example`, no engines field, 88 undocumented env vars.
- **Supply chain is mostly OK**: The two scary-looking names (`claude`, `crypto`) are deprecated placeholder packages from legitimate maintainers (Anthropic and npm Inc. respectively), not typosquats. But the GitHub-tarball pin for `react-casino-roulette` is the real risk.

---

# Things that look fine

- Lockfiles present and reasonably sized in both `/` (700 KB) and `server/` (263 KB)
- `.env*` correctly gitignored (just needs a `!.env.example` exception)
- Service worker (`app/sw.ts`) correctly avoids caching API/WS routes
- Server `tsconfig.json` runs `strict: true` and `experimentalDecorators` (consistent with class-based services)
- `serverExternalPackages` correctly externalizes `pino`, `winston`, `thread-stream` etc. so they don't break the Next.js bundle
- `webpack` IgnorePlugin rules for test files keep build clean
- Hardhat is properly devDependency-only; no smart-contract toolchain leaks into the runtime bundle
- `ALL_DEPLOYMENTS.MD` is well-organized; clearly tracks "CURRENT" vs "legacy" contract per game (although verification on PulseScan should be confirmed separately — out of scope here)
