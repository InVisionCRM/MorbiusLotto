# Future Features

Parked ideas with enough design context to pick up later without a rediscovery pass. Add new sections as new ideas land.

---

## Poker Table Sponsorship

Umbrella for any work expanding how poker-table sponsorships are surfaced, sold, or rendered. The base mechanic (the `PokerTableLogoSponsorModal` + the `SponsoredTokenMarquee` strip) ships today; these are additive enhancements.

### Intermission Ad — 5:1 Sponsored-Token Banner

**Status:** designed, not implemented.
**Live mockup:** [mockups/intermission-ad-variants.html](mockups/intermission-ad-variants.html) — open in a browser to see the styling, animations, and exact placement against a poker-table backdrop.

#### Concept

A wide horizontal banner that surfaces the active table sponsor during the 15-second intermission between poker hands. Refreshes the existing in-action `SponsoredTokenMarquee` scroll-strip with a richer, more graphic ad surface that includes a 24h price chart.

#### Visual design (final iteration)

- **Aspect:** 5:1 (wide banner).
- **Size:** ~74% of table width — scales with the table; on a 1200px table that's roughly 890 × 178.
- **Placement:** anchored at `top: 24%` of the poker table. Sits in the dead-zone strip between the top-rim opponent seats (anchored at `fy: 0.06`) and the community cards (`fy: 0.51`). No card position overlaps at any seat count.
- **Style:** "Pulse Beacon" — radial dark-blue → black gradient background, cyan border + corner brackets, animated pulsing rings around the token logo.
- **Animations:**
  - 2.4s loop on the pulse rings around the logo
  - 15s left-to-right countdown bar sweeping across the bottom edge

#### Banner content, left-to-right

1. **Identity** — pulsing beacon (logo, 38px) + token name + ticker stacked.
2. **Price block** — large USD price + 24h change (color-coded green/red).
3. **Sparkline** — 24h GeckoTerminal OHLC, area + line, flex-grows to fill space on wider tables.
4. **Stats grid (2×2)** — Mcap · Liq · Hodl · Age. FDV / 24h Vol can swap in if preferred.
5. **Actions** — `Chart ↗` (ghost) and `Become Sponsor` (primary, cyan gradient).

#### Data sources

| Field | Source |
|---|---|
| name, symbol, logoUrl | DexScreener `/tokens/{address}` — already parsed in [`lib/dexscreener-token-info.ts`](lib/dexscreener-token-info.ts) |
| priceUsd, priceChangeH24, marketCap, fdv, liquidityUsd, volumeH24, pairCreatedAt | DexScreener — already parsed |
| holders | PulseScan `/api/v2/tokens/{address}` — already fetched by [`fetchHoldersCount`](components/poker/SponsoredTokenMarquee.tsx) in the marquee |
| 24h OHLC sparkline | **NEW:** GeckoTerminal `https://api.geckoterminal.com/api/v2/networks/pulsechain/pools/{pool_address}/ohlcv/hour?limit=24` |
| pool address | DexScreener returns it as `pairs[0].pairAddress` — needs to be added to `DexscreenerTokenInfo` and the parser (one extra line in [`lib/dexscreener-token-info.ts`](lib/dexscreener-token-info.ts)). |

#### Placement safety

The poker table renders cards at the following fractional anchors (from [`lib/poker-seat-layout.ts`](lib/poker-seat-layout.ts) and [`components/poker/PokerTable.tsx`](components/poker/PokerTable.tsx)):

- Community cards: `(0.50, 0.51)`, `zIndex 25` (or `29` during showdown)
- Hero hole cards: `(0.50, 0.89)`, `zIndex 26+`
- Opponent rim seats: 9 anchors ringing the felt, all at the table edges

The 5:1 banner at `top: 24%` sits entirely inside the empty horizontal strip above the community cards — no card anchor falls inside it at any seat count. As belt-and-suspenders, the banner gets `z-index: 22` so cards always punch through if any future card animation strays into that strip.

#### Implementation pointers when ready

