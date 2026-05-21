# Security Audit — MORBlotto

**Audit date:** 2026-05-18
**Scope:** Web3 casino platform — frontend (Next.js App Router), backend (Express + WebSocket), Solidity smart contracts, infra/headers.
**Approach:** static review; no dynamic testing or pen-testing performed.

## TL;DR

- **Critical, stop-the-presses:** the Next.js admin proxy (`app/api/admin/[[...path]]/route.ts` and every other `.../admin/...` Next route) automatically injects the privileged `x-admin-secret` from `process.env.AP` for *any* request that reaches it. There is no auth check on the Next.js side. Any unauthenticated internet user can call `/api/admin/*` from a browser and get full admin privileges on the Express backend (149 admin endpoints).
- **Critical:** on-chain RNG in every casino contract that uses it (Plinko, Roulette, BigWheel, CryptoKeno, InstantLottery6of55) is built from `blockhash(block.number - 1) + block.timestamp + msg.sender + tx.gasprice`. Every input is known to the caller *before* the call, so an attacker can deploy a smart contract that simulates the outcome and reverts on losing tries — extracting EV from the casino.
- **Critical:** every "address-only" mutation route is unauthenticated. `/api/withdraw`, `/api/poker/chips/{purchase,cashout}`, `/api/cosmetics/gift`, `/api/cosmetics/grant`, `/api/cosmetics/admin/*`, `/api/tournament/:id/cancel|reclaim`, `/api/player/profile`, `/api/deposit/notify`, etc. accept an address in the body/path without ever verifying ownership via signature. Combined with the WebSocket auth being off-by-default, the *entire* off-chain economy is impersonable.
- **High:** WebSocket layer (`REQUIRE_WS_AUTH` defaults to false) trusts the query-param `?address=`. Any user can connect as any address and play games / move balances on their behalf.
- **High:** `app/api/poker/admin/run-tests` spawns Jest (a 2-minute child process) with *no auth at all* — trivial DoS vector. Also leaks server timing and test output to any caller.
- **High:** `next.config.ts` has `typescript.ignoreBuildErrors: true` and no `headers()` (no CSP, no X-Frame-Options, no HSTS). Combined with Next.js Cache Components/route handlers being the front door to all money flows, this is a systemic risk.

The smart contracts otherwise look like they were built with attention (`nonReentrant` everywhere, `onlyOwner`/`onlyAuthorizedServer` access control, EIP-712 withdraw signatures, Merkle-proof claims). The fee split (1.25/0.5/1.75/1.5 = 5%) is correctly implemented across `BlackjackV2`, `Plinko`, `CryptoKeno`, `InstantLottery6of55`. The poker provably-fair shuffle is correctly wired through `pfService.fisherYatesShuffle` and bypasses chevtek's `Math.random` (CLAUDE.md guidance honored). SQL uses `$1` placeholders everywhere — no injection found.

## Severity legend
- **Critical** — exploitable, exposes funds/PII, must fix before next deploy
- **High** — likely exploitable or major attack surface, fix this week
- **Medium** — limited impact or requires preconditions
- **Low** — defense-in-depth, harden when convenient
- **Info** — observation, not a vulnerability

## Complexity legend (effort to fix)
- **1** — trivial config/one-line change (<30 min)
- **2** — focused code change in one file (<2 hr)
- **3** — moderate refactor, multiple files, needs testing (~1 day)
- **4** — significant work or design change (multi-day)
- **5** — major rework / new subsystem (weeks)

## Findings

### [SEC-001] Next.js admin proxy auto-attaches admin secret with no caller auth
- **Severity:** Critical
- **Complexity:** 3
- **Location:** `app/api/admin/[[...path]]/route.ts:64`, plus every `app/api/bj-multi/admin/**`, `app/api/bj-single/admin/**`, `app/api/poker/admin/**`, `app/api/admin/upload/route.ts` proxy that does the same.
- **Description:** Every proxy under `/api/admin/*` injects `process.env.AP` as the `x-admin-secret` header on the server side:
  ```ts
  if (process.env.AP) headers.set('x-admin-secret', process.env.AP);
  ```
  The Next.js layer does *not* verify that the caller is an admin (no signature, no session, no allowlist). The Express backend's only gate is "header equals `AP`" — which the Next layer satisfies for any caller. Net result: any anonymous internet user can hit `https://<frontend>/api/admin/tables`, `/api/admin/merkle/epoch/1/calculate`, `/api/admin/poker/tournaments/:id/dev-reset`, `/api/admin/merkle/blocklist`, etc. and run admin actions.
