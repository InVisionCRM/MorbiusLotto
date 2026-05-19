# RNG V6 — Implementation Plan

**Goal:** kill predictable on-chain RNG ([SC-001](smart-contracts.md), [SEC-002](security.md)) by moving every casino game to the same server-resolved + provably-fair pattern that `InstantLottery6of55.resolvePlay` already uses.

**Constraints (user-stated):** no oracles on PulseChain, no slow games.

**Decision:** server-resolved + provably-fair commit-reveal. See [IMPLEMENTATION.md](IMPLEMENTATION.md) decisions log.

**Affected contracts:** `Plinko`, `Roulette`, `BigWheel`, `CryptoKeno`. (`InstantLottery6of55` already has the pattern — only its PLS-path needs to be deprecated.)

**Status legend:** `todo` · `in progress` · `blocked` · `in review` · `done`

---

## Pattern recap (one user tx, ~10s settle)

```
1. SERVER (boot, daily rotate):
   serverSeed = randomBytes(32)
   serverSeedCommitment = sha256(serverSeed)
   publish commitment (public endpoint: GET /api/pf/commitment)

2. CLIENT (bet):
   POST /api/<game>/bet { wager, clientSeed }
   → backend reserves playId, snapshots current commitment
   → user signs on-chain playGame(playId, wager, clientSeed, ...)

3. CHAIN (bet tx):
   pull wager, record (playId, player, clientSeed, wager, commitment)
   emit PlayCreated(playId)

4. SERVER (settle):
   listen for PlayCreated
   outcome = decodeForGame(HMAC_SHA256(serverSeed, playId:clientSeed:nonce))
   sig = operatorKey.signTypedData({playId, outcome, payout})
   call resolvePlay(playId, outcome, payout, sig) from operator wallet
   on-chain: verify sig, verify usedPlayId[playId] == false, mark used, pay out
```

Verify endpoint at `/api/pf/verify/<game>/:playId` returns commitment, revealed seed (on rotation), and the decode recipe — anyone can recompute outcome.

---

## Task breakdown

### Stage 1 — Server-side foundation (low risk, reversible, fully testable in isolation)

| # | Task | Files | Status | Notes |
|---|---|---|---|---|
| S1-1 | Extend `provably-fair.service.ts` with `seedCommitment()`, `rotateServerSeed()`, in-memory current/previous seed state | `server/src/services/provably-fair.service.ts` | todo | Pattern: keep `current` and `previous`; rotate at midnight UTC + on demand |
| S1-2 | Add `pf_seeds` table: `(id, commitment, plaintext_seed nullable, rotated_at, active boolean)` | `server/migrations/<NNN>_pf_seeds.sql` | todo | Plaintext NULL until rotation; commitment forever |
| S1-3 | Per-game decoder module: pure functions, fully unit-tested | `server/src/services/game-rng/` | todo | One file per game (plinko.ts, roulette.ts, bigwheel.ts, keno.ts), one shared `hmac-stream.ts` |
| S1-4 | `pending_plays_<game>` migrations per game: `(play_id PK, player, client_seed, wager, commitment_id, created_at, resolved_at, outcome, payout, tx_hash)` | `server/migrations/` | todo | One table per game (simpler than polymorphic) |
| S1-5 | Public `GET /api/pf/commitment` returning current commitment | `server/src/routes/verify.routes.ts` | todo | Cached 60s; read from DB |
| S1-6 | Public `GET /api/pf/verify/:game/:playId` returning commitment + (post-rotation) seed + decode recipe | `server/src/routes/verify.routes.ts` | todo | Mirrors existing `/api/poker/verify/:handId` |
| S1-7 | Unit tests: 1000+ play simulation per game, distribution check vs theoretical edge | `server/__tests__/game-rng/` | todo | Locks in math correctness before any contract change |

**Gate before Stage 2:** Stage 1 entirely server-side. Doesn't touch contracts, doesn't touch the live game flow. If we abandon V6 design later, this is throwaway code, not breaking change.

### Stage 2 — Contract changes (V6 contracts)

| # | Task | Files | Status | Notes |
|---|---|---|---|---|
| S2-1 | `PlinkoV6.sol` — strip `_getRandomBucket`, add `playGame(playId, ...)` event-only + `resolvePlay(playId, buckets[], totalPayout, sig)` with `usedPlayId` mapping | `contracts/contracts/PlinkoV6.sol` | todo | Copy pattern from `InstantLottery6of55.resolvePlay` |
| S2-2 | `RouletteV6.sol` — same pattern, outcome is single number 0-36 + bet payouts array signed | `contracts/contracts/RouletteV6.sol` | todo | |
| S2-3 | `BigWheelV6.sol` — same pattern, ALSO restore reserve check and remove the double `_processMorbiusPayment` call ([SC-002](smart-contracts.md), [SC-014](smart-contracts.md)) | `contracts/contracts/BigWheelV6.sol` | todo | Combined fix for SC-001 + SC-002 + SC-014 |
| S2-4 | `CryptoKenoV6.sol` — same pattern, outcome is 20-of-80 picks | `contracts/contracts/CryptoKenoV6.sol` | todo | |
| S2-5 | Operator signer: KMS-backed, separate signer service or in backend with `kms.sign` calls (NOT raw env var) | `server/src/services/operator-signer.ts` | todo | See [IMPLEMENTATION.md](IMPLEMENTATION.md) decisions log |
| S2-6 | Add `maxPayoutPerSettlement` and `dailyPayoutCap` to each V6 contract; `pause()` callable by a separate multisig (not operator key) | each V6 contract | todo | Blast-radius limit if operator key leaks |
| S2-7 | Per-game adversarial Hardhat tests: signature replay, used-playId reuse, signature from non-operator, payout > cap, paused state | `contracts/test/<game>-v6.test.ts` | todo | Prerequisite for deploy per Phase 2 #9 ([P2-9](IMPLEMENTATION.md)) |

