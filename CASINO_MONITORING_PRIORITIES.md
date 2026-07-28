<!-- Generated from a research pass across operator BI, fraud/risk, AML/RG,
     crypto-casino practice and RNG integrity, cross-referenced against this
     repo's actual schema. Ranked by operator value, not by industry convention. -->

# MORBlotto Casino-Wide Monitoring Dashboard — Ranked Priority List

Ranked by what actually protects this business: **not being drained (by an exploit, a bug, an insider, or a key compromise) > not going insolvent > not paying out margin you didn't intend > growth analytics.** Regulatory-shaped metrics are ranked on their real value here (unlicensed, no-KYC, crypto-native), not on their importance to a UKGC licensee.

Legend: **Exists** = present on `/activity` today · **Build** = BUILDABLE NOW (data is already in the DB / on-chain) vs NEEDS NEW DATA.

---

## Tier 1 — Solvency and theft (build these first)

### 1. Bankroll solvency coverage ratio
**Shows:** (hot wallet MORBIUS + vault MORBIUS + any treasury) ÷ (total player liability + queued/broadcasting withdrawals + open poker stacks + unsettled in-flight rounds), as a ratio and as days-of-runway at the trailing 7d net outflow rate.
**Catches:** the only failure that ends the business overnight — you cannot pay people. Today the dashboard shows player liability and vault balance as two unrelated tiles and *never shows the hot wallet at all*, even though `money.service.ts:404-412` already refuses withdrawals when the hot wallet runs dry — that failure surfaces only to the player as "temporarily limited". You find out from Telegram, not from your dashboard.
**Two corrections needed while building it:** `SELECT SUM(balance) FROM player_poker_chips` (admin-dashboard.service.ts liabilityQ) includes the two seeded **house wallets** (rake `0x2d6f6a61…36bb`, platform fee `0x41682815…309d`) — your player liability is currently overstated by the house's own float. And it excludes open poker stacks in `poker_seats.stack` and unsettled rounds.
**Tier:** Critical · **Real-time alert:** Yes (coverage < 1.5x warn, < 1.1x page) · **Exists:** No · **Build:** BUILDABLE NOW — on-chain `balanceOf` for the hot wallet (address derivable from `HOT_WALLET_PRIVATE_KEY`, `getHotWalletClient()`) + `MORBIUS_VAULT_ADDRESS`, minus liability query with house wallets excluded.

### 2. Hot-wallet outflow reconciliation (key-compromise tripwire)
**Shows:** every MORBIUS/PLS transfer out of the hot wallet and vault, matched against a `hot_withdrawal_jobs` row. Unmatched outflow, outflow to a destination not equal to the job's `wallet_address`, rolling-window outflow above baseline, and native-PLS gas balance for the payout signer.
**Catches:** the single largest realised loss mode in this sector — Stake.com lost $41.3M from hot wallets to a stolen key. Also catches a compromised server signing payouts to itself. Detection latency is the only variable you control; right now an attacker draining the hot wallet produces **zero** dashboard signal, and gas exhaustion silently freezes the entire payout queue with no indicator.
**Tier:** Critical · **Real-time alert:** Yes (P0 page on any unmatched outflow) · **Exists:** No · **Build:** BUILDABLE NOW — needs a small indexer job polling hot-wallet/vault transfers (PulseChain scan API or viem `getLogs`) into a table and diffing against `hot_withdrawal_jobs.tx_hash`.

### 3. Three-way ledger reconciliation drift
**Shows:** continuous tie-out of (a) `SUM(poker_chip_ledger.delta)` per wallet vs `player_poker_chips.balance`; (b) `SUM(player_deposits.amount)` vs actual on-chain transfers into the vault; (c) completed `hot_withdrawal_jobs` vs the `withdrawal` ledger debits. Plus hard alarms on: any `ref_id` with two payout rows (double credit), any ledger row where `balance_after` ≠ previous `balance_after` + `delta`, and any bet row with a NULL `ref_id` (`applyPokerChipDelta` silently NULLs any non-UUID ref — those plays become permanently unattributable).
**Catches:** the most common real integrity failure in iGaming is not a bad RNG, it's a settlement bug — a retry that credits twice, a missed indexer event, a rollback that half-applied. Right now nothing on this platform would ever notice. A drift of 0 is also the only thing that lets you trust every other number on this page.
**Tier:** Critical · **Real-time alert:** Yes (any nonzero delta) · **Exists:** No · **Build:** BUILDABLE NOW.