- **Impact:** Total compromise of admin surface — wipe blackjack tables, modify wager tiers, blocklist Merkle drop recipients, reset poker tournaments, set arbitrary epoch reward amounts, spawn bot processes, upload arbitrary files to backend disk, etc. The Merkle admin routes can change reward calculation inputs before publish, enabling targeted theft.
- **Recommendation:** Replace `x-admin-secret` with a per-request signature from the caller's wallet, verified server-side against an `ADMIN_WALLETS` allowlist. Two-step: (1) add SIWE/EIP-712 challenge endpoint and a short-lived auth token, (2) the proxy forwards the user's signed token; backend validates the recovered address against `ADMIN_WALLETS`. As a fast band-aid before that lands, require `x-admin-wallet` + an EIP-712 signature over a nonce on every Next admin proxy, *before* forwarding the request, and only forward if recovered address is in `ADMIN_WALLETS`.

### [SEC-002] On-chain RNG is fully predictable by the caller
- **Severity:** Critical
- **Complexity:** 4
- **Location:** `contracts/contracts/Plinko.sol:456` (`_getRandomBucket`), `Roulette.sol:401` (`_spin`), `BigWheel.sol:280` (`_getRandomSegment`), `CryptoKeno.sol:264,377`, `InstantLottery6of55.sol:292` (`_generateWinningNumbers`).
- **Description:** All five contracts construct seeds from `keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, msg.sender, <counter>, tx.gasprice))`. Every input is known to the caller *before* the call: `blockhash(N-1)` is final, `block.timestamp` and `tx.gasprice` are set by the EOA/contract caller's tx, `msg.sender` is the attacker, and the counter is a public storage value. An attacker can deploy a wrapper contract that:
  1. Reads the storage counter.
  2. Computes the deterministic outcome locally with the *exact same* seed formula.
  3. Calls the game function only if the outcome is profitable; reverts otherwise (e.g. via a `require(profit > 0)` after the call returns).
  This is the canonical "predictable RNG" attack and is profitable on every spin.
- **Impact:** Casino edge is inverted. Attacker drains contract reserves at near-100% win rate, limited only by `MAX_PAYOUT` caps and per-tx gas.
- **Recommendation:** Switch to a commit-reveal scheme or VRF. On PulseChain there is no Chainlink VRF; options are:
  - (a) **Server-driven, like Instant Lottery PF path:** move RNG off-chain (operator signs winning numbers, contract verifies the signature). The Instant Lottery v2 PF route shows the pattern (`resolvePlay` with server-provided `winningNumbers`, replay-protected by `usedPlayId`).
  - (b) **Two-step commit-reveal:** player submits bet at block N, can only resolve at block N+1 (or later) using `blockhash(N+1)` plus a server-revealed nonce; revert if more than ~256 blocks elapse.
  Until fixed, **pause Plinko, Roulette, BigWheel, CryptoKeno, InstantLottery6of55 PLS-path (`playLotteryWithPLS`)** — only the MORBIUS `resolvePlay` flow is currently provably fair.

### [SEC-003] `POST /api/withdraw` has no signature verification
- **Severity:** Critical
- **Complexity:** 2
- **Location:** `server/src/routes/money.routes.ts:84-94`, `server/src/services/money.service.ts:381` (`enqueueWithdrawal`).
- **Description:** The handler takes `address` and `amount` directly from `req.body` and calls `moneyService.enqueueWithdrawal(address, amount)`. The service normalizes the address but never proves the caller owns it. Although the funds are sent to the victim's wallet, the attacker can:
  - Force-drain any victim's off-chain MORBIUS balance to their on-chain wallet at the unfavorable 5% fee moment.
  - Trigger `MIN_WITHDRAWAL_WEI` over and over to enumerate balances by error messages (oracle).
  - Spam-empty the hot-wallet liquidity (`Withdrawals are temporarily limited`) to DoS legitimate users.
  - Combined with knowing the hot-wallet allowance, an attacker can systematically deplete hot-wallet MORBIUS by causing every balance to be withdrawn at 5% fee burn for tokens that they cannot then deposit again easily.
- **Impact:** Griefing + forced fee loss + hot-wallet DoS. No direct theft (funds go to victim), but treats every player's balance as a public endpoint.
- **Recommendation:** Require a signed message (EIP-712) over `{amount, nonce, expiry}` in the body, verify `recoverAddress(...)` equals `address`. Reject duplicates via a per-wallet nonce table. The same fix should be applied to `/api/deposit/notify` (lower risk: writes a pending row, but still a spam vector).

