# Backend audit — MORBlotto (`server/`)

## TL;DR

The backend is a single Express + WebSocket process (Railway-deployable) backing on-chain casino games on PulseChain. Core money flow (deposits, hot-wallet withdrawals, blackjack stake/payout) is **correctly atomic** at the DB layer (transactional `UPDATE … WHERE balance >= $`, `FOR UPDATE SKIP LOCKED` worker queue, BigInt-only arithmetic, 5% fee split = 125/50/175/150 bps confirmed). Poker provably-fair shuffle override is properly wired and never touches `Math.random()`.

But the surface around that core is concerning. Several **critical** issues:

1. `POST /api/withdraw` requires no signature — anyone who knows a player's address can drain that player's off-chain balance to the player's wallet (and, worse, the address is taken verbatim from `req.body.address` — see BE-001 for the exact attack).
2. WebSocket auth is gated behind `REQUIRE_WS_AUTH=true` *opt-in*. In production today the WS layer trusts `?address=<victim>` query params and writes balance from `ws.playerAddress` — so the entire poker/blackjack-multi/tournament real-time domain is impersonable until that flag is flipped.
3. Tournament cancel/reclaim, profile edits, cosmetic gift/list, `x-admin-wallet`-gated admin endpoints, and merkle epoch admin all accept a wallet from `req.body` / `req.headers` with **no signature** — only string equality vs `ADMIN_WALLETS` env list.
4. `express.json()` with no size limit, `helmet({ crossOriginResourcePolicy: 'cross-origin', crossOriginOpenerPolicy: false })`, single `1000 req/min` global limiter, **zero zod usage** despite the dep.
5. Scheduler functions (`get_pending_scheduled_events`) have no `FOR UPDATE SKIP LOCKED` — running two instances will double-execute every freeroll start/end.

Six issues are **critical** (BE-001 through BE-006). Fix BE-001 (withdraw signature) and BE-002 (default to `REQUIRE_WS_AUTH=true`) before onboarding more users — those two are exploitable today against any wallet whose address is public.

## Legends

**Severity**
- **Critical** — data loss, fund risk, auth bypass, or availability incident.
- **High** — correctness bug under load, missing rate limit on a money path, easily-triggered DoS.
- **Medium** — code smell with realistic risk.
- **Low** — polish / hygiene.

**Complexity**
- **S** — under an hour, single file.
- **M** — a few files, a small refactor.
- **L** — touches a domain (auth shape, schema, queue), 1–2 days.
- **XL** — design discussion needed.

---

## Findings

### BE-001 — `/api/withdraw` is auth-less; anyone can drain any off-chain balance — **Critical / S**

`POST /api/withdraw` accepts `{ address, amount }` from the JSON body and queues a hot-wallet ERC20 `transfer` to that address. No signature, no header check, no nonce, no challenge.

```ts
// server/src/routes/money.routes.ts:84-94
app.post('/api/withdraw', async (req, res) => {
  const { address, amount } = req.body ?? {};
  const result = await moneyService.enqueueWithdrawal(address, amount);
  ...
});
```

`enqueueWithdrawal` (`server/src/services/money.service.ts:381`) deducts `players.balance` atomically and inserts a `hot_withdrawal_jobs` row, which the background worker then sends to the address in the JSON body. The recipient of the on-chain transfer is the address from the body, so this isn't a theft-to-attacker scenario — but it **is** a remote "force-withdraw" attack: an attacker who knows victim A's address can drain A's off-chain balance back to A's wallet (the only thing the attacker actually gains is denying A any further off-chain play and incurring the 5% fee). Combined with BE-002 (WS impersonation), the attacker can also place losing wagers from A's account to bleed the balance first.

Fix: require an EIP-712 signature over `(address, amount, nonce, expiresAt)` from the player's private key, exactly like the on-chain withdraw nonce flow already used elsewhere. The signing utility exists at `server/src/utils/withdraw-sign.ts`.

### BE-002 — WebSocket auth is opt-in; `REQUIRE_WS_AUTH=true` is not the default — **Critical / S**

`server/src/services/websocket.service.impl.js:61,63`:

```js
const REQUIRE_WS_AUTH = process.env.REQUIRE_WS_AUTH === 'true';
const DISABLE_WS_AUTH = process.env.DISABLE_WS_AUTH === 'true';
```