### 4. Complete P&L — your book is currently missing revenue
**Shows:** GGR broken into **house-banked** (arcade/keno/plinko/video poker/blackjack: `%_bet` − `%_payout`), **poker rake** (`reason = 'rake'`), **tournament margin** (`tournament_buyin` − `tournament_prize` − `creator_fee` − guarantee overlay), and **platform/withdrawal fees** (`platform_fee`, `creator_fee`, `hot_withdrawal_jobs.fee_wei`), then the waterfall down to net: − rakeback − referral − Drop prizes − wheel/milestone − holder/LP rewards − admin adjustments.
**Catches:** the headline number being wrong. `getFinancials()` matches only `reason LIKE '%\_bet'` / `'%\_payout'`, so **poker rake contributes nothing to GGR** — a core revenue line is invisible — and so do tournament buy-ins/prizes, `platform_fee`, `creator_fee`, and legacy blackjack/lottery (which settle outside the chip ledger entirely, in `games`/`game_hands` and `instant_lottery_plays`, in wei). Your Hold % is therefore understated and not comparable to anything. Also: `holder_reward`/`lp_holder_reward` are real cost centres excluded from `bonusCostTotal`.
**Tier:** Critical · **Real-time alert:** No · **Exists:** Partial (house-banked only) · **Build:** BUILDABLE NOW — extend the existing `ledgerQ`; `activity-taxonomy.ts` already has the synthetic-reason UNION pattern for the legacy wei tables.

### 5. Per-game actual vs theoretical RTP, with a confidence band
**Shows:** per game and per config version: realised RTP = Σpayout/Σwager against declared theoretical, wrapped in a band of ±z·σ/√n, with `n` and the current band half-width displayed so you know whether the reading means anything yet. Reset the accumulator on any house-edge/paytable change.
**Catches:** the thing that drains a bankroll continuously and silently — a paytable bug, a wrong multiplier, a mis-set `house_edge_bp` after a deploy, or an actively exploited game. The Games tab shows actual hold with **no expected value next to it**, so you literally cannot distinguish an unlucky night from broken math. A raw hold number with no σ/√n context is worse than nothing: it screams on high-variance games (crash, limbo) every day and stays silent on a genuine 1pp error in dice.
**Note on data:** `house_edge_bp` already exists per round on 14 arcade tables (limbo, mines, hilo, dice, crash, towers, chicken, dicex2, dragon_tiger, pachinko, cascade, firewalk, heist, cipher) — theoretical is known there. Keno, plinko, roulette, baccarat, andar bahar, three-card, pai gow, greed dice, video poker and blackjack need a declared theoretical-RTP constant map (one small config file/table).
**Tier:** Critical · **Real-time alert:** No (daily/weekly, but page on a >3σ break at high n) · **Exists:** No (hold % only, no baseline) · **Build:** BUILDABLE NOW + a theoretical-RTP registry.

### 6. Max-win exposure vs bankroll, and cap-breach hard alarm
**Shows:** two things. (a) **Invariant:** any single settled payout above the game's configured max multiplier / max-win cap fires immediately — this is never variance, it's a defect or an exploit. (b) **Exposure:** per game, largest theoretically permitted payout (max multiplier × max accepted bet) as a % of current bankroll, plus current largest open exposures.
**Catches:** the single-event solvency hit. Crash/limbo-style games have unbounded-looking multipliers; if max bet × max multiplier exceeds your bankroll, one round can end you. Today `getBigWins` shows large payouts *after the fact* with a static 100,000-chip threshold and no relationship to what you can afford.
**Tier:** Critical · **Real-time alert:** Yes · **Exists:** Partial (Big wins tab, absolute thresholds only) · **Build:** BUILDABLE NOW.