- **New component:** `components/poker/PokerIntermissionAd.tsx`. Mirror [`SponsoredTokenMarquee.tsx`](components/poker/SponsoredTokenMarquee.tsx) — it already wires up DexScreener + PulseScan fetches and has the right prop shape (`sponsor`, `sponsoredUntil`, `priceMorbiusChips`, `onOpenSponsorModal`).
- **Extend the type:** add `pairAddress: string | null` to `DexscreenerTokenInfo` and parse it from `pair.pairAddress`.
- **New helper:** `fetchGeckoTerminalOhlc(poolAddress, signal)` → returns `Array<{ t: number; o: number; h: number; l: number; c: number }>`. Cache by pool address in module-level state to avoid refetch on every intermission tick.
- **Sparkline rendering:** hand-rolled SVG path (the mockup uses this). No chart library needed at this size; if we later want candles or zoom, switch to TradingView `lightweight-charts` (~40KB).
- **Mount point:** somewhere inside the poker table render tree where it can be absolutely positioned relative to the table root. Likely a sibling of the community-card layer in [`PokerBoard.tsx`](components/poker/PokerBoard.tsx) or the table root in [`PokerTable.tsx`](components/poker/PokerTable.tsx).
- **Visibility trigger:** show while `street === 'intermission'` (or whatever the runout-complete → next-hand-dealing transition is called). The 15-second countdown animation uses the same window the server uses to schedule the next deal.
- **CTAs:** wire `Become Sponsor` to the same `onOpenSponsorModal` callback the marquee uses. Wire `Chart ↗` to `buildScanMorbiusLink(targetAddress)` from `lib/dexscreener-token-info.ts`.

#### Open questions

- Should the ad show on every intermission, or only every Nth (to avoid wearing on regulars)?
- Track impressions / clicks for sponsor analytics?
- Hide on small viewports (mobile) where 74% width still feels cramped, and fall back to the existing marquee strip?
- For the "Become Sponsor" CTA on the user who's already the sponsor: hide, dim, or relabel as "Extend sponsorship"?

---

### Open sponsorship to non-seated users (Telegram Mini App + web)

**Status:** scoped, not implemented.

#### Concept

Today only seated players at a poker table can buy the sponsor slot. Open it up so anyone — Telegram Mini App users, web visitors browsing the lobby — can sponsor any active table without sitting down. Pairs naturally with the existing Mini App home hub (shipped in Phase 1) and the in-progress Phase 2/3 work on the `telegram-miniapp-phase-2-3` branch.

#### Current restriction is a one-liner

[`server/src/services/poker-game.service.ts:1998`](server/src/services/poker-game.service.ts:1998):

```ts
const seatCheck = await pool.query(
  `SELECT 1 FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2) ...`,
  [tableId, normalized]
);
if (seatCheck.rows.length === 0) {
  throw new Error('Must be seated at this table to sponsor the logo');
}
```

The rest of `purchaseTableLogoSponsorship()` — MORBIUS balance deduction, DB write, sponsor broadcast to seated WS clients — works regardless of caller. Drop or relax that one block and the mechanic opens up.

#### What it takes

1. **Server (≈5 min)** — remove or relax the `seatCheck`. Could gate it behind a flag (`allowOffTableSponsorship: true`) so the WS path keeps the existing guard and only the new HTTP path bypasses it.
2. **Transport (1–2 hr)** — today the purchase fires through `wsClient.pokerPurchaseTableLogo` (`lib/websocket-client.ts:996`). Mini App users won't have a WS connection to a specific table, so wrap `purchaseTableLogoSponsorship()` in a plain HTTP endpoint, e.g. `POST /api/poker/tables/:tableId/sponsor`. The function already broadcasts the resulting state via `getTableState()` updates, so seated players' tables refresh automatically.
3. **UI — Mini App (half a day)** — a new screen listing active poker tables with their current sponsor, time remaining, and trump-price. Tap → modal flavored for Mini App (decouple [`PokerTableLogoSponsorModal`](components/poker/PokerTableLogoSponsorModal.tsx) from its `wsClient` prop and have it call the HTTP endpoint instead).
4. **UI — web lobby (optional, 1–2 hr)** — same affordance in the existing poker lobby for non-Telegram visitors.

#### Tradeoffs