If `REQUIRE_WS_AUTH` is anything other than the literal string `"true"`, the WS handshake just trusts `?address=<X>`:

```js
// handleConnection, line 360-364
} else {
  // No challenge: trust query-param address
  if (claimedAddress) {
    ws.playerAddress = claimedAddress;
    ws.isAuthenticated = true;
```

Every downstream handler (poker, blackjack-multi, blackjack solo `createGame`, `placeBet`, `tipDealer`, profile edits, tournament join, exclusion changes) is gated only on `ws.playerAddress`. `server.ts:238-244` *logs a warning* in production if `REQUIRE_WS_AUTH !== 'true'` but does not refuse to boot. Per the comment in `service-registry.ts`, "the strict gate proved too fragile during launch ops" — so the launch posture is "log and run insecure."

Fix: default `REQUIRE_WS_AUTH` to true and only allow `false` in development. Add a hard refusal-to-boot in production when the flag is off and `NODE_ENV=production`.

### BE-003 — Tournament `cancel` / `reclaim` accept canceller in body without signature — **Critical / M**

`server/src/routes/tournament.routes.ts:87-110, 111-137`:

```ts
app.post('/api/tournament/:tournamentId/cancel', async (req, res) => {
  const { cancellerAddress } = req.body;
  await tournamentService.cancelTournament(tournamentId, cancellerAddress);
});
```

`cancelTournament` then compares `cancellerAddress.toLowerCase() === creator_address.toLowerCase()` (`tournament.service.ts:2648`). Anyone who knows the creator's address can:
- cancel any active off-chain tournament and refund all entrants' buy-ins back to themselves
- call `creatorReclaimFunds` and trigger an on-chain reclaim from the escrow contract

For on-chain tournaments the on-chain `cancelMorbiusTournament` call will revert if the txn isn't signed by the creator's key (assuming the contract verifies). But the off-chain branch (`tournament.buy_in_amount > 0n && !isOnChain`) refunds DB balance directly with no on-chain check — this is straight-up unauthorized refund of every entrant.

Fix: require EIP-712 signed `cancel` payload from the creator. The same fix applies to `reclaim`.

### BE-004 — Profile / cosmetics / market routes trust unsigned `address` body — **Critical / M**

Every cosmetic-related mutation accepts wallet addresses from the body and never verifies the caller controls those keys:

- `POST /api/player/profile` (`server.ts:400`, also `player-mutation.routes.ts:22`) — set any address's displayName, avatarConfig, bio, X/Telegram handle, profile image URL. No auth.
- `POST /api/cosmetics/gift` — `{ fromAddress, toAddress, itemKey }` — transfer cosmetics out of any account whose address you know.
- `POST /api/cosmetics/market/list`, `cancel`, `update-price` — list, cancel, or reprice any owner's market entries.
- `POST /api/cosmetics/grant` — `{ adminAddress, targetAddress, itemKey }` — grants if `isAdminWallet(adminAddress)` (string-compare to `ADMIN_WALLETS` env). Knowing an admin's *public* address is enough to mint inventory.
- `POST /api/cosmetics/admin/create-item`, `admin/item`, `bulk-shop-listed`, `tier-pricing` — same `adminAddress` body-claim pattern.

Fix: profile + market + gift should require an EIP-712 signature over `(action, fromAddress, params, nonce)`. Admin endpoints should not exist on a public route at all — move them under `/api/admin/*` (which is gated by `x-admin-secret`), or require a signature from the admin wallet that the server can verify against `ADMIN_WALLETS`.

### BE-005 — `x-admin-wallet` admin gating is impersonable — **Critical / M**

Several admin endpoints use `req.headers['x-admin-wallet']` + `isAdminWallet()` instead of the `x-admin-secret`/`AP` middleware:

- `POST /api/admin/browser-upload` (`server.ts:2141`) — admin file upload exempted from the `/api/admin` secret middleware
- `POST /api/admin/poker/bots/bootstrap`, `bots/stop`, `bots/status` (`admin.routes.ts:340,435,464` via `assertPokerBotControlAllowed`)
- `DELETE /api/admin/chat/messages/:id` (`admin.routes.ts:809`)