### 7. Multiplier-hit frequency by player and by game
**Shows:** how often a wallet clears a multiplier threshold (hits, hits/day, max ×, avg ×, games spread) and how much of a game's total payout comes from outlier hits and from how few players.
**Catches:** the exploit, the bot farm, the leaked seed. Frequency beats size — one 1000× is luck, forty of them is a finding.
**Tier:** Critical · **Real-time alert:** Yes (currently none) · **Exists:** **YES** — `getMultiplierFrequency()` byPlayer/byGame. This is the best thing you already have. **What's missing:** it only fires if a human is looking at the tab, and there's no way to mark a row "reviewed".
**Build:** BUILDABLE NOW (add thresholded alerting + the unused `wagered`/`firstAt` fields already returned but not rendered).

### 8. Volume-normalised player win outlier (z-score)
**Shows:** per player per game: z = (actual_net − n·μ) / (σ·√n), where μ = −house_edge. Ranked by z with `n` as a co-filter, not by raw net.
**Catches:** the difference between a lucky whale and someone with an edge. Your Players tab sorts by `won − wagered` descending — that list is dominated by whoever wagered most and got lucky, which is exactly the wrong triage order. A player up 40M chips on 2,000 plays is normal; up 3M chips on 400,000 low-variance dice rolls is impossible, and only the z-score surfaces the second one. Documented industry failure mode: manual advantage-play identification takes months while losses accrue.
**Tier:** Critical · **Real-time alert:** No (daily) · **Exists:** Partial (raw net ranking) · **Build:** BUILDABLE NOW — `house_edge_bp` on the round tables gives μ; σ per game from the paytable or estimated from realised per-round return distribution.

### 9. Alert + case/watchlist layer (the enabler)
**Shows:** thresholded alerts with acknowledged/investigating/cleared state, per-wallet risk tags and free-text notes, and a watchlist. Delivery via the existing `telegram-notifications.service.ts`.
**Catches:** the failure that makes all 27 of these items worthless — nobody is looking at 3am. Everything on `/activity` is recomputed on a 30s poll and thrown away; there is no threshold, no push, no record that you already reviewed that 500× hit, and no way to re-find the wallet you were suspicious about last Tuesday.
**Tier:** Critical · **Real-time alert:** It *is* the alerting · **Exists:** No · **Build:** NEEDS NEW DATA — one `alerts` table (type, subject_wallet/game, severity, payload JSONB, state, acked_by, acked_at) + one `player_flags`/notes table. Small schema, unlocks items 1–8 and 13–20.

### 10. Withdrawal operations queue
**Shows:** oldest queued job age, count by status, failed jobs with `error_message`, stuck-in-`broadcasting` detection, per-player withdrawal velocity, and a manual-hold path for payouts above a bankroll-relative threshold. Plus `withdrawalsNet` — already computed and returned by the API and **never rendered**.
**Catches:** stalled payouts (which read as insolvency on Telegram within minutes), a broadcast loop burning gas, and a single wallet cashing out faster than deposits come in. Today "pending" is a bare count with no age, no failure detail, and no retry/cancel action.
**Tier:** Critical · **Real-time alert:** Yes (oldest-pending > SLA; any failed job) · **Exists:** Partial (status badges, pending count) · **Build:** BUILDABLE NOW for the views; NEEDS NEW DATA for approval workflow (`hot_withdrawal_jobs` has no reviewer, hold, or risk-flag column).

### 11. Admin adjustment audit trail + config change log
**Shows:** every `admin_credit`/`admin_debit` with acting admin, target, signed amount, balance_after, note and time — plus a change log for `vip_tier_config.rakeback_bps`, `referral_config`, drop guarantee, `wheel_spin_rules`, game house-edge config.
**Catches:** insider theft, which is the second-largest realised loss mode after key compromise. `ADMIN_CREDIT_MAX_MORBIUS` defaults to **100,000,000 chips per adjustment**. `admin_credit_log` (migration 175) already records every adjustment with the acting admin — and it has **no read endpoint and no UI**. Only the net aggregate appears, so a +100M credit followed by a −100M debit nets to zero on the dashboard and is invisible. Cheapest high-value item on this entire list: one query + one `dashRoute()`.
**Tier:** Critical · **Real-time alert:** Yes (any adjustment above a small threshold → Telegram) · **Exists:** No UI · **Build:** BUILDABLE NOW for credits/debits; NEEDS NEW DATA for config changes (no admin action log, no config versioning).