- **Spam protection** — "must be seated" doubled as a soft spam filter. The MORBIUS payment is the real gate (sponsorship costs real chips, balance is checked atomically), but if extra protection is wanted, rate-limit the new endpoint by wallet address.
- **Discoverability vs. clutter** — natural home is a "Tables for sponsorship" tab in the Mini App. Lighter touch: surface "X tables open for sponsorship" as a card on the existing home hub. Decide based on how prominent we want the feature.
- **Heads-up notification** — when an outside user sponsors a table, seated players already see the marquee update + sponsor toast via the existing broadcast path. No extra work.
- **MORBIUS balance access** — Mini App users need their wallet's MORBIUS balance available the same way the modal already pulls it via `fetchPlayBalanceWei`. If the Mini App auth flow already exposes a connected wallet address (Phase 1 foundation should), this works out of the box.
- **Anti-griefing** — if a non-seated user sponsors a hostile token (rug, scam logo), seated players can already counter-sponsor to trump it. The existing trump-price mechanic remains the defence. Same dynamic as today, just with a wider pool of potential sponsors.

#### Open questions

- Should there be a separate (cheaper / more expensive?) price for off-table sponsorships, or use the same `computeTableLogoChangePriceMorbiusChips` formula?
- Should non-seated sponsorships count toward any per-wallet daily cap (we don't have one today)?
- Allow Mini App users to *queue* sponsorships (auto-buy when the current one expires), or only immediate-purchase?

---

### Telegram group broadcast — new sponsorship card

**Status:** designed, not implemented.
**Live mockup:** [mockups/telegram-sponsor-notifications.html](mockups/telegram-sponsor-notifications.html) — see the final card and the broadcast pattern across three example groups.

#### Concept

When any sponsorship is purchased, the bot fans out a single card to **every Telegram group it belongs to**. No DMs, no per-table channels, no opt-in lists — wherever `@morbius_bot` lives, the card appears. Drives community awareness and creates an external CTA to trump.

#### Card content (kept deliberately minimal)

- **Photo header** — sponsor token logo on a felt-green backdrop, with a soft cyan pulse-ring halo. Top-right corner pill reads `▾ NEW SPONSOR ▾`.
- **Title** — `🎰 New sponsor at <Table Name>`
- **Body** — `$TICKER just sponsored the table for the next 10 minutes.`
- **Burn strip** — `🔥 175,000 MORBIUS burnt · supply ↓` in a warm orange/red panel under the body.
- **Inline keyboard** (two rows, both full-width):
  - Row 1: `View Table ↗` (ghost)
  - Row 2: `Trump for {next_price} MORBIUS` (primary, cyan gradient)

No price chart, no market stats, no socials — those live in the marquee and intermission ad. The group card is meant to be glanceable.

#### Implementation

- **New table** `telegram_bot_groups (chat_id BIGINT PK, title TEXT, added_at TIMESTAMPTZ, removed_at TIMESTAMPTZ)`. Populated by handling the bot's `my_chat_member` updates — when an admin adds the bot, insert; when removed, set `removed_at`. Broadcast queries filter `WHERE removed_at IS NULL`.
- **Fan-out hook** — at the end of [`purchaseTableLogoSponsorship`](server/src/services/poker-game.service.ts:2050) (after the DB commit but inside the same async flow), look up the current price, build the payload, and `sendPhoto` to every group. Telegram's per-bot rate limit is ~30 messages/sec — for typical group counts that's fine without batching; add a queue if/when we cross that.
- **Per-message tracking** — `telegram_sponsor_cards (sponsorship_id UUID, chat_id BIGINT, message_id BIGINT, posted_at TIMESTAMPTZ, PRIMARY KEY (sponsorship_id, chat_id))`. Lets the bot find the message in every group when:
  - The slot is trumped → edit each card to grey the Trump button and add an `🛑 Outbid by $NEW` line
  - The slot expires → swap the Trump button for `Slot open · sponsor now for {floor} MORBIUS`

#### Burn semantics

The current [`purchaseTableLogoSponsorship`](server/src/services/poker-game.service.ts:2029) does:

```sql
UPDATE players SET balance = balance - $2::NUMERIC ...
```

It deducts from the buyer's off-chain MORBIUS balance and credits the wei nowhere — already effectively a burn from an accounting standpoint, and consistent with what the card claims. If we ever want a **real** on-chain burn (visible on the PulseChain explorer), that's a separate ticket — route the wei to `0x000…dEaD` at the contract layer.

#### Open questions

- **Rate limiting / dedupe** — if a single table is trumped 5 times in 60 seconds, do we want 5 cards in every group, or batch into "5 new sponsors in the last minute" digests?
- **Bot-removed cleanup** — when an admin removes the bot, do we soft-delete existing cards or leave them?
- **"Trump for X" button target** — does it deeplink to a Mini App route that handles the purchase, or to the regular web table, or both depending on the user's client?
- **Localization** — caption is English. If we know a group's primary language from Telegram metadata, do we localize? (Probably out of scope for v1.)
- **Per-group opt-out** — let group admins disable cards in their group with a `/morbius mute` command, or just let them kick the bot if they don't want them?

---

### Marquee 2-state toggle — Sponsor view ⇄ Market view

**Status:** designed, not implemented.
**Live mockup:** [mockups/marquee-ticker-toggle.html](mockups/marquee-ticker-toggle.html) — see both states side-by-side with the toggle pill.

#### Concept

Add a 2-icon toggle pill on the far right of [`SponsoredTokenMarquee`](components/poker/SponsoredTokenMarquee.tsx). Two states:

| State | Icon | Content |
|---|---|---|
| **Sponsor view** (default) | 📣 megaphone | Today's behaviour — sponsor token's identity, price, socials, scan link, sponsorship CTA |
| **Market view** (new) | 📊 bar-chart | Stock-ticker tape of every enabled, dedupe'd token in the platform's catalog: `$TICKER $price ±change% · …` repeating |

Toggle choice persists per-user via `localStorage` (key e.g. `pokerMarqueeMode`). Default on first visit is sponsor view.

#### Data sources for Market view

Two combined sources, both filtered to rows that have **both** a valid `token_contract_address` (matches `^0x[a-fA-F0-9]{40}$`) **and** a non-null `ticker`:

1. **`blackjack_tables`** (existing) — fetched from `/api/blackjack/tables?enabledOnly=true`. Currently has 30 enabled rows; 24 pass the ticker+address filter after we patch Dark Pepe and ZAPDOS (below).
2. **`marquee_extra_tokens`** (new) — a small table for tokens that aren't blackjack tables but belong in the market ticker. Bootstrap rows: WPLS, HEX, INC, PLSX.

**Dedupe by lowercased address** before rendering — `$MORBIUS` currently appears 7 times in `blackjack_tables` (Clean, High Roller, High Roller 2, Moonlight, Glowing Table, Glowing Table 1, Glowing Logo all point to the same contract). Without dedupe the ticker tape repeats it 7 times in a row.

Expected unique-ticker list after the data patches below: ~22 tickers (18 from blackjack_tables + 4 from extras).

#### Schema + bootstrap data

**Migration** (new):

```sql
CREATE TABLE IF NOT EXISTS marquee_extra_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_contract_address VARCHAR(42) NOT NULL,
  ticker VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marquee_extra_tokens_addr_lower CHECK (token_contract_address = LOWER(token_contract_address)),
  CONSTRAINT marquee_extra_tokens_addr_format CHECK (token_contract_address ~ '^0x[a-f0-9]{40}$')
);

CREATE UNIQUE INDEX marquee_extra_tokens_addr_uq ON marquee_extra_tokens (token_contract_address);

INSERT INTO marquee_extra_tokens (token_contract_address, ticker, name, sort_order) VALUES
  ('0xa1077a294dde1b09bb078844df40758a5d0f9a27', 'WPLS', 'Wrapped Pulse', 100),
  ('0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', 'HEX',  'HEX',           101),
  ('0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', 'INC',  'Incentive',     102),
  ('0x95b303987a60c71504d99aa1b13b4da07b0790ab', 'PLSX', 'PulseX',        103);
```

**Patch existing blackjack_tables rows** (Dark Pepe + ZAPDOS were excluded today because they had no address/ticker):

```sql
UPDATE blackjack_tables
   SET token_contract_address = '0xe9e15d6f7380d1718a3bdeee720ee979fac1f5bc',
       ticker = 'DPEPE'
 WHERE name = 'Dark Pepe';

UPDATE blackjack_tables
   SET token_contract_address = '0xed09372f952c3f47a60ecba80c5981df55553f33',
       ticker = 'ZAP'
 WHERE name = 'ZAPDOS';
```

Canonical tickers (`DPEPE`, `ZAP`) verified live against DexScreener.

#### Server endpoint

Add a thin endpoint `GET /api/marquee/tokens` that returns the deduped union:

```sql
WITH combined AS (
  SELECT token_contract_address, ticker, name, sort_order
    FROM blackjack_tables
   WHERE enabled = TRUE
     AND ticker IS NOT NULL AND ticker <> ''
     AND token_contract_address ~ '^0x[a-fA-F0-9]{40}$'
  UNION ALL
  SELECT token_contract_address, ticker, name, sort_order
    FROM marquee_extra_tokens
   WHERE enabled = TRUE
)
SELECT DISTINCT ON (LOWER(token_contract_address))
       LOWER(token_contract_address) AS address, ticker, name, sort_order
  FROM combined
 ORDER BY LOWER(token_contract_address), sort_order ASC;
```

Don't reuse `/api/blackjack/tables` directly — it returns blackjack-table-specific fields (`src`, `kind`, `iframe_url`, etc.) that aren't relevant here, and adding the extras would change its contract.

#### Frontend implementation

- **State machine in `SponsoredTokenMarquee.tsx`** — `useState<'sponsor' | 'market'>(...)` initialized from `localStorage`.
- **Market data fetch** — one-shot `fetch('/api/marquee/tokens')` on mount → for each row, parallel `fetchDexScreenerTokenInfo(address)` via `Promise.allSettled`. Cache the resulting `Array<{ ticker, priceUsd, priceChangeH24 }>` in module-level state. Refresh on a 60s interval. One slow/missing token doesn't block the rest.
- **Rendering** — keep the existing `animate-poker-marquee` scrolling container. When mode = `market`, swap children for the ticker tape rows (`$TICKER $price ±change%` with red/green class on change).
- **Toggle pill** — sits in a new flex sibling to the right of the scrolling region, outside the mask gradient so it's never partially hidden. Two `<button>` elements with megaphone / bar-chart SVGs; active one gets the cyan fill.

#### Open questions

- **Sort order in market view** — alphabetical (predictable), by 24h change % descending (drama), or by market cap descending (legitimacy)?
- **Click behaviour on a market-view ticker** — clickable to open the sponsor modal pre-filled with that token? Could turn the marquee into a discovery tool for "tokens you can sponsor with."
- **Mobile** — at very narrow widths, drop the toggle entirely and pin to sponsor view? Or keep the toggle but make it the same height as the marquee with no chrome?
- **Pause-on-hover** — does the scroll pause when the player hovers, so they can read a specific ticker? Probably yes for accessibility.

---

## Poker Sidebar

Refactor the right-rail activity sidebar from a single-purpose feed into a tabbed surface that absorbs functionality currently locked behind top-right header modals. Solves the core problem that modals block the table — a player can no longer view stats, balance, or sponsorship info during a hand without dismissing a popup the moment it's their turn.

### Tabbed sidebar — Activity · Sponsor · Stats · Wallet · Settings

**Status:** designed, not implemented.
**Live mockup:** [mockups/sidebar-crypto-tabs.html](mockups/sidebar-crypto-tabs.html) — see the full table + sidebar with the Sponsor tab active, plus preview cards for the other four tabs at sidebar width.

#### Layout decision

Tabs sit at the **top** of the sidebar; the active tab fills the entire panel below. No split, no second region — click and read happen in the same vertical area. Activity is the default tab on session open (preserves current behaviour).

The action UI (Fold / Call / Raise) lives on the table itself via [`PokerActions.tsx`](components/poker/PokerActions.tsx), independent of which sidebar tab is active. The table's existing yellow "Your turn" pulse provides the urgency cue — the sidebar doesn't need its own badge.

#### Tabs

| Tab | Content | Replaces |
|---|---|---|
| **Activity** (default) | Current `PokerActivityFeed` content — hand history, actions, chat messages, chat input at bottom | — |
| **Sponsor** | Inline Pulse Beacon card: token logo + pulsing rings, 24h sparkline (GeckoTerminal OHLC), price + 24h change, 4 stats (Mcap / Liq / Hodl / Age), `Trump for X MORBIUS` primary + `Promote your token` secondary buttons, chart link | [`PokerTableLogoSponsorModal`](components/poker/PokerTableLogoSponsorModal.tsx) |
| **Stats** | Player avatar + name + address, 6 stat tiles (Hands / Win% / P&L / VPIP / PFR / AGG), 30-day P/L sparkline, detail list (biggest pot, showdown %, best finish, hours) | Player Stats modal |
| **Wallet** | MORBIUS balance (large) + USD equiv, Buy Chips / Cash Out buttons, recent transactions from `poker_chip_ledger` (wins, sponsor burns, buy-ins, tips) with colour-coded delta, "view all" link | — (new) |
| **Settings** | Game toggles (Sounds, Auto-rebuy, Confirm bets), Display toggles (Show equity, Hand-strength tints), Personal links (Edit QuickChat, Table appearance, How to play) | Table Settings / Sounds / Edit QuickChat / How to Play modals |

#### Implementation pointers

- **Refactor** [`PokerActivityFeed.tsx`](components/poker/PokerActivityFeed.tsx) into a thin container that renders a tab strip + the active tab component. The existing feed body becomes `<PokerActivityTab>`.
- **New components:**
  - `components/poker/sidebar/PokerSponsorTab.tsx` — shares fetch helpers with [`SponsoredTokenMarquee.tsx`](components/poker/SponsoredTokenMarquee.tsx) (DexScreener + PulseScan), adds GeckoTerminal OHLC for the sparkline. CTAs reuse the existing `onOpenSponsorModal` handler chain — but on click, it now opens an inline confirm sheet inside this tab rather than a modal.
  - `components/poker/sidebar/PokerStatsTab.tsx` — extract content from the current Player Stats modal into a reusable panel; modal becomes a thin wrapper around it for mobile.
  - `components/poker/sidebar/PokerWalletTab.tsx` — **new.** Pulls balance from `player_poker_chips.balance` and recent transactions from `poker_chip_ledger` (filter by `wallet_address`, order by `created_at DESC LIMIT 20`). `reason` column maps to icon + colour (`tournament_prize` / `cash_join` / `tournament_buyin` etc.).
  - `components/poker/sidebar/PokerSettingsTab.tsx` — extract content from the existing settings modals.
- **Retire / thin** the header dropdowns in [`PokerHeaderBar.tsx`](app/poker/[tableId]/PokerHeaderBar.tsx). Stats / Settings dropdowns become single-button shortcuts that just activate the matching sidebar tab. Sponsor + Tip Dealer quick-action buttons can stay in the header. Voice Commands and Bots admin (admin-only) stay in the header — they're not natural tabs.
- **Tab persistence** — remember the player's last-selected tab in `localStorage` so reopening the table doesn't reset to Activity every time.

#### Mobile

The sidebar is already collapsible on mobile. Same 5-tab control renders inside whatever the collapsed/expanded mobile container is — no bottom-sheet redesign needed. The tab order matches mental priority (Activity first), so on small screens the user can still get to chat in one tap.

#### Open questions

- **Auto-switch to Activity on turn?** When the server fires the act prompt, optionally bump the player back to Activity tab so they see the context. Or trust the table's yellow pulse and leave their tab alone.
- **Sponsor tab on non-seated users (Mini App)** — the [open-sponsorship feature](#open-sponsorship-to-non-seated-users-telegram-mini-app--web) above can render the exact same Sponsor tab panel in the Mini App. One component, two mount points.
- **Wallet tab on small balances** — if the player has 0 MORBIUS, default to a "Buy chips" empty state rather than a giant `0` number.
- **Voice Commands** — currently a header button. Worth promoting to a tab if voice gets more features, otherwise leave it in the header where it is.