### [SEC-004] WebSocket auth is opt-in via `REQUIRE_WS_AUTH=true`
- **Severity:** Critical
- **Complexity:** 1
- **Location:** `server/src/services/websocket.service.impl.js:61,348-389,496-498`.
- **Description:** The WebSocket service has an EIP-712 challenge implementation, but it only fires if `process.env.REQUIRE_WS_AUTH === 'true'`. The default behavior is to **trust the `?address=` query param** and immediately mark the connection `isAuthenticated = true`:
  ```js
  if (claimedAddress) {
    ws.playerAddress = claimedAddress;
    ws.isAuthenticated = true;
    ...
  }
  ```
  Every blackjack-multi/poker/tournament/chat handler downstream uses `ws.playerAddress` as the trusted player identity (e.g. `BJMultiPlaceBet` deducts balance from `ws.playerAddress`, `handlePokerAction` plays cards on `ws.playerAddress`'s seat).
- **Impact:** Attacker can connect with `wss://.../?address=0x<victim>` and play poker/blackjack on the victim's balance — losing it on the victim's behalf. They can also send chat as the victim and join/leave seats.
- **Recommendation:** Set `REQUIRE_WS_AUTH=true` in production env immediately (Complexity 1). Then plan a release that removes the fallback entirely — defaults should be "fail closed", not "fail open". The fallback's existence is a single-config-flag away from a catastrophic regression.

### [SEC-005] `/api/poker/admin/run-tests` runs Jest with no auth
- **Severity:** High
- **Complexity:** 1
- **Location:** `app/api/poker/admin/run-tests/route.ts:21-79`.
- **Description:** This Next.js route spawns the Jest binary inside `server/` for up to 120 seconds, with no auth, signature, or admin check. The `suite` body field is mapped through a hardcoded `SUITES` table (good — no command injection), but the route still:
  - Lets anyone CPU-DoS the prod box by spawning many Jest processes.
  - Leaks Jest test output (which may contain internal table IDs, addresses, fixtures) to the caller.
  - Has no rate limit (the Next.js layer doesn't apply Express rate-limit middleware).
- **Impact:** DoS (cheap CPU exhaustion), information disclosure.
- **Recommendation:** Either delete this route from production (`if (process.env.NODE_ENV === 'production') return 404`) or gate with the same EIP-712 admin-wallet check proposed in SEC-001. At minimum, add rate limiting and aggressive auth.

### [SEC-006] Cosmetics: `gift`, `grant`, and all `/cosmetics/admin/*` routes trust body-supplied address
- **Severity:** High
- **Complexity:** 2
- **Location:** `server/src/routes/cosmetics.routes.ts:73-91` (`gift`), `:93-109` (`grant`), `:111+` (all `admin/*` routes).
- **Description:** `gift` accepts `fromAddress, toAddress, itemKey` in the body and transfers an owned item from `fromAddress` to `toAddress`. No proof that the caller controls `fromAddress`. `grant` and the admin routes (create-item, bulk-shop-listed, tier-pricing, etc.) only check `isAdminWallet(adminAddress)` — which reads `adminAddress` from the body and checks if that string is in the env allowlist. The admin's wallet address is public knowledge, so any attacker can simply claim to be one.
- **Impact:** Total cosmetics economy compromise: theft of any wallet's items via `gift`; arbitrary item creation, price manipulation, bulk operations via the admin routes.
- **Recommendation:** Same EIP-712 signature pattern as SEC-001. For `gift`, the signed message must include `{fromAddress, toAddress, itemKey, nonce}` and recover to `fromAddress`. For `grant`/`admin/*`, the signed message recovers to `adminAddress`, then `isAdminWallet(recovered)` is checked.

### [SEC-007] Poker chip purchase/cashout impersonable
- **Severity:** High
- **Complexity:** 2
- **Location:** `server/src/server.ts:1645-1685` (`/api/poker/chips/purchase`), `:1687-1723` (`/api/poker/chips/cashout`).
- **Description:** Both routes take `address` from `req.body` and either (a) deduct MORBIUS and credit chips, or (b) deduct chips and credit MORBIUS. No signature. An attacker can:
  - Spam-convert a victim's MORBIUS balance into chips (or vice versa) to grief them — preventing them from withdrawing MORBIUS until they manually cash out chips, or preventing them from playing poker until they re-buy.
  - Race with the victim's own actions to cause "Insufficient" errors at critical moments.
- **Impact:** Griefing, denial of service against individual players. Funds remain in the wallet, but UX is destroyed.
- **Recommendation:** EIP-712 signature on each request (same shape as SEC-003).

### [SEC-008] `/api/player/profile` lets anyone edit any wallet's profile
- **Severity:** High
- **Complexity:** 2
- **Location:** `server/src/routes/player-mutation.routes.ts:22-115`.
- **Description:** The handler reads `address` (or `walletAddress`) from the body and calls `dbService.setDisplayName(normalizedAddress, ...)`. There is item-ownership validation for `avatarConfig` (good), but no proof the caller controls the address being modified.
- **Impact:** Attacker can rename any player to abusive content, replace their bio with phishing links, swap their avatar to display a fraudulent address, change their `xHandle`/`tgHandle` to attacker-controlled accounts. Display names show in chat and history pages.
- **Recommendation:** EIP-712 signature on `{address, profileFieldsHash, nonce, expiry}`, recovered server-side. Same pattern as SEC-003.

### [SEC-009] `/api/cosmetics/purchase` accepts body-supplied wallet for tx claim
- **Severity:** High
- **Complexity:** 3
- **Location:** `server/src/routes/cosmetics.routes.ts:40-71`, `server/src/services/cosmetics.service.ts` (recordPurchase).
- **Description:** Caller supplies `walletAddress, itemKey, txHash, currency`. The service verifies the tx on-chain matches the expected `txHash` and amount, but the **wallet being credited** comes from the body, not the tx's `from` address. If a victim broadcasts a purchase tx, an attacker who sees the mempool can race the legitimate POST and credit themselves the item by using their own `walletAddress` with the victim's `txHash`.
- **Impact:** Item theft via mempool front-running.
- **Recommendation:** In `recordPurchase`, recover the `from` address from the on-chain tx receipt and compare to the supplied `walletAddress`. Reject if mismatched. This avoids needing a signature on this specific route, since the tx is already authenticated by being signed on-chain.

### [SEC-010] `/api/tournament/:id/cancel|reclaim` accepts body-supplied address
- **Severity:** High
- **Complexity:** 2
- **Location:** `server/src/routes/tournament.routes.ts:87-137`, `server/src/services/tournament.service.ts:2636,2861`.
- **Description:** The service does check that the supplied `cancellerAddress`/`creatorAddress` matches the on-chain `tournament.creator_address` — but the address is body-supplied. The creator's address is *public* (it's in every tournament listing). Anyone can submit a cancel request claiming to be the creator and the route will execute.
- **Impact:** Mass tournament-cancellation griefing. For freeroll tournaments this triggers buy-in refunds (fine for players) and reclaims of escrowed prize MORBIUS to the *real* creator (so funds are safe), but the tournament is destroyed and players lose game state / can't re-enter the same tournament.
- **Recommendation:** EIP-712 signature on `{tournamentId, action, nonce}`, recover address, ensure recovered === DB `creator_address`. Same pattern across all "address in body asserting privilege" routes.

### [SEC-011] `/api/lottery/instant/play` impersonable
- **Severity:** High
- **Complexity:** 2
- **Location:** `server/src/services/platform.routes.ts:113-134`, `server/src/services/instant-lottery.service.ts:120`.
- **Description:** Caller supplies `address`; the service calls `wallet.writeContract(... resolvePlay(player=address, ...))` from the operator wallet. The on-chain `InstantLottery6of55.resolvePlay` requires `MORBIUS_TOKEN.safeTransferFrom(player, ...)`, so the player must have approved the contract — but if they have, *anyone* can spend their allowance by calling this route with their address. With a default `clientSeed=default`, the attacker effectively controls the seed input that drives the win/lose decision (only the operator-generated server seed is random).
- **Impact:** Burn through a victim's MORBIUS allowance with unfavorable bets. Attacker can choose `numbers` and `clientSeed` to optimize for low-payout outcomes (since they don't care about winning — they want to burn the victim's funds and harvest fees). 30 plays/min rate limit limits the bleed rate but doesn't fix the auth issue.
- **Recommendation:** Same as SEC-003. Either signed body, or require `msg.sender == address(contract operator)` and have the on-chain `resolvePlay` take a `playerSignature` arg that the contract verifies against `player`.

### [SEC-012] `/api/admin/memes` DELETE allows wiping all memes; POST has no auth
- **Severity:** High
- **Complexity:** 1
- **Location:** `app/api/memes/route.ts:107-141` (DELETE), `:69-104` (POST).
- **Description:** Two paths in `app/api/memes/route.ts`:
  1. DELETE accepts `id` and optional `wallet`. Without `wallet`, executes `DELETE FROM memes WHERE id = X` — anyone can delete any meme.
  2. POST writes a base64 `image_data` to the DB. No auth, no rate limit, no size cap visible — easy DB-bloat DoS by spamming massive images.
- **Impact:** Total meme gallery destruction; uncapped DB growth via large `image_data` blobs.
- **Recommendation:**
  - DELETE: require `wallet` and an EIP-712 signature, only delete if `wallet_address = wallet` AND signature recovers to `wallet`.
  - POST: require `walletAddress` + signature; rate-limit per wallet; cap `image_data.length` (e.g. 200 KB after base64 = ~150 KB image).

### [SEC-013] `block.timestamp` randomness in `BigWheel` includes `block.prevrandao`
- **Severity:** High (subset of SEC-002, but worth calling out)
- **Complexity:** 4
- **Location:** `contracts/contracts/BigWheel.sol:280-291`.
- **Description:** BigWheel adds `block.prevrandao` to the seed mix. On post-merge Ethereum, `prevrandao` is a future value when the block is being built — but it is *fully under the validator's control* (the validator sees `prevrandao` before deciding whether to include the tx). On PulseChain (PoS-ish, similar EVM semantics), the validator who builds the block can choose to drop transactions whose `prevrandao` produces a losing wheel. Same attack as SEC-002 for any validator running a casino-arbitrage script.
- **Impact:** Validators / coordinator can extract maximum payouts from BigWheel.
- **Recommendation:** Same as SEC-002 — move to commit-reveal or server-signed outcomes.

### [SEC-014] No CSP / X-Frame-Options / HSTS in `next.config.ts`
- **Severity:** Medium
- **Complexity:** 1
- **Location:** `next.config.ts:1-101` — no `async headers()` block.
- **Description:** The Next config doesn't ship any security headers. The frontend can be iframed (clickjacking risk for the wallet-connect flow), and there is no CSP to block inline JS injection if any XSS slips through (e.g. via the `dangerouslySetInnerHTML` welcome message in `BlackjackMultiInfoPanel.tsx:136`). No HSTS pins HTTPS.
- **Impact:** Clickjacking the connect-wallet button into a hidden iframe; absence of CSP means future XSS finds are immediately weaponizable.
- **Recommendation:** Add an `async headers()` returning a baseline set:
  ```ts
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; ..." }
  ```
  A nonce-based CSP is ideal but `'unsafe-inline'` is acceptable as a first step. Tighten incrementally.

### [SEC-015] `dangerouslySetInnerHTML` on chat welcome message
- **Severity:** Medium
- **Complexity:** 2
- **Location:** `components/BLACKJACK/multi/BlackjackMultiInfoPanel.tsx:136` (and similar in `app/blackjack-multi/[tableId]/page.tsx:866-876`, `components/poker/PokerActivityFeed.tsx:381`).
- **Description:** The welcome message body is built client-side with template strings interpolating `minBet`/`maxBet` from the server state, then rendered via `dangerouslySetInnerHTML`. `formatMorbius` produces only numeric strings today so it's safe, but the pattern is dangerous: if any other variable is ever added (e.g. a server-supplied `welcomeMessage`), it becomes immediate XSS. The `<a href=...>` links in the welcome string are hardcoded — fine for now, but a future-self trap.
- **Impact:** Low today (no user-controlled input flows into the HTML); a single careless edit turns it into stored XSS.
- **Recommendation:** Replace with React elements: `<span><b>Morbius.IO</b> — ...</span>` etc. No `dangerouslySetInnerHTML` for content that can be expressed as JSX.

### [SEC-016] EIP-712 auth challenge domain doesn't include `verifyingContract`
- **Severity:** Medium
- **Complexity:** 1
- **Location:** `server/src/services/websocket.service.impl.js:28-38`.
- **Description:** `AUTH_EIP712_DOMAIN = { name: 'MORBlotto Blackjack', version: '1', chainId: 369 }` — no `verifyingContract` and no `salt`. A signature from this domain is valid on any wallet for any nonce + same domain. Since the nonce is 32 random bytes per connection it's hard to replay across users, but a malicious dApp that uses the same domain could trick a user into signing a valid auth.
- **Impact:** Low — the random nonce makes reuse hard. But a phishing dApp could potentially issue the same domain+nonce and trick users.
- **Recommendation:** Add `verifyingContract` (the URL of the backend, or a unique per-deployment address) and a `salt` derived from deployment. Even though there's no actual contract, putting a sentinel address bounds the domain.

### [SEC-017] Hot-wallet private key in env, no HSM
- **Severity:** Medium
- **Complexity:** 4
- **Location:** `server/src/services/money.service.ts:60-63` (`HOT_WALLET_PRIVATE_KEY`), `server/src/server.ts:47-56`.
- **Description:** The MORBIUS hot wallet that signs withdrawal `ERC20.transfer` calls is loaded from `process.env.HOT_WALLET_PRIVATE_KEY`. Standard cloud-env risk: anyone with shell access to the Railway/Vercel deployment can dump the env and steal the hot wallet's full balance. There's no per-tx approval limit on-chain; the hot wallet has full ERC20 approval over its MORBIUS balance.
- **Impact:** Compromise of the deployment → full drain of the hot wallet.
- **Recommendation:** (a) Document and *enforce* a max hot-wallet balance (replenish from cold wallet daily/weekly, not all at once). (b) Migrate to KMS-signed transactions (AWS KMS, GCP KMS, or Fireblocks) so the private key never leaves the HSM. (c) Add an on-chain "max withdrawal in last 24h" cap that's enforced by the contract, not just the DB.

### [SEC-018] BJ V2 `dailyWithdrawalTotals` global cap is too high vs. hot wallet
- **Severity:** Medium
- **Complexity:** 2
- **Location:** `contracts/contracts/BlackjackV2.sol:68,271,337`.
- **Description:** `MAX_DAILY_WITHDRAWAL = 1_000_000e18` per player; global cap is `MAX_DAILY_WITHDRAWAL * 10 = 10,000,000 MORBIUS / day`. If the hot wallet holds say 100k MORBIUS, an attacker who compromises one user's session can drain *all* of it in a single day without hitting the cap.
- **Impact:** Daily cap doesn't bound real-world damage to hot-wallet liquidity.
- **Recommendation:** Add a contract-level "max sum of `withdrawWithSignature` per `nonce-window`" tied to actual reserve. The simpler fix: ensure the operational policy keeps `MORBIUS_TOKEN.balanceOf(hotWallet)` < some cap, with automated alerts.

### [SEC-019] BJ V2 `revealServerSeed` callable by anyone
- **Severity:** Medium
- **Complexity:** 1
- **Location:** `contracts/contracts/BlackjackV2.sol:447-453`.
- **Description:** `revealServerSeed(bytes32)` writes to `revealedSeeds[hash]` and emits `ServerSeedRevealed`. Anyone can call it with any seed. If an attacker grinds a seed whose `keccak256` collides with the same `seedHash` an operator was going to reveal, they "pre-reveal" it. Practically impossible by brute force (`bytes32` space), but the lack of access control is unusual.
- **Impact:** Negligible in practice (2^256 search). Could be used to grief verification UX by emitting `ServerSeedRevealed` with garbage seeds that don't match any in-flight commitment.
- **Recommendation:** Restrict to `onlyAuthorizedServer`. Cheap defense-in-depth.

### [SEC-020] `crossOriginResourcePolicy: cross-origin` weakens Helmet defaults
- **Severity:** Low
- **Complexity:** 1
- **Location:** `server/src/server.ts:97-100`.
- **Description:** Helmet is enabled but with `crossOriginResourcePolicy: { policy: 'cross-origin' }` and `crossOriginOpenerPolicy: false`. This relaxes Helmet's Spectre-mitigation defaults. The serving of `/uploads` cross-origin is the reason, but the policy could be scoped to just that route.
- **Impact:** Minor — minor Spectre / cross-origin leak risk in the API responses themselves.
- **Recommendation:** Move the `Cross-Origin-Resource-Policy: cross-origin` header to the `/uploads` static middleware only, keep Helmet's strict defaults globally.

### [SEC-021] Rate limit of 1000 req/min is too lax for sensitive routes
- **Severity:** Medium
- **Complexity:** 2
- **Location:** `server/src/server.ts:113-124`.
- **Description:** Global Express rate limit is 1000 requests/minute/IP. Sensitive routes (`/api/withdraw`, `/api/poker/chips/{purchase,cashout}`, `/api/cosmetics/gift`, `/api/player/profile`) are not specially limited. Combined with the no-auth issues above, an attacker behind a residential proxy network can grief thousands of victims per hour.
- **Impact:** Amplifies the impact of every other auth issue in this report.
- **Recommendation:** Per-route limits: 10/min for `/api/withdraw`, 30/min for chip purchase/cashout, 5/min for `/api/player/profile`, etc. Use the `instantLotteryPlayLimiter` pattern that's already in the codebase. Keyed on IP *and* address.

### [SEC-022] CORS default-true for missing Origin
- **Severity:** Low
- **Complexity:** 1
- **Location:** `server/src/server.ts:101-110`.
- **Description:** `if (!origin) return cb(null, true);` — same-origin and non-browser callers (curl, server-to-server) are allowed unconditionally. Combined with `credentials: true`, a server-side caller with a stolen session can act on behalf of users. Lower priority because there's no real session/cookie auth yet.
- **Impact:** Low today; becomes a vector once cookie/session auth is introduced.
- **Recommendation:** When session/cookie auth is added, scope `credentials: true` to specific routes and tighten the origin check (don't auto-allow no-origin).

### [SEC-023] Build-time TypeScript bypass (`ignoreBuildErrors: true`)
- **Severity:** Medium
- **Complexity:** 5
- **Location:** `next.config.ts:94-97`.
- **Description:** `typescript: { ignoreBuildErrors: true }` means any type error anywhere in `app/` or `lib/` will ship. Type confusion bugs (e.g. passing a string where a `bigint` is expected, or `null` where a `0x...` address is) become runtime issues, often money-relevant in this codebase.
- **Impact:** Systemic — every other finding in this report has a higher probability of getting worse, not better, between releases.
- **Recommendation:** Allocate a dedicated cleanup sprint. Use `tsc --noEmit` in CI as a *separate gate*, label it "Type Check," and make it required for merges. Fix the existing errors file-by-file; turn off `ignoreBuildErrors` only after the queue is empty.

### [SEC-024] Hardcoded interval string in `getMetricsAggregates` SQL is safe but pattern is fragile
- **Severity:** Info
- **Complexity:** 2
- **Location:** `server/src/services/database.service.ts:2715-2728,2761-2786`.
- **Description:** Time-range strings (`INTERVAL '24 hours'` etc.) are interpolated into raw SQL via `${interval}`. The values come from a fixed enum (`'24h' | '7d' | '30d' | 'all'`) checked above the query construction, so there is *currently* no injection. But if anyone adds a new range and forgets the enum check, this becomes an SQLi gadget.
- **Impact:** None today, latent risk.
- **Recommendation:** Add a defensive cast: `const intervalSql = ALLOWED_INTERVALS[range]` with `as const` map, fail closed on unknown values. Or pass the interval as a parameter (`pg` supports `$1::interval`).

### [SEC-025] Service worker uses `defaultCache` — verify it doesn't cache `/api/*`
- **Severity:** Medium
- **Complexity:** 2
- **Location:** `app/sw.ts:28`.
- **Description:** The SW imports `defaultCache` from `@serwist/next/worker` and uses it as `runtimeCaching`. Serwist's `defaultCache` is "network-first for navigations, stale-while-revalidate for static," which *generally* skips `/api/*`, but the matching rules are package-version-dependent. The comment in the SW says "do NOT add runtime caching for /api/* or /ws*" — implying past confusion or an intentional reminder. If `defaultCache` ever changes its API-matching rules, users could be served stale balances or game results.
- **Impact:** Stale game state or balance shown to users; could cause double-spend illusions or wrongly-displayed payouts.
- **Recommendation:** Replace `runtimeCaching: defaultCache` with an explicit array that *excludes* `/api/*` and `/ws*`. Add a unit test that asserts the SW does not cache a `/api/withdraw/pending` response.

### [SEC-026] Upload directory is rendered absolute base URL from `req.protocol + req.get('host')`
- **Severity:** Low
- **Complexity:** 1
- **Location:** `server/src/server.ts:96-104` (uploads dir), upload route in `routes/admin.routes.ts:89-110`.
- **Description:** When `BACKEND_PUBLIC_URL`/`RAILWAY_STATIC_URL` env vars are missing, the upload handler falls back to `${req.protocol}://${req.get('host')}`. An attacker who can spoof the `Host` header (depends on proxy config) gets their host string written into the DB row's `src`. Future renders of that table image will load from the attacker's host.
- **Impact:** Stored "host-poisoning" → image / video assets served from attacker domain, possible XSS via SVG or MITM tracking. Requires admin auth to trigger (already broken — see SEC-001), but adds defense-in-depth.
- **Recommendation:** Require `BACKEND_PUBLIC_URL` to be set in production (fail closed if missing). Don't trust `req.get('host')`.

### [SEC-027] `tournament.service.ts` cancel/refund loop has poor partial-failure semantics
- **Severity:** Medium
- **Complexity:** 3
- **Location:** `server/src/services/tournament.service.ts:2683-2700`.
- **Description:** For on-chain tournament cancellations, the loop calls `refundMorbiusTournamentPlayer` for each entry. If a refund fails, the loop logs a warning and continues. The DB transaction has already cancelled the tournament; players who failed to refund are now in a "tournament cancelled, no refund" state with no automatic recovery.
- **Impact:** Some players permanently lose buy-ins on cancellation race conditions / RPC flakes. Requires manual admin intervention.
- **Recommendation:** Persist refund-pending rows in DB, run a worker that retries failed refunds with exponential backoff. Don't mark the tournament as fully refunded until all rows are settled.

### [SEC-028] Profile bio not HTML-escaped before display
- **Severity:** Low
- **Complexity:** 1
- **Location:** `server/src/services/websocket.service.impl.js:1347` (`bio: payload.bio.trim().slice(0, 200)`).
- **Description:** The bio field is sliced to 200 chars but not stripped of HTML / control characters. The frontend likely uses `{bio}` interpolation (safe by default in React) — but if it ever gets rendered via `dangerouslySetInnerHTML` (as the welcome message does), stored XSS becomes trivial. Same applies to `xHandle`/`tgHandle`.
- **Impact:** None today, latent risk.
- **Recommendation:** Centralize sanitization in a `sanitizeProfileField()` utility that strips/escapes HTML. Apply on write.

### [SEC-029] Poker tournament seat shuffle uses `Math.random()`
- **Severity:** Low
- **Complexity:** 2
- **Location:** `server/src/services/poker-tournament.service.ts:589-597`.
- **Description:** Tournament seat assignment and final-table seat draw use `Math.random()`. Cards are still drawn from `pfService.fisherYatesShuffle`, but seat order determines blinds rotation and initial position — which carries non-trivial EV in tournament poker. `Math.random()` is not cryptographically secure; a skilled attacker monitoring server entropy could predict assignments.
- **Impact:** Slight tournament-fairness concern. Not catastrophic.
- **Recommendation:** Use `crypto.randomInt` for seat assignment. Trivial change.

### [SEC-030] Refund grief via `MorbiusTournament.refund(player)` requires no auth from caller
- **Severity:** Low
- **Complexity:** 2
- **Location:** `contracts/contracts/MorbiusTournament.sol:193-204`.
- **Description:** `refund(tournamentId, player)` is callable by anyone after a tournament is cancelled. The funds go to `player`, so no theft, but an attacker can pay the gas to forcibly settle every cancelled tournament's refunds at *their* preferred time — e.g. before the player can call themselves with a private mempool route. Not exploitable today; flagged for design clarity.
- **Impact:** None concrete; gas-griefing.
- **Recommendation:** Add `require(msg.sender == player || msg.sender == authorizedServer)` if you want refund-time control. Otherwise accept the current design.

## Cross-cutting observations

1. **"Trust the request body's address" is endemic.** SEC-001, -003, -006, -007, -008, -009, -010, -011 are all instances of the same anti-pattern: take a wallet address from `req.body` / `req.params`, treat it as authoritative, mutate state. The fix is uniform — EIP-712 signed envelope — and should be a single library that every mutation route consumes. A `requireSignedAddress(req, fields)` helper that returns `{ address, signature, nonce, fields }` after verifying.

2. **No session layer.** RainbowKit handles wallet *connection* on the frontend, but there is no server-side session bound to that wallet. Every request must independently re-prove identity. This is the right model for a Web3 app — but the implementation needs the signed-envelope pattern above to actually deliver it.

3. **TypeScript errors are bypassed at build time.** SEC-023. Every other finding has a higher probability of getting worse, not better, between releases. Until this is fixed, type-confusion bugs that affect money math (BigInt vs string vs number) can ship undetected.

4. **No security headers at the edge.** SEC-014 lists what's missing. A small dent in CSP/HSTS posture today; a much bigger one once XSS or clickjacking is found.

5. **WebSocket security is opt-in.** SEC-004. The `REQUIRE_WS_AUTH=true` flag should be the default and the `false` branch deleted. "Fail closed" is the rule for auth.

6. **On-chain RNG is not provably fair.** SEC-002, -013. The Instant Lottery has been migrated to a server-driven PF model; the same migration must happen for Plinko, Roulette, BigWheel, Keno PLS path. Until then, treat those contracts as economically unsound for any motivated adversary.

7. **The 5% fee split is consistent.** Spot-checked `BlackjackV2._computeWithdrawalFees`, `Plinko._computePayoutFees`, `CryptoKeno._computeWagerFees`, `InstantLottery6of55._computeWagerFees`, `MoneyService.distributeWithdrawalFee` — all use 125/50/175/150 bps → 500 bps total. Internally consistent with CLAUDE.md.

## Things that look fine

- **SQL parameterization:** Every query I read uses `$1`/`$2` placeholders or Neon's tagged template (`sql\`...${param}...\``, which is also parameterized). The few cases of `${variable}` in raw SQL strings are interpolating values from fixed enum maps, not user input (`getMetricsAggregates`).
- **Poker provably-fair shuffle:** `poker-game.service.ts:2138` overrides `table.newDeck` with the result of `pfService.fisherYatesShuffle(serverSeed, clientSeed, 0)` — chevtek's `Math.random()` shuffle is bypassed exactly as CLAUDE.md mandates. The plaintext server seed is stored in `poker_hand_pending_seeds` and only published to `poker_hands.server_seed` at showdown.
- **`MerkleClaimMorbius` / `MerkleClaimLP`:** Standard OZ-pattern Merkle claims with double-hash leaves, `hasClaimed` mapping, revocation only allowed before any claims, `nonReentrant` on `claim`. Looks well-built.
- **`BlackjackV2.withdrawWithSignature`:** Proper EIP-712 (full domain separator including `chainId` and `verifyingContract`), nonce tracking via `usedNonces`, expiry check, daily caps. Compares signer to `authorizedServer`. Settlement path is correctly authenticated.
- **`MoneyService` (hot withdraw queue):** Atomic `UPDATE players SET balance = balance - $2 WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2` deduct + `FOR UPDATE SKIP LOCKED` worker queue. Fee distribution at the contract level uses 125/50/175/150 bps. All BigInt arithmetic — no floating point. The withdrawal *flow* is correct (it's the *authentication* that's broken — see SEC-003).
- **Helmet + CORS:** Helmet is enabled with sensible overrides for static uploads. CORS is allowlist-driven via `FRONTEND_URL` env. CORS check is a real allowlist, not `origin: '*'`.
- **`.env` hygiene:** `.gitignore` exhaustively excludes `.env*` variants; no `.env` files committed to git (verified via `git ls-files | grep env` — only `node_modules` hits).
- **Upload sanitization:** Filenames are normalized with `replace(/[^a-zA-Z0-9-_]/g, '_')`. Multer enforces file type allowlist (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `video/mp4`, `video/webm`) and size caps (5 MB / 50 MB).
- **Chat display name sanitization:** `displayName` strips non-`\w\s-` chars, enforces length 3-32 (`websocket.service.impl.js:1336`).
- **Service worker:** `app/sw.ts` explicitly comments to never cache `/api/*` or `/ws*`. (Verify `defaultCache` honors this — see SEC-025.)
- **Reentrancy:** Every payable / external token-moving function in the contracts has `nonReentrant`. `BlackjackV2.receive()` reverts to prevent unaccounted PLS.