---

## Tier 2 — Margin leaks, exploits and abuse

### 12. Leave-one-out RTP / per-game player concentration
**Shows:** per game per window: top-1/top-5 share of turnover and of net payout, and the game's RTP recomputed with the single largest net winner excluded.
**Catches:** the triage step after an RTP break — is the *math* broken or is it *one account*? Game reads 99.5% with everyone, 96.8% without one wallet: investigate the wallet, not the paytable. Without this you burn a week on statistics for what is a single-account problem, or ship a "fix" to a game that was fine.
**Tier:** Critical · **Real-time alert:** No · **Exists:** No · **Build:** BUILDABLE NOW.

### 13. Pass-through ratio (deposit → minimal wager → withdraw)
**Shows:** per wallet per window: wagered ÷ deposited, withdrawn ÷ deposited, and hours from deposit to withdrawal request. Population histogram, not just per-player — you're looking for a second hump.
**Catches:** three things at once. (a) Welcome-bonus/referral cash-out: take the 1,000-chip welcome bonus, wager nothing, withdraw. (b) Laundering pass-through — deposit, token play, withdraw. (c) Pure cost: a wallet that deposits and withdraws without wagering produces zero GGR while consuming gas and hot-wallet float. `MoneyService.enqueueWithdrawal` checks only minimum amount and liquidity — **no play-through check, no daily cap, no per-player limit whatsoever.**
**Tier:** Critical · **Real-time alert:** Yes (at withdrawal enqueue — this is the last point money can still be stopped) · **Exists:** No · **Build:** BUILDABLE NOW — `player_deposits` + ledger `%_bet` + `hot_withdrawal_jobs`.

### 14. Provably-fair integrity invariants (seed / nonce / commitment)
**Shows:** hard invariants, each alerting on a single occurrence — duplicate `(seed_pair_id, nonce)`; the same `server_seed` across two pairs or two wallets; nonce gaps or rewinds within a pair; `SHA256(revealed_seed) ≠ server_seed_hash` at reveal; a plaintext seed present while rounds on that pair are still unsettled; more than one `active` pair per wallet; and stale pairs (nonce depth / age past policy).
**Catches:** the failure modes that turn a provably-fair game into a *predictable* one — and none of them produce a statistical signature until after the money is gone. A duplicated triple means a player can replay a known outcome at will. This is also reputationally terminal in a way an RTP bug isn't: on a PF platform your players are your most thorough auditors, and they publish.
**Caveat to surface honestly:** legacy arcade rows still carry the plaintext `server_seed` inline on the round row (173/174 only dropped NOT NULL going forward), so "was the seed exposed before settlement" is unanswerable for historical rows.
**Tier:** Critical · **Real-time alert:** Yes · **Exists:** No · **Build:** BUILDABLE NOW — `arcade_seed_pairs`, `arcade_seed_pair_pending`, `poker_hands` + `poker_hand_pending_seeds`, `wheel_spins`, per-game round tables. Add a DB unique constraint on `(seed_pair_id, nonce)` and alert on violation.