The header is a plain string set by the client. With only an admin's public address (which is **published** in the `ADMIN_WALLETS` env list and visible in any "is admin?" client check) any caller can spoof it. The `x-admin-secret` middleware on `/api/admin` is the only real auth — the browser-upload exemption defeats that for arbitrary file upload.

Fix: either drop the `browser-upload` exemption and use the same admin secret with a proxied upload, or require an EIP-712 signature on the upload challenge.

### BE-006 — Schedulers double-fire on multi-instance deploy — **Critical / M**

Two pieces of cron-style work poll for pending jobs and don't lock them:

1. `FreerollSchedulerService` (`server/src/services/freeroll-scheduler.service.ts:86`) calls `get_pending_scheduled_events(10)`. That SQL function (migration 015) returns rows ordered by `scheduled_at` with no `FOR UPDATE SKIP LOCKED`. Two processes scheduled the same poll second will both `executeScheduledEvent` for every freeroll start/end/reentry-close — duplicate refunds, duplicate prize distribution, duplicate WebSocket broadcasts, broken accounting.
2. `TournamentSchedulerService.processTimeExpiredTournaments` (line 54) — same problem; both instances will call `handleTimeExpiredTournament(row.id)` for every time-expired row.
3. `MerkleDropsService.startCron` / `MerkleDropsLPService.startCron` — gated only by env flags, no DB-level "I'm the leader" check.

This is only critical if you ever run two processes (or a rolling deploy with overlap, or a forgotten background runner). Railway one-replica deploys are safe today. The moment you scale horizontally or run a script locally with the same `DATABASE_URL`, you get duplicate payouts.

Fix: wrap the read with `FOR UPDATE SKIP LOCKED` and the execute path in a transaction that flips the row's status before `COMMIT`. Or add a `pg_advisory_lock` around each scheduler tick.

### BE-007 — Zero zod usage despite being a dependency — **High / L**

`zod` is in `server/package.json` but `grep -rln "z\.object\|z\.parse\|from 'zod'" server/src/` returns zero results. Every route does ad-hoc validation:

```ts
// admin.routes.ts:165
if (!kind || !name || !src) { res.status(400)... }
if (kind !== 'image' && kind !== 'video') { res.status(400)... }
```

…then trusts the rest of the body (`description`, `token_contract_address`, `iframe_url`) by passing them straight through to SQL inserts. Most route handlers read fields with `as string` casts and never bound length, format, or type. `cosmetics.routes.ts:181-187` is the *only* route I found that bounds length and regex-checks. The 1062-line `admin.routes.ts` accepts arbitrary `req.body.tables` arrays and `req.body.config` objects.

The risk surface: stored XSS through profile fields (displayName, bio, social handles, profileImageUrl) is rendered in chat / leaderboards; uncontrolled object inserts can balloon JSONB columns. There's no zod schema for any WS message either.

Fix: introduce a `schemas/` module with one zod schema per route + WS message, and a tiny `validateBody(schema)` middleware. Start with money/withdraw/tournament/cosmetics — those are the abuse-leverage routes.

### BE-008 — `POST /api/withdraw` not rate-limited beyond the global 1000/min — **High / S**

Only the global limiter (`1000 req/min/IP`) and `instantLotteryPlayLimiter` (`30/min/IP`) exist. The withdrawal route — assuming BE-001 is fixed, even — has no per-address or per-wallet rate limit. An attacker (or a buggy client retry loop) can enqueue many withdrawals per second per wallet, each pinning hot-wallet liquidity and burning gas on the broadcaster.

Fix: add a `rateLimit` on `/api/withdraw` with `keyGenerator: req => req.body?.address`. Also rate-limit `/api/deposit/notify`, `/api/cosmetics/market/buy`, `/api/cosmetics/purchase`, and `/api/reports` (which only has anon IP + per-wallet "5/hour" rate, no Express limiter).

### BE-009 — `instantLotteryService.play` doesn't verify caller owns the address — **High / S**

`server/src/routes/platform.routes.ts:113` (`POST /api/lottery/instant/play`) takes `address` from the body and uses it as the `args[0]` of `instantLottery.resolvePlay(...)`. Anyone can trigger a play on anyone's behalf. The on-chain contract debits *that* address's MORBIUS allowance, but if a victim has approved the lottery contract for a high amount, an attacker can repeatedly burn their allowance (with 5% fees + bad luck) at no cost to themselves.