**Gate before Stage 3:** all Hardhat tests green + a dry-run deploy to PulseChain testnet (or a fork). The user separately initiates the mainnet deploy after review.

### Stage 3 — Backend integration

| # | Task | Files | Status | Notes |
|---|---|---|---|---|
| S3-1 | `plinko-game.service.ts` — bet handler + chain listener + resolve caller | `server/src/services/plinko-game.service.ts` (new) | todo | Mirror pattern from `instant-lottery.service.ts` |
| S3-2 | `roulette-game.service.ts` | `server/src/services/roulette-game.service.ts` (new) | todo | |
| S3-3 | `bigwheel-game.service.ts` | `server/src/services/bigwheel-game.service.ts` (new) | todo | |
| S3-4 | `keno-game.service.ts` | `server/src/services/keno-game.service.ts` (new) | todo | |
| S3-5 | New API routes per game: `POST /api/<game>/bet` returning `playId` + signing payload | `server/src/routes/` | todo | All zod-validated |
| S3-6 | Idempotency on listener: skip already-resolved `playId`, retry-safe | each game service | todo | Listener may double-fire on restart |
| S3-7 | Stale-play sweeper: cron job that resolves any `PlayCreated > 60s ago` to keep stuck plays from blocking users | `server/src/workers/stuck-play-sweeper.ts` (new) | todo | |
| S3-8 | Per-address rate limit on bet endpoint (relates to [P1-3](IMPLEMENTATION.md)) | route middleware | todo | |

### Stage 4 — Frontend integration

| # | Task | Files | Status | Notes |
|---|---|---|---|---|
| S4-1 | Plinko bet flow: POST bet → receive playId/commitment → `writeContractAsync` to V6 → listen for resolve event → render outcome | `app/PLINKO/*`, `hooks/use-plinko-*.ts` | todo | The "watching the spinner" UX bridges the ~10s server settle |
| S4-2 | Roulette bet flow | `app/roulette/*`, `hooks/use-roulette-*.ts` | todo | |
| S4-3 | BigWheel bet flow | `app/...`, `hooks/...` | todo | Check if there's a live BigWheel UI; if not, this is a future task |
| S4-4 | CryptoKeno bet flow | `app/keno/*`, `hooks/use-keno-*.ts` | todo | |
| S4-5 | Verify page UI: shows current commitment + history with revealed seeds + recompute button | `app/verify/page.tsx` (new) | todo | One page, all games |
| S4-6 | Update contract addresses in `lib/contracts.ts` after V6 deploy | `lib/contracts.ts` | todo | |

### Stage 5 — Cutover

| # | Task | Status | Notes |
|---|---|---|---|
| S5-1 | Pause V5 game contracts on-chain (this should already be done in [P0-3](IMPLEMENTATION.md)) | todo | If not done at P0-3, must happen here |
| S5-2 | Drain V5 contract reserves to multisig | todo | After all in-flight plays settle |
| S5-3 | Deploy V6 contracts to PulseChain mainnet | todo | Record tx hashes in [IMPLEMENTATION.md](IMPLEMENTATION.md) Notes |
| S5-4 | Fund V6 reserves from multisig | todo | |
| S5-5 | Flip frontend to V6 contract addresses | todo | |
| S5-6 | Un-pause V6 (open the casino again) | todo | |
| S5-7 | Verify the first 100 plays externally with `/api/pf/verify/...` | todo | Smoke test |
| S5-8 | Post-mortem doc: time to ship, what we'd do differently, sign-off from a third-party auditor if engaged | todo | |

---

## Open questions

These need a user call before the stage they belong to can proceed:

1. **KMS choice** — AWS KMS, GCP KMS, or a dedicated signer service? (S2-5)
2. **Multisig setup** — does the platform multisig already exist on PulseChain? If yes, address? If no, deploy Gnosis Safe equivalent first. (S2-6)
3. **State migration** — V5 contracts hold reserves and in-flight tournaments. Are users notified before pause, or just at cutover? (S5-1, S5-2)
4. **Third-party audit** — given funds-at-risk severity, recommend a paid audit (Trail of Bits, OpenZeppelin, Spearbit) of the V6 contracts before deploy. Budget/timeline? (between S2-7 and S5-3)
5. **Backwards compatibility** — V5 plays in flight at cutover: refund or honor? Refund is simpler. (S5-1)

---

## Estimated effort (calendar time)

Rough ballparks assuming one focused engineer + reviewer:

| Stage | Calendar time | Confidence |
|---|---|---|
| Stage 1 (server foundation) | 3–5 days | High |
| Stage 2 (contracts + tests) | 1–2 weeks | Medium (depends on adversarial test coverage) |
| Stage 3 (backend integration) | 1 week | High |
| Stage 4 (frontend integration) | 1 week | Medium (depends on UI polish bar) |
| Stage 5 (cutover) | 1 day operationally + 2–3 days monitoring | High |
| **Total** | **4–6 weeks** + external audit if engaged | |

If a third-party audit is added between Stage 2 and Stage 5, add 2–4 weeks of wall-clock time (their queue, then their report turn).