### 15. Unsettled / stuck rounds and duplicate settlement
**Shows:** count and age of `ref_id`s with a bet row but no payout/refund past SLA, per game; rounds settled twice; refund rate per game per day; `pending_deposits` stuck in `pending_confirmation`.
**Catches:** a game that has silently stopped settling (players' money held, they scream in chat before you know), and idempotency breaches that credit twice. A rising void/abandon rate on one game is also a strong tell that a client-side exploit is being probed — the attacker abandons rounds whose outcome they can already see.
**Tier:** Critical · **Real-time alert:** Yes · **Exists:** No · **Build:** BUILDABLE NOW.

### 16. Bet-timing bot signature
**Shows:** per wallet per game: median inter-bet interval and, critically, the **variance/entropy** of that interval; bets-per-minute; share of bets at identical stake; runs of perfectly-spaced bets.
**Catches:** scripted play, which is what turns a small edge into a real loss. Humans are noisy; scripts are not — the tell is not speed, it's a latency histogram that's a spike where a human's is fat and right-skewed. Reported industry trigger: intervals under ~150ms with ~90% uniformity. This catches automation *before* it accumulates enough volume to move any statistical panel.
**Tier:** High · **Real-time alert:** Yes · **Exists:** No · **Build:** BUILDABLE NOW — `poker_chip_ledger.created_at` per wallet is all you need. No new capture required.

### 17. Bonus/rakeback cost per player vs their actual net-loss contribution
**Shows:** per wallet and per VIP tier: rakeback + referral + Drop + wheel + holder rewards received, against that wallet's genuine net loss and turnover; bonus cost as % of GGR overall and per tier; claim cadence (`player_vip_state.last_rakeback_claim_at`) and claim-within-minutes-of-eligibility patterns.
**Catches:** rakeback farming. Rakeback accrues at up to **25% (Obsidian) on net loss** — a wallet churning high volume on your lowest-edge games converts a ~1% house edge into a much thinner one, and at the top tier can approach or cross break-even. Today rakeback is a single total with no per-player, per-tier or per-game view, so a farming cluster is a flat line. Also catches uniform redemption rates across tiers (the cheapest tell there is — it needs no identity data at all).
**Tier:** Critical · **Real-time alert:** No · **Exists:** Partial (one total) · **Build:** BUILDABLE NOW.

### 18. Whale concentration and net position
**Shows:** top-1% / top-10 share of turnover and of GGR, trended; per-player lifetime net position (deposits − withdrawals, and wagered − won); largest current balances as % of bankroll.
**Catches:** two things. Concentration risk — if 40% of GGR comes from 1% of players, one churn event wipes your forecast, and it stays invisible until you plot it against active players. And solvency — a single balance that is a material fraction of your hot wallet is a payout event you need to see coming, not discover at enqueue time.
**Tier:** High · **Real-time alert:** No · **Exists:** Partial (Players tab is windowed, per-window, not lifetime) · **Build:** BUILDABLE NOW.

### 19. Net cash flow (In−Out) with period-over-period deltas
**Shows:** deposits vs withdrawals per window with a trend line, wagered-to-deposits ratio, net-revenue-to-deposits, and **every KPI shown against the previous equivalent period** with a delta and directional colour.
**Catches:** GGR is an accrual concept; In−Out is actual cash, and a falling deposits:withdrawals ratio flags liquidity pressure while GGR still looks healthy. The period-comparison half is separately valuable and nearly free: every figure on `/activity` today is a single-window absolute with no baseline, which means a 40% drop in a game's hold looks identical to a normal Tuesday.
**Tier:** High · **Real-time alert:** No · **Exists:** Partial (window totals, no comparison) · **Build:** BUILDABLE NOW — `getDailyHistory(30)` already returns per-day plays and players that the UI fetches every 30s and throws away.

### 20. Poker chip-dumping and seat co-occurrence
**Shows:** pairwise net transfer between accounts across hands (`poker_hand_players.contributed` vs `won_amount`), number of hands seated together vs what random seating predicts, repeated large all-ins between the same pair, and loss concentration (one account losing most hands to one opponent). Extend to soft-play: a player's VPIP/PFR/3-bet/fold-to-bet *conditioned on facing a specific opponent* vs the general population.
**Catches:** the primary PvP fraud vector — invisible at the individual-player level, both accounts look ordinary, it only exists as a directed edge between two accounts. Also the laundering rail (chip dumping functions like a bank drop). You have the richest dataset on the platform for this (`poker_hand_players`, `poker_hand_actions`, `poker_hand_hole_cards`, `poker_seats`) and **nothing computes any of it**.
**Tier:** High · **Real-time alert:** No (needs a few hundred hands per pair) · **Exists:** No · **Build:** BUILDABLE NOW.

### 21. Referral ring / self-referral detection
**Shows:** per referrer: referee count, referee cohort quality (what % ever wagered beyond `max_bind_wager_chips`, what % still active at D7), welcome-bonus cost vs GGR generated by that downline, referee registration burst timing, and referrer↔referee wallets sharing a deposit funding source.
**Catches:** one person farming 1,000-chip welcome bonuses across fresh wallets. The only guards today are the `referrals_no_self` CHECK and a lifetime-wager bind gate — neither stops A→B→C→A rings or a single operator with 50 wallets. The Referrals tab shows earnings only and **ignores the window selector entirely**.
**Tier:** High · **Real-time alert:** No · **Exists:** Partial (earnings leaderboard) · **Build:** BUILDABLE NOW for cohort-quality and burst signals. The strongest signal (shared on-chain funding source) is NEEDS NEW DATA — see final section.

---

## Tier 3 — Player health, growth, and hygiene

### 22. Reconstructed play sessions (length, escalation, chasing)
**Shows:** sessionise `poker_chip_ledger` by wallet with a 30-minute inactivity gap → session length, bets per session, stake escalation within a session, deposits made within minutes of balance hitting near-zero, and overnight (02:00–06:00) play share.
**Catches:** loss-chasing and tilt, which is simultaneously your biggest single-session payout risk in reverse (a player who deposits five times in an hour after losses is the one who charges back socially, rage-quits publicly, or turns out to be spending money they don't have). You have no session table at all, but you don't need one — the ledger timestamps make this fully derivable today, which is worth pointing out because "we can't do RG without new data capture" is only half true.
**Tier:** High · **Real-time alert:** Optional (rapid re-deposit after zero balance) · **Exists:** No · **Build:** BUILDABLE NOW.

### 23. Self-exclusion breach detection
**Shows:** any bet, deposit or withdrawal by a wallet with an active row in `player_exclusions`; count of active exclusions; timeout expiry queue.
**Catches:** the worst-headline failure available to you — a person who excluded themselves and is still playing. `player_exclusions` is the only responsible-gaming table on the platform and nothing verifies enforcement against it. Low volume, near-zero build cost, disproportionate reputational downside if it ever fails silently.
**Tier:** High · **Real-time alert:** Yes · **Exists:** No · **Build:** BUILDABLE NOW (`is_player_excluded()` already exists as a SQL function).

### 24. Hit frequency and payout-shape distribution per game
**Shows:** per game, the proportion of rounds returning any win, and a bucketed multiplier histogram (0×, 0–1×, 1–2×, 2–10×, 10–100×, 100–1000×, 1000×+) with observed vs expected counts and a per-bucket z.
**Catches:** breakage far faster than RTP does, because a *proportion* converges orders of magnitude quicker than a payout mean — at p=0.30 and n=10,000 a 1.5pp shift is already ~3σ, where RTP would need 10⁵–10⁶ rounds. Shape also catches the case where aggregate RTP is dead-on because the game over-pays one bucket and under-pays another. This is the early-warning canary that sits in front of item 5.
**Tier:** High · **Real-time alert:** Yes (control chart with a change marker) · **Exists:** No · **Build:** BUILDABLE NOW — round tables carry `multiplier_x100`/`payout` per round.

### 25. Per-bet-size / per-config RTP segmentation
**Shows:** actual vs theoretical RTP broken out by every wagering configuration a game exposes — stake tier, risk level (`plinko_rounds.risk`, `keno_rounds.risk`), target (`arcade_dice_rounds.target_x100`), auto-cashout (`arcade_crash_rounds.auto_cashout_x100`) — each with its own n.
**Catches:** the exploit class an aggregate RTP panel is structurally blind to. NetEnt's Jack Hammer paid >100% at exactly €25 and €250 stakes while every other stake behaved normally; it ran for ~two months and players extracted ~€100k before anyone noticed, and aggregate RTP showed almost nothing. If any of your games has a rounding bug at a specific stake or risk level, this is the only panel that will ever show it.
**Tier:** High · **Real-time alert:** No · **Exists:** No · **Build:** BUILDABLE NOW.

### 26. MORBIUS/USD price snapshot + value-denominated thresholds
**Shows:** a persisted daily/hourly MORBIUS-USD snapshot, and USD-denominated versions of GGR, liability, bankroll coverage and your "big win" thresholds.
**Catches:** thresholds silently decaying. Your big-win floor is a hardcoded 100,000 chips; if MORBIUS 5×'s, that's a routine hit and your alert fires constantly, and if it drops 80% you stop seeing real outliers. Also: your player liability is denominated in a token whose price you don't record, so you cannot answer "what do we actually owe" historically. Price is fetched client-side from DexScreener and thrown away.
**Tier:** Medium · **Real-time alert:** No · **Exists:** No · **Build:** NEEDS NEW DATA — trivial: one `price_snapshots` table + a cron writing the existing DexScreener read server-side.

### 27. Cohort retention / first-seen / LTV
**Shows:** first-seen per wallet as `MIN(created_at)` over `poker_chip_ledger`, D1/D7/D30 retention by signup cohort, deposit conversion, churn, and net revenue per player by cohort.
**Catches:** growth decisions, not theft. Ranked last of the build-now items honestly — this changes how you spend on promotion, it does not stop you being robbed. Worth building mainly because the current "New signups" number is **wrong**: it counts `SELECT COUNT(*) FROM players`, and `players` rows are created only by blackjack and by wei→chip deposit sweeps, so any player funded by admin credit or a referral bonus who only plays arcade games has no signup record at all. You are undercounting new players by an unknown amount and don't know it.
**Tier:** Medium · **Real-time alert:** No · **Exists:** Partial (a wrong signup count) · **Build:** BUILDABLE NOW (reconstruct from the ledger; do not trust `players`).

---

## Deliberately NOT on this list (sounds impressive, changes no decision here)

- **NGR waterfall with supplier fees, PSP costs and gaming tax.** You have no game providers, no payment processors and no tax withholding. GGR − bonus cost *is* your NGR, and it's already computed. Importing the full operator cost stack would add five rows that are permanently zero.
- **Deposit approval rate, PSP success rate by method/region, chargeback rate.** Chain-settled deposits either confirm or don't; there is no acquirer to lose 20% approval overnight and chargebacks are structurally impossible. Not applicable.
- **CPA / CPFTD / LTV:CAC / acquisition-channel ROAS.** No paid acquisition attribution exists anywhere in the schema and no ad spend flows through the platform. These would be fabricated numbers.
- **Chi-square goodness-of-fit / KS batteries on outcome distributions.** Real for a lab certifying an RNG. For you, outcomes are deterministically derived from HMAC/SHA of committed seeds — the shuffle isn't going to drift. What *can* break is the **mapping** from RNG output to symbol and the **paytable**, and items 5, 24 and 25 catch both far more cheaply. Build the chi-square battery only if you're pursuing certification.
- **Outstanding bonus liability / wagering-requirement tracking.** You have no wagering requirements. The welcome bonus is paid outright and gated only by a lifetime-wager bind cap; there is no locked/unlocked bonus split. There is nothing to age.
- **Published proof-of-reserves / public "total bets placed" vanity stats.** Fine marketing later. Item 1 (internal coverage, continuous) is what actually keeps you solvent; a published snapshot proves nothing between snapshots.
- **ARPU / ARPPU as headline tiles.** Derivable, uninterpretable in isolation, and already implied by GGR ÷ active players. Don't spend a tile on it.
- **Session-time RG limits, reality checks, affordability checks, SAR ratios, intervention coverage rate.** These are UKGC licence obligations. You have no licence, no KYC and no jurisdiction gating, so they are not obligations — and modelling a compliance programme you can't actually execute (no identity, no age, no geo) produces theatre. Items 22 and 23 are the parts that carry real value regardless of licensing.
- **Chat volume / moderation load / complaint counts as dashboard KPIs.** `user_reports` is worth a small inbox, not a panel. Complaint clustering *by category* is mildly useful as a game-outage proxy — fold it into item 15 rather than giving it its own view.

---

## Cannot build without new data capture

These are genuinely blocked. Ordered by value-per-unit-of-plumbing.

**1. Everything multi-accounting, collusion-by-identity, and bot-farm-by-device.**
*Missing:* there is **no IP and no device signal on any bet, deposit, withdrawal, chat message or report.** The only IP in the entire database is `sessions.ip` (migration 123), written once at SIWE login and hard-deleted 30 days after expiry. `poker_chip_ledger` has no `ip`, no `session_id`, no `user_agent`, no `channel`. There is no device fingerprint of any kind — no canvas/WebGL hash, no persistent client id.
*Worse:* the **Telegram Mini App path creates no session row at all.** Arcade routes resolve the wallet from Telegram `initData` → `telegram_links` before ever touching the SIWE cookie, so for an unknown share of your traffic there is no network or device signal whatsoever, and nothing in the schema even records which door a bet came through.
*Log first:* add `ip`, `user_agent`, `channel` ('web'|'telegram') and a `session_id`/request-id to `poker_chip_ledger` (or a lightweight request-context table written alongside each bet), and persist a session row for the Telegram path. **This one change unlocks the entire multi-accounting / IP-cluster / VPN-risk / "same IP on both sides of a poker table" family.** It is the single highest-leverage schema change available.

**2. Persistent login history and failed-auth telemetry.**
*Missing:* sessions are purged 30 days after expiry, so "wallets that ever shared an IP/UA" degrades to a rolling window. Bad signature, reused nonce, expired nonce and wrong-domain failures all throw and persist nothing.
*Log first:* an append-only `login_events` table (wallet, ip, ua, channel, success/failure reason, timestamp) that is never pruned.

**3. Deposit counterparty / funding-source graph.**
*Missing:* `player_deposits` stores only the credited wallet, amount, tx_hash and block_number — never the `from` address of the funding transfer.
*Blocks:* wallet-cluster detection, referral-ring detection by shared funder, exchange-vs-mixer provenance, peel chains, and the crypto-native equivalent of payment-instrument clustering (which is the one join key that survives new emails, new devices and anti-detect browsers).
*Log first:* capture and store the `from` address (and token/route) on every deposit. Cheap — the indexer already has it in the transfer log.

**4. Tamper-evident ledger.**
*Missing:* `poker_chip_ledger` is append-only **by convention only** — no triggers, no `REVOKE UPDATE/DELETE`, no row hash chain, no checksum column. A bug or anyone with DB access can rewrite financial history and nothing would ever detect it.
*Log first:* `REVOKE UPDATE, DELETE` on the table for the app role, plus a per-row hash chain (`prev_hash`, `row_hash`) so drift is provable. Without this, item 3's reconciliation can be silently defeated.

**5. Admin action log and effective-dated config history.**
*Missing:* `admin_credit_log` covers balance adjustments only. Nothing records who changed `vip_tier_config` rakeback/thresholds, `referral_config`, the Drop guarantee, `wheel_spin_rules`, `blackjack_sp_wager_tiers`, `admin_game_config`, or game house-edge parameters — and none of those tables are versioned, only stamped with `updated_at`. You cannot answer "who raised the rakeback rate the day before that payout spike", and historical bonus-cost attribution can never be exactly recomputed.
*Log first:* a generic `admin_actions` audit table (actor, action, target, before JSONB, after JSONB, timestamp) and effective-dated rows for each config table.

**6. Rejected-bet and failed-action telemetry.**
*Missing:* an insufficient-balance bet throws in `poker-chip-wallet.ts:214`; validation rejections return 4xx. Neither writes a row.
*Blocks:* declined-bet rate (the strongest single-event signal that a player has exhausted funds and is still trying), deposit friction, abandoned withdrawals, and game-error rates.
*Log first:* a `rejected_actions` table (wallet, action, reason, amount, channel, timestamp).

**7. KYC / identity / age / geo / sanctions.**
*Missing:* entirely — a grep for kyc, aml, geoloc, country_code, jurisdiction, date_of_birth, sanction, ofac, source_of_funds across the whole repo returns zero hits. Identity is the wallet address, full stop.
*Blocks:* age verification, jurisdiction blocking, sanctions/PEP screening, source-of-funds review, duplicate-account detection by person, and any threshold reporting. Be clear-eyed: this is a deliberate product posture, not an oversight, and adopting the AML metric set is meaningless without it. If you ever pursue a licence, this is the first thing that has to exist — and the on-chain deposit-risk screening in item 3's data would become the highest-value piece of it.

**8. Alert / case state** — see item 9 above (one `alerts` table + `player_flags`). Listed again here because it is a schema change, and because without it every real-time item on this list is a number nobody sees at 3am.