Fix: same signature challenge as BE-001. Cheap mitigation in the meantime: reject if the caller's IP has played for `address` < 1 minute ago AND no signature was provided.

### BE-010 — `uncaughtException` keeps the process alive on every error — **High / M**

`server.ts:4915`:

```ts
process.on('uncaughtException', (err) => {
  if (message.includes(PG_POOL_DOUBLE_RELEASE_MSG)) { ... return; }
  console.error('[FATAL] Uncaught exception — keeping server alive:', err);
  logger.error('Uncaught exception:', err);
});
```

The pg-pool double-release swallow is fine. But silently keeping the process alive on *any* uncaught exception is dangerous in a money-handling server — the next request may run with corrupted in-memory state (`activeTables` in poker, the pf service caches, etc). Common practice is to log + restart for non-whitelisted errors and let the supervisor (Railway) reschedule.

Fix: only swallow the known pg-pool message; for everything else, `process.exit(1)` after logging. Health-check + Railway will rotate the container.

### BE-011 — Hot-withdrawal worker has no retry / backoff on broadcast failures — **High / S**

`MoneyService.processHotWithdrawalQueue` (`money.service.ts:465`) claims a job via `FOR UPDATE SKIP LOCKED`, then calls `walletClient.writeContract(...)`. If that throws (RPC blip, nonce mismatch, hot wallet temporarily low), the job is marked `failed` permanently — *the comment says* "no refund — contact support."

Real failure modes during a network blip include "nonce too low" and "replacement transaction underpriced," which are transient. Marking these failed forever and forcing a support intervention is fragile. There's also no on-chain nonce reconciliation: if the RPC says "failed" but the tx actually went through, the job stays `failed` while the user got paid.

Fix: classify error codes; retry transient ones N times before marking failed. On `failed`, re-credit the player's balance after confirming on-chain that the tx didn't execute.

### BE-012 — No body size limits on `express.json()` — **High / S**

`server.ts:127` and `bootstrap/app-setup.ts:56` both call `express.json()` with no `limit` option (default 100 KB). For the routes that accept arrays (admin `tables/seed`, `bulk-shop-listed`, the `recentErrors` array in `POST /api/reports`, `req.body.config` arbitrary object), this is the only backstop. Set an explicit limit (e.g. `100kb` for most, `1mb` for admin bulk operations) so future routes can't accidentally accept multi-MB payloads.

### BE-013 — `helmet` is loosened more than required — **Medium / S**

`bootstrap/app-setup.ts:31` and `server.ts:97`:

```ts
helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
})
```

`crossOriginOpenerPolicy: false` is unusual — the default is `'same-origin'`. There's also no CSP (`contentSecurityPolicy`) and no `referrerPolicy` configured. The API doesn't serve HTML, so CSP matters less, but `Cross-Origin-Resource-Policy: cross-origin` applied to the entire app (including `/uploads/`) means anyone can `<img>`-tag your blackjack table assets from anywhere — probably intended. The `crossOriginOpenerPolicy: false` doesn't have an obvious reason to be off.

Fix: re-enable COOP at default, document why CORP is loosened.

### BE-014 — Logger writes addresses + balances + tx hashes to file with no rotation — **Medium / M**

`utils/logger.ts` writes `logs/error.log` and `logs/combined.log` with `winston` File transports — no `maxsize`, no `maxFiles`. Sampled logs include wallet addresses, balance deltas, withdrawal nonces, and tx hashes (e.g. `money.service.ts:482, 513`, `database.service.ts:1140`). PII risk is low (addresses are public anyway), but disk-fill risk is real and tx-hash-with-wallet correlation could be exfiltrated if the log file leaks.

Fix: add `maxsize: 10485760, maxFiles: 5, tailable: true` on file transports. Consider redacting wallet/tx values to first 8 chars in `info` logs.

### BE-015 — `/health` endpoint doesn't verify dependencies — **Medium / S**

`server.ts:228`:

```ts
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

It returns 200 even if the DB is down or the WS server hasn't initialized. Railway will report the container healthy and route traffic to it during startup. The `/api/admin/health` endpoint (line 498 in `admin.routes.ts`) does real checks but is secret-gated and 30s slow.

Fix: gate `/health` on a short DB ping (`SELECT 1`) and a check that `wsService` is constructed. Alternatively expose `/health/ready` separately.

### BE-016 — `Math.random()` for nonces in `instant-lottery.service.ts` and `database.service.ts` — **Medium / S**

`instant-lottery.service.ts:162`:
```ts
const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
```

Used as the per-play nonce passed to the contract. Two concurrent plays on the same Date.now() can collide 1-in-1000 — the contract enforces `PlayIdAlreadyUsed` revert so this is recoverable, but a "0xd0bf0d96 Duplicate play id detected" 409 is user-visible.

`database.service.ts:573`:
```ts
const nonce = -BigInt(Date.now()) * 1000000n - BigInt(Math.floor(Math.random() * 1000000));
```

Used as a synthetic "completed hot-withdrawal" nonce in `pending_withdrawals`. Lower collision risk. Could still bite under sustained throughput.

Fix: use `crypto.randomBytes(8).readBigUInt64BE()` (already imported in poker service) or a DB-side `nextval('seq')` per concurrent insert.

### BE-017 — Migrations have duplicate numeric prefixes — **Medium / S**

Four migration numbers used twice: `010` (`chat_messages.sql` + `self_exclusion.sql`), `033` (`buyin_registration_and_forfeit.sql` + `memes_approval_status.sql`), `073` (`blackjack_multi_tables.sql` + `cosmetic_supply_20_10_5_1.sql`), `105` (`poker_lobby_view_prize_token.sql` + `poker_table_logo_token.sql`). `run-migration.js` runs the file you pass, so this only matters for ordering — but a future "replay migrations in order" script will pick one of each pair non-deterministically.

Fix: rename one file in each pair to the next free number, or move to a timestamped scheme.

### BE-018 — Test coverage is poker-only — **Medium / L**

19 `.test.ts` files under `server/src/__tests__/`. 17 are poker. The remaining two cover `tournament-creator-fee.test.ts` and `safe-bigint.unit.test.ts`. Zero tests for:
- `blackjack-game.service.ts` (1584 lines)
- `blackjack-multi-game.service.ts` (1589 lines)
- `money.service.ts` (603 lines, the entire withdrawal flow)
- `merkle-drops.service.ts` / `merkle-lp-drops.service.ts` (~2500 lines combined)
- `tournament.service.ts` (3218 lines, the cancel/reclaim/refund logic from BE-003)
- `websocket.service.impl.js` (3569 lines)
- Any route file

Money path regressions today are caught only by integration testing on Railway.

Fix: add a smoke test for `MoneyService.enqueueWithdrawal` + worker round-trip (mock the wallet client), and a balance-determinism test for `BlackjackGameService.createGame`/`handlePlayerAction`.

### BE-019 — `merkleDropsService.startCron` only gated by env flag — **Medium / S**

`server.ts:359`:
```ts
if (process.env.MERKLE_DROP_CRON_ENABLED === 'true') merkleDropsService.startCron();
```

Same pattern for LP drops. In multi-instance deployments, *all* instances with the flag on will run the cron — and the cron writes (snapshot, calculate, generate, publish) directly to `merkle_epochs` / `merkle_snapshots`. Conflicts can produce duplicate snapshots or partially-completed trees.

Fix: take a `pg_try_advisory_lock` on a well-known key at cron start; release on stop.

### BE-020 — `POST /api/reports` accepts unbounded `recentErrors[]` — **Medium / S**

`reports.routes.ts:57`:
```ts
recentErrors: Array.isArray(recentErrors) ? recentErrors.slice(0, 20) : undefined,
```

Each entry is inserted into JSONB without further validation. Without per-item length capping, a single 4MB report (just under the default body limit) can store a 4MB JSONB row per allowed report (5/hour/wallet, 3/hour/IP). Combine with BE-012 (no body limit).

Fix: cap each `recentErrors` entry to ~2KB; also `JSON.stringify(...)` length-check the whole array.

### BE-021 — `instantLotteryService` waits for receipt inside the request — **Medium / M**

`instant-lottery.service.ts:200-217`:

```ts
const hash = await wallet.writeContract({...});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') throw new Error('Transaction failed');
```

PulseChain block time is ~10s, so a single play request can take 10–30s. With 30 plays/min rate limit per IP, a single IP can hold up to ~30 concurrent in-flight requests against the operator wallet's nonce, all serializing in viem's internal nonce manager. A coordinated batch will quickly DoS the lottery endpoint and starve the Node event loop of HTTP handler slots.

Fix: enqueue the on-chain call to a separate worker (like hot withdrawals), return `{ pending: true, jobId }`, and let the client poll.

### BE-022 — `pending_withdrawals.nonce` synthetic-negative scheme is fragile — **Medium / S**

`database.service.ts:571-578` inserts a row with a negative `Math.random()`-derived nonce to record completed hot-wallet withdrawals in the same table as signature-based pending withdrawals. This works only because nothing else uses negative nonces. Any future migration that adds `CHECK (nonce >= 0)` will break this silently. Per BE-016, `Math.random()` collision risk applies.

Fix: separate table `hot_wallet_withdrawal_history` keyed by `(wallet_address, tx_hash)`; or use a `BIGSERIAL` synthetic id.

### BE-023 — `Pool` is created without explicit `max` / `idleTimeoutMillis` — **Medium / S**

Find `new Pool(...)` in `database.service.ts` — the defaults (`max: 10`, `idleTimeoutMillis: 10000`) apply. Under burst load on a multi-game backend (poker hands, BJ multi rounds, freeroll start) 10 connections fill instantly and other requests queue. Express timeouts can fire and you get cascading `Release called on client which has already been released to the pool` (the very error BE-010 swallows).

Fix: pin `max` based on Railway plan; instrument `pool.totalCount / pool.idleCount` to Prometheus or logs.

### BE-024 — Admin secret comparison is non-constant-time — **Low / S**

`server.ts:193`:
```ts
if (!secret || secret !== ADMIN_SECRET) { ... }
```

A `crypto.timingSafeEqual` comparison would be the textbook fix. In practice not exploitable over the public internet at network speed, but trivial to harden.

### BE-025 — `parseInt` without radix in many places — **Low / S**

Multiple route handlers call `parseInt(String(req.query.limit))` — radix-less. ES5+ defaults to 10 unless the string starts with `0x` (then 16), so a query like `?limit=0xff` returns 255. Cosmetic but a tested-pattern smell — `parseInt(s, 10)` is the convention.

### BE-026 — `validateNumbers` in instant-lottery silently coerces strings — **Low / S**

`instant-lottery.service.ts:53-61`:
```ts
const v = Number(n);
if (!Number.isInteger(v) || v < MIN_NUMBER || v > MAX_NUMBER || set.has(v)) return false;
```

A client sending `["1", "2", "3", "4", "5", "6"]` (numbers as strings) will pass. The contract takes uint8s, so this works downstream — but combined with no schema validation, similar coercion bugs are easy to introduce.

### BE-027 — Multer disk uploads land in `uploads/` with no antivirus / mimetype-reverification — **Low / M**

The fileFilter checks `file.mimetype`, which is client-supplied. An attacker can upload a `.svg` with embedded scripts pretending to be `image/png` — and the static serve at `/uploads/*` sends them with the original mimetype. Then any user previewing a branded BJ table executes that SVG.

Fix: re-derive mimetype from magic bytes (`file-type` package), reject SVG entirely, or set `Content-Disposition: attachment` for all `/uploads/*`.

### BE-028 — `/uploads` serves with `Access-Control-Allow-Origin: *` — **Low / S**

`bootstrap/app-setup.ts:71`:
```ts
res.setHeader('Access-Control-Allow-Origin', '*');
```

If you ever want to gate access to a paid-content asset, this is the wrong default. Today everything in `/uploads` is public branded table imagery so this is fine.

### BE-029 — `verify.routes.ts` returns 404 message "Game not found" reveals only completed games — **Low / S**

The error message is fine, but `dbService.getGameHands(gameId)` returns hand data for any gameId regardless of game status. The route doesn't gate "completed" anywhere, only "exists." Not a security issue in itself; users can inspect in-progress games for any gameId.

Fix: align `getGameHands` with `verifyGame` so only completed-game data is exposed.

### BE-030 — `error: String(error)` leaks internal stack snippets to clients — **Low / S**

`merkle-admin-mutation.routes.ts:31`:
```ts
res.status(500).json({ error: String(error) });
```

Same pattern in `tournament.routes.ts:107`, several admin routes. `String(error)` of a pg error includes constraint names and column names. Useful for debugging, but should be `'Internal server error'` in prod with a `requestId` to look up in logs.

---

## Cross-cutting observations

- **Authority concentration**: Money/balance writes are now centralized in `MoneyService` + `database.service`'s atomic queries. This is good. The remaining sprawl is around *authentication*: there's no central "verify caller is X" helper. Every route reinvents the check, and most don't bother. Building one signed-message middleware (`requireSignedBy('address')`) and applying it at the route layer would fix BE-001, BE-003, BE-004, BE-005 in one stroke.
- **No central schema layer**: zod is unused. Most routes do ad-hoc `typeof === 'string'` checks. A `routes/_schemas.ts` with one schema per route and a tiny middleware would catch a class of bugs.
- **No CI test gate visible**: 19 tests for poker, 0 for the rest of the surface. Build doesn't fail on TS errors (`TSC_COMPILE_ON_ERROR=true` per `CLAUDE.md`).
- **Background job framework absent**: every periodic task is `setInterval(...)` in the main process. Hot withdrawals, deposit confirmations, freeroll scheduling, merkle drops — all in one node. Three of these have leader-election concerns (BE-006, BE-019). A small advisory-lock pattern would fix that without introducing a new dep.
- **Production safety env-flag sprawl**: `REQUIRE_WS_AUTH`, `DISABLE_WS_AUTH`, `MERKLE_DROP_CRON_ENABLED`, `MERKLE_LP_DROP_CRON_ENABLED`, `TRUST_PROXY`, `HOT_WALLET_LOW_BALANCE_WEI`, `HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS`, `HOT_WITHDRAW_QUEUE_INTERVAL_MS`, `ANALYTICS_CACHE_TTL_MS`, `DEPOSIT_CONFIRMATIONS_REQUIRED`. The defaults trend toward "permissive in production." Codify the production-safe defaults in code, not env.

## Things that look fine

- **Atomic balance ops**. `deductPlayerBalance` uses `UPDATE … WHERE balance >= $2::NUMERIC RETURNING balance`. `enqueueHotWithdrawal` and `deductAndCreatePendingWithdrawal` are wrapped in `withTransaction`. Race-condition risk on the player balance itself is low.
- **Hot withdrawal queue**. `claimNextHotWithdrawalJob` correctly uses `FOR UPDATE SKIP LOCKED`. Workers won't double-broadcast.
- **Poker chip ledger** (`poker-chip-wallet.ts`). Inside a transaction with `SELECT … FOR UPDATE` on the row, append-only ledger entry on every delta. Reason codes are typed.
- **Provably-fair**. The override of `table.newDeck` in `PokerGameService` and the per-hand seed commit/reveal flow match the CLAUDE.md contract. `pfService.fisherYatesShuffle` is the only place hand decks are generated.
- **Fee math**. Withdrawal fee split implements `125/50/175/150 of 500 bps` = 5% total, matches CLAUDE.md spec. Money math is BigInt throughout — no floats observed.
- **Game ownership**. WS `handlePlayerAction` looks up `gameOwner` via `getPlayerAddressFromSession` and compares vs `ws.playerAddress` before mutating game state. (Caveat: still relies on BE-002.)
- **SQL safety**. No string-concat queries on user input. The four dynamic-SQL `UPDATE` builders (`updateHotWithdrawalJob`, `updateBlackjackTable`, `updateBlackjackSpWagerTier`) build column lists from a fixed allow-list, not from user keys.
- **TypeScript strictness**. `tsconfig.json` has `"strict": true` (server, unlike the frontend).
- **Migrations volume**. 126 migrations is a lot but each is incremental and reads cleanly.
- **Graceful shutdown**. SIGTERM/SIGINT stop schedulers and close the HTTP server. Could also drain WS clients (impl.js:3096 has a `shutdown()` method, just isn't wired to the SIGTERM handler).
