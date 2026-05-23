# Changelog

A running log of notable changes to MORBlotto, newest first.
Each entry records what changed, why, and the verification outcome.

---

## 2026-05-22 — Cash games: live table cards on the Telegram Rail

**What & why:** Extends the cash-game Rail beyond join lines. Each cash table
now gets a single editable "card" in the group — like the tournament cards —
that updates in place as players join and big pots are won, plus a short
activity line for each event so the feed still visibly moves.

### Added

- `server/migrations/126_telegram_cash_table_cards.sql` *(new)* — one row per
  cash table: the group message id of its card and the biggest pot seen.
  Mirrors `telegram_tournament_cards` (124). **Must be applied before the
  feature works** — `node server/run-migration.js migrations/126_telegram_cash_table_cards.sql`.

### Changed

- `server/src/services/telegram-rail.service.ts` — added the cash-table card
  system: `railCashTableCreated` (posts the card + a "new table" line; skips
  boot-seeded house tables), `railCashPlayerJoined` (now also edits the live
  card on every join, with the join line still cooldown-gated), and
  `railCashBigPot` (announces pots of at least 100x the big blind and tracks
  the table's biggest pot on the card). New `buildCashCard` / `editCashCard` /
  `loadCashCard` helpers.
- `server/src/services/poker-game.service.ts` — `createTable` fires
  `railCashTableCreated` for player-created tables; `persistShowdown` fires
  `railCashBigPot` after every cash hand (the 100x threshold is applied inside
  the Rail function).

### Verification outcome

- Both service files transpile clean (`ts.transpileModule`).
- **Not yet done:** migration 126 must be run, and a live check (a created
  table, joins, and a 100x-big-blind pot) with `TELEGRAM_GROUP_CHAT_ID` set.
- Known minor: an admin-deleted table leaves its card at its last state (no
  "closed" edit) — a rare admin action; an easy follow-up if wanted.

---

## 2026-05-22 — Cash games: join announcements on the Telegram Rail

**What & why:** The Telegram group "Rail" announced poker tournament activity
(starts, joins, results) but nothing for cash games. This posts to the group
when a player sits down at a cash table, so it stays a live activity hub.

### Changed

- `server/src/services/telegram-rail.service.ts` — added `railCashPlayerJoined`:
  a fire-and-forget group post ("X sat down at the 5/10 cash table — 3/6
  seated", with a "Take a seat" button). It carries a per-(table + wallet)
  in-memory cooldown (10 minutes) so a player who sits, stands and re-sits
  cannot flood the feed — the existing Rail had no throttling on joins at all.
- `server/src/services/poker-game.service.ts` — `_joinTable` now fires
  `railCashPlayerJoined` after a successful join. Server bots are skipped (via
  `getServerPokerBotAddressSet`) so automated seats never hit the feed.

### Verification outcome

- Both files transpile clean (`ts.transpileModule`).
- **Not yet done:** live check — needs a real cash-table join with
  `TELEGRAM_GROUP_CHAT_ID` configured.

---

## 2026-05-22 — Create Tournament: Mini App screen

**What & why:** Second half of the Mini App Create Tournament feature — the
screen players use. With the backend "door" already in place, a player can now
spin up a poker tournament from inside Telegram.

### Changed

- `app/tg/page.tsx` — added the `'createTournament'` view: a three-card format
  picker fed by the real `MTT_TEMPLATES` (Sunday Major, Turbo MTT, Freeroll
  Friday), a name field and a `datetime-local` start-time picker. On submit it
  assembles the create-params exactly as the website wizard does — reusing
  `POKER_TOURNAMENT_DEFAULT_CONFIG` and `buildPrizePercents` — POSTs to
  `/api/telegram/miniapp/tournament/create`, and shows a success or error
  state. A "Create a tournament" button on the lobby screen opens it.

### Verification outcome

- `app/tg/page.tsx` transpiles clean (`ts.transpileModule`). Param assembly
  mirrors the verified website `buildCreateParams`.
- **Watch:** importing `POKER_TOURNAMENT_DEFAULT_CONFIG` from a hooks file may
  add bundle weight to the Mini App — review on the next optimization pass.
- **Not yet done:** live check — the template picker, the datetime input and a
  real create round-trip need an on-device pass.

---

## 2026-05-22 — Create Tournament: Mini App backend endpoint (the login door)

**What & why:** First half of the Mini App Create Tournament feature. Poker
tournament creation is normally gated behind a WebSocket EIP-712 wallet
signature, which the Mini App can't produce (no browser wallet). This adds a
REST endpoint that trusts the verified Telegram `initData` instead — the "login
door." Chip-based tournament creation is a pure database operation, so no
signature or contract is ever needed.

### Changed

- `server/src/routes/telegram.routes.ts` — added
  `POST /api/telegram/miniapp/tournament/create`. It verifies the `initData`,
  resolves the linked wallet as the creator, builds a chip-only
  `CreatePokerTournamentParams`, and calls the existing
  `pokerTournamentService.createPokerTournament()`. The custom-token and
  platform-promo funding sources are deliberately never forwarded, so the Mini
  App can only ever create the signature-free chip / chip-freeroll kind.
  Validation failures (short name, past start time, bad config, insufficient
  chips for a freeroll) are surfaced to the player.

### Verification outcome

- Transpiles clean (`ts.transpileModule`); written against the verified
  `createPokerTournament` signature and `CreatePokerTournamentParams` type.
- **Not yet done:** the Create Tournament screen that calls this endpoint, and
  a live check.

---

## 2026-05-22 — Poker Lobby: Mini App screen + hub tile live

**What & why:** Second half of the Telegram Mini App Poker Lobby — the screen
that reads the lobby endpoint, plus the hub tile that opens it. Players can now
browse running tournaments and open cash tables from inside Telegram.

### Changed

- `app/tg/page.tsx` — added the `'lobby'` view: a back header, a Tournaments
  section and a Cash tables section rendering cards in the Getting Started
  style. Tournament cards show a start chip (a day + time for scheduled events,
  "Starts when full" for fill-based, a pulsing "In play" for live) and one
  action — Register now, Registration closed, or Watch. Cash cards lead with the
  stakes and a Play now / Table full button. Free-entry tournaments get a
  glowing green chip. v1 is browse-only — every action deep-links to morbius.io.
  The hub's "Poker Lobby" tile flipped from a disabled "Soon" tile to a live one.
  Added a fetch effect for `GET /api/telegram/miniapp/lobby` and two card
  components plus their data-mapping helpers.

### Verification outcome

- `app/tg/page.tsx` transpiles clean (`ts.transpileModule`).
- **Not yet done:** live check inside Telegram. The screen, its empty / loading
  / error states and the data mapping have only been transpile-verified —
  needs an on-device pass.

---

## 2026-05-22 — Poker Lobby: Mini App backend feed endpoint

**What & why:** First half of the Telegram Mini App Poker Lobby. The Mini App
is a plain `fetch` client and can't use the WebSocket `poker_tournament_list` /
`poker_list_tables` messages, so it needs a REST endpoint serving the same
data. The lobby screen (built next) will read this.

### Changed

- `server/src/routes/telegram.routes.ts` — added `GET /api/telegram/miniapp/lobby`,
  returning `{ ok, tournaments, tables }`. It calls the existing
  `pokerTournamentService.listPokerTournaments()` and
  `pokerGameService.listTables()` — no SQL was rewritten. Tournaments are
  filtered for the browse view (finished, cancelled and private events hidden).
  It is a public read with no auth — it exposes only what the unauthenticated
  WebSocket lobby messages already do. `RegisterTelegramRoutesOptions` gained
  the two poker services.
- `server/src/server.ts` — passes `pokerGameService` and
  `pokerTournamentService` (both already in scope) into `registerTelegramRoutes`.

### Verification outcome

- Both files transpile clean (`ts.transpileModule`). The new code was written
  against the actual `PokerTournamentSummary` / `PokerTableSummary` interfaces
  and the verified `listPokerTournaments` / `listTables` signatures.
- No new Next.js proxy needed — `/api/telegram/*` already routes through
  `app/api/telegram/[...path]/route.ts`.
- **Not yet done:** the Mini App lobby screen that consumes this endpoint, and
  a live check.

---

## 2026-05-22 — Fix: Video Poker Mini App game would not open

**What & why:** The MORBIUS Arcade Video Poker game never opened — it showed
"Could not load the game" and the table never rendered. Root cause: the
component (`components/telegram/MiniAppVideoPoker.tsx`) calls
`/api/video-poker/paytable|deal|draw|verify` as same-origin paths, but — unlike
every other proxied API namespace (`/api/cosmetics`, `/api/telegram`, etc.) —
there was no Next.js route to receive them, and `next.config.ts` has no
rewrites. Every request 404'd at the Next.js layer and never reached the
Express backend, where the routes, game logic and auth were all already
correct.

### Added

- `app/api/video-poker/[...path]/route.ts` *(new)* — a catch-all proxy that
  forwards `GET`/`POST` `/api/video-poker/*` requests to the Express backend.
  Modeled on the existing `app/api/cosmetics/[...path]/route.ts`; uses the
  shared `proxyJson` helper. This single missing file was the whole bug.

### Verification outcome

- New route transpiles clean (`ts.transpileModule`).
- Backend routes (`server/src/routes/video-poker.routes.ts`), game logic
  (`server/src/services/video-poker.ts`) and the Telegram `initData` auth were
  traced and confirmed already correct — no change needed there.
- **Action still needed:** confirm migration `125_video_poker.sql` is applied
  to the production database. The routing fix makes the game open and the
  paytable load; if the `video_poker_hands` table is missing, the first Deal
  will 500. Run `node server/run-migration.js migrations/125_video_poker.sql`
  if it has not been applied.
- **Not yet done:** live check inside Telegram — needs a deploy.

---

## 2026-05-22 — Telegram Mini App: full visual redesign to the Getting Started style

**What & why:** The Mini App's hub, stats and link screens used a generic
cyan-on-near-black theme that clashed with the Video Poker game's own look —
effectively two design languages bolted into one app. This reskins every
Mini App screen to match the site's Poker onboarding modal
(`components/poker/PokerOnboardingChecklist.tsx`): navy gradient, cyan accents,
the Mitr brutalist headings, cyan-to-blue glow buttons. It also removes the
redundant Wallet screen — it only repeated balances already shown on the hub
plus a deep-link — and moves Swap to a button on the hub.

### Changed

- `app/layout.tsx` — the Mitr font is now actually loaded (added to the Google
  Fonts `<link>` alongside Montserrat). It was referenced across the codebase
  and in `globals.css`'s `.mitr-*` classes but never loaded anywhere, so every
  `Mitr` heading — including the live poker onboarding modal — was silently
  falling back to a system font. This makes the intended headings real.
- `app/tg/page.tsx` — full visual reskin of the Mini App shell:
  - Navy gradient background, navy cards with cyan hairline borders, Mitr
    headings/numbers, cyan-to-blue gradient buttons with the glow.
  - Link screen rebuilt as a proper onboarding panel (kicker, brutalist
    heading, segmented progress strip), echoing the poker modal.
  - Hub: balances lead, with a "Swap MORBIUS ↔ chips" button beneath them;
    tiles are Arcade, Stats, Profile, plus a "Poker Lobby" tile marked "Soon"
    (that feature lands in a later phase).
  - Removed the standalone Wallet screen and the `'wallet'` view entirely —
    its only unique function, the swap deep-link, now lives on the hub.
  - Stats screen restyled; metric values use the Mitr font.
  - All data-fetching, session/SDK logic and view routing are unchanged — this
    is a presentation-only change.
- `components/telegram/MiniAppVideoPoker.tsx` — reskinned the Video Poker game:
  the green-felt table is now a navy surface with a cyan glow; the paytable,
  hold badges, bet steppers, win banner and win-burst particles are all cyan;
  the Deal button uses the cyan-to-blue glow gradient. Game logic, sound and
  animation timing are untouched.
- `components/telegram/MiniAppProfileEditor.tsx` — reskinned the editor frame
  (header, Randomize button, input fields, Save button) to match. The shared
  `CharacterCreator` component is deliberately left alone so the website's
  avatar editor is unaffected.

### Verification outcome

- All four changed files transpile clean via `ts.transpileModule`:
  `app/layout.tsx`, `app/tg/page.tsx`, `MiniAppVideoPoker.tsx` and
  `MiniAppProfileEditor.tsx`.
- **Not yet done:** live check inside Telegram — needs a deploy / dev server.
  The change is presentation-only (no game logic, data or routing touched), so
  the risk is low.

---

## 2026-05-21 — Avatar editor: compact mode fits without scrolling

**What & why:** In the Mini App profile screen the avatar preview sat inside the
scrollable area, so changing an option pushed the avatar off-screen — you had to
scroll down to pick, then back up to see the result. This pins the preview and
tightens compact mode so the whole editor stays on one screen.

### Changed

- `components/avatar/AvatarControls.tsx` — in compact mode the avatar preview is
  now pinned above the scroll area, so it stays visible while the option cards
  scroll. The compact preview, cycle arrows, category pills and option cards are
  all smaller and tighter. Every change is gated to the `compact` prop, so the
  full-size website editor is untouched.
- `components/avatar/CharacterCreator.tsx` — added a pencil icon and a "Tap to
  set your name" placeholder so the display-name field reads as obviously
  editable. Compact padding and margins tightened.

### Verification outcome

- Both components transpile clean (`ts.transpileModule`).
- **Not yet done:** live check on a phone — needs deploy. The fix is structural
  (the preview can no longer scroll out of view) so it is low-risk.

---

## 2026-05-21 — MORBIUS Arcade: Video Poker (Jacks or Better)

**What & why:** The first game of the MORBIUS Arcade — a provably-fair Jacks or
Better video poker game playable inside the Telegram Mini App. Single-player,
instant, on-brand. It reuses the platform's existing provably-fair deck shuffle
and poker-chip systems rather than inventing new ones.

### Added — backend

- `server/src/services/video-poker.ts` — the Jacks or Better rules: hand
  categories, the 9/6 paytable (one tunable constant sets the house edge),
  payout math, and the hold/draw logic. The 5-card hand strength itself is
  evaluated by the existing `poker-hand-eval` `bestHand()`.
- `server/src/__tests__/video-poker.test.ts` — unit tests for every paytable
  category and the draw logic.
- `server/migrations/125_video_poker.sql` — the `video_poker_hands` table; one
  row per hand, storing the committed deck so every hand stays verifiable.
- `server/src/routes/video-poker.routes.ts` — four endpoints: `GET /paytable`
  (public), `POST /deal` and `POST /draw` (Telegram-`initData` authed), and
  `GET /verify/:handId` (public). The deck is committed at deal; chip moves run
  inside DB transactions; the draw is row-locked and status-checked so a hand
  can never pay out twice.

### Changed — backend

- `poker-chip-wallet.ts` — added `video_poker_bet` / `video_poker_payout`
  chip-ledger reasons.
- `server.ts` — registers the video poker routes.

### Added — frontend

- `components/telegram/MiniAppVideoPoker.tsx` — the polished game screen:
  emerald felt table, 3D card flips, an animated staggered deal, holds that
  lift and glow, a draw animation, a gold win celebration (particle burst +
  banner), and synthesized sound with a mute toggle. Wired to the deal/draw
  endpoints, with a verify-endpoint fallback that recovers the outcome if a
  draw reply is lost.

### Changed — frontend

- `app/tg/page.tsx` — added a "MORBIUS Arcade" tile to the hub that opens
  Video Poker.

### Verification outcome

- The rules engine was verified by transpiling the real code and running 25
  logic checks — every hand category, every payout, the draw, and the input
  guards — all passed. (Jest's dev dependency is absent from the fresh clone,
  so jest itself could not run here; the test file ships for CI.)
- All eight changed/new code files transpile clean (`ts.transpileModule`).
- **Action item:** when this deploys, run the migration once —
  `node server/run-migration.js migrations/125_video_poker.sql`.
- **Not yet done:** live test in Telegram — needs deploy.

---

## 2026-05-21 — Telegram bot: menu button, command menu & new commands

**What & why:** Makes the bot a real front door to MORBIUS. Adds a persistent
Mini App launch button, a proper "/" command menu, and four self-service
commands so players can do things without opening anything.

### Added

- `setTelegramMenuButton()` + `setTelegramCommands()` in `telegram.service.ts`
  — thin Bot API wrappers (`setChatMenuButton`, `setMyCommands`), best-effort
  like the rest of the file. `TelegramButton` now also supports `web_app`
  buttons.
- New bot commands in the webhook handler:
  - `/app` — opens the Mini App. In a private chat it sends a Web App button;
    in a group it points to a DM with the bot.
  - `/balance` — the linked wallet's MORBIUS + poker chip balance (private
    chats only, for privacy).
  - `/stats` — the linked wallet's poker stats (private chats only).
  - `/lobby` — lists tournaments open for registration right now, with a
    button through to the poker lobby. Works in DMs and groups.
- `POST /api/admin/telegram/setup-bot` — one-time admin endpoint that registers
  the command menu and sets the menu button to open the Mini App
  (`PUBLIC_APP_URL` + `/tg`). Mounted under `/api/admin` so it inherits the
  admin guard.

### Changed

- `/help` now lists every command.

### Verification outcome

- Both changed server files transpile clean (`ts.transpileModule`).
- Hand-reviewed: command handlers follow the existing webhook dispatch pattern;
  balance/stats are gated to private chats; all DB reads are wrapped so a
  failure replies gracefully instead of throwing.
- **Action item:** after deploy, call `POST /api/admin/telegram/setup-bot` once
  (with the admin secret) so the menu button and "/" command menu appear.
- **Not yet done:** live test in Telegram — needs deploy.

---

## 2026-05-21 — Telegram Mini App, Phase 3 (Profile + avatar editor)

**What & why:** The last "Soon" tile on the Mini App hub is now live. Players
can edit their avatar, display name, bio and X / Telegram handles from inside
Telegram, using the same `CharacterCreator` editor the website uses.

### Added

- `components/telegram/MiniAppProfileEditor.tsx` — the Profile screen. Loads the
  player's profile from the public `GET /api/player/:address/profile`, embeds
  `CharacterCreator` (compact) for the avatar + display name, adds bio and
  X / Telegram handle fields plus a Randomize button, and saves with
  saving / saved / error states.
- `POST /api/telegram/miniapp/profile` (`telegram.routes.ts`) — a
  Telegram-`initData`-authenticated profile save. Verifies the `initData`,
  resolves the linked wallet, and writes avatar / name / bio / handles through
  `dbService.setDisplayName`. Field handling mirrors the website's
  `POST /api/player/profile` (a blank value leaves the stored value untouched).
  No funds are touched.

### Changed

- `server/src/server.ts` — passes `dbService` into `registerTelegramRoutes`.
- `server/src/routes/telegram.routes.ts` — `RegisterTelegramRoutesOptions` now
  carries `dbService`.
- `app/tg/page.tsx` — added the `profile` view; the hub's Profile tile opens it;
  the Mini App now stores `initData` so the profile save can authenticate.

### Verification outcome

- All four changed files transpile clean (`ts.transpileModule`, no syntax
  errors).
- Lint-reviewed by hand (the fresh clone has no `node_modules`): no unescaped
  JSX entities, no unused imports, hook dependency arrays complete, form labels
  associated with their inputs.
- **Not yet done:** live test in Telegram — needs deploy. `CharacterCreator`
  already runs on the public home page without a connected wallet, so it is
  expected to work in the Telegram context.

---

## 2026-05-21 — Telegram Mini App, Phase 2 (Stats + Wallet screens)

**What & why:** Turns the two "Soon" tiles on the Mini App hub into working
screens, so players can check their poker stats and balances inside Telegram.
Per product decision, the actual MORBIUS ↔ chip swap stays on morbius.io behind
the site's wallet auth — the Mini App shows balances and deep-links out for the
swap itself (no real-value movement happens inside Telegram).

### Changed

- `app/tg/page.tsx` — added a lightweight in-page view router
  (`hub` / `stats` / `wallet`) with back navigation. The hub's Stats and Wallet
  tiles are now buttons; Profile stays "Soon" (Phase 3).
  - **Stats screen** — reads the public `GET /api/poker/player/:address/stats`
    with the linked wallet from the verified session. Cash / Tournaments / All
    scope toggle. Shows hands played, win rate, net profit/loss (color-coded),
    streaks, biggest pot, and the poker HUD (VPIP, PFR, 3-bet, WTSD, W$SD,
    aggression), plus a play-style label. Loading / error / no-hands states.
  - **Wallet screen** — MORBIUS + chip balances and a "Swap on morbius.io"
    button that deep-links to `/poker`. No new money-movement code.

### Verification outcome

- File transpiles clean (`ts.transpileModule`, no syntax errors).
- Lint-reviewed by hand (the fresh clone has no `node_modules` and the sandbox
  can't install) — no unescaped JSX entities, no empty functions, no unused
  imports, hook dependency arrays complete.
- **Not yet done:** live test in Telegram — needs deploy.

---

## 2026-05-21 — Rename "MORBlotto" → "MORBIUS" in user-facing UI strings

**What & why:** The site's real name is MORBIUS. The earlier rename only covered
Telegram text. This pass finishes the job for every string a player can actually
see in the web app. Re-applied in the fresh `morbius.io` clone after the old
working copy's git metadata got tangled.

### Changed

- `app/poker/tournaments/create/page.tsx` — browser tab title
  ("Create Tournament · MORBIUS Poker").
- `app/poker/tournaments/create-mtt/page.tsx` — browser tab title
  ("Create MTT · MORBIUS Poker").
- `contexts/siwe-context.tsx` — the wallet sign-in message a player approves
  ("Sign in to MORBIUS…").
- `components/BLACKJACK/Tournament/TournamentBrowser.tsx` — the "Join … on
  MORBIUS!" tournament share text.
- `components/marketing/TableShowcaseDisplay.tsx` — the displayed URL in the
  marketing mockup (now `morbius.io/blackjack/…`).
- `components/home/games-section.tsx` — "MORBIUS Originals" image alt text.
- `.gitignore` — added `.claude/worktrees/` so local session worktrees are
  never committed or scanned.

### Deliberately NOT changed (would break things or is invisible)

- EIP-712 auth domain `name: 'MORBlotto Blackjack'` in `lib/websocket-client.ts`
  and `server/src/services/websocket.service.impl.js` — changing a signing
  domain invalidates every wallet session/signature. Internal crypto ID, not
  shown to users.
- `localStorage` keys prefixed `morblotto_…` (break reminders, pending deposits,
  first-visit flag, avatar randomize pins, poker rep token, provably-fair client
  seeds) — renaming them silently wipes saved player data. Storage keys, not UI.
- CSS `@keyframes` names (`morblotto-onboard-flash`, `morblotto-rank-sparkle`)
  and code comments / internal docs (README, CLAUDE.md, audit/) — never visible
  to players.

### Verification outcome

- Six targeted string edits; no code identifiers touched. Confirmed each match
  by reading its surrounding lines before editing.
- `git status` confirmed working in the fresh clone (the old working copy's
  worktree metadata was corrupt — see notes below).
- **Deploy note:** this and all Telegram work (The Rail, Mini App) live on
  branch `poker-bust-out-spectator-modal`. `origin/main` (what Railway/Vercel
  deploy) is still at PR #58 — it has none of it. Players will keep seeing
  "MORBlotto" and getting no group notifications until this branch is
  PR-merged to `main`.

---

## 2026-05-21 — Telegram Mini App, Phase 1 (foundation + home hub)

**What & why:** First slice of the MORBIUS Telegram Mini App — an account hub
that opens inside Telegram. Phase 1 lays the foundation: a chrome-free route,
the Telegram WebApp SDK, verified auth, and the home screen. Phases 2–3 (stats,
wallet/swap, profile + avatar editor) build on this.

### Added

- `app/tg/page.tsx` — the Mini App route `/tg`, with no site chrome. Loads
  Telegram's WebApp SDK, sends the signed `initData` to the backend, and renders
  the home hub: avatar + name, MORBIUS + poker-chip balances, and section tiles
  (Profile, Stats, Wallet — marked "Soon", wired up in Phases 2–3). Handles the
  not-linked and opened-outside-Telegram states cleanly.
- `POST /api/telegram/miniapp/session` — verifies a Telegram Mini App `initData`
  payload and returns the player's session (linked wallet, display name,
  MORBIUS + chip balances).
- `verifyTelegramInitData()` in `telegram.service.ts` — Telegram's documented
  HMAC-SHA256 `initData` validation; rejects invalid or stale (>24h) signatures.
  This is the Mini App's trust anchor.

### Changed

- Renamed "MORBlotto" → "MORBIUS" in all Telegram-facing text (bot messages,
  the link UI). Pre-existing non-Telegram occurrences were left untouched.

### Verification outcome

- All changed/new files transpile clean; backend `tsc --noEmit` clean; ESLint
  clean on `app/tg/page.tsx`.
- **Not yet done:** live test — needs the Mini App registered with BotFather.

### Action items for the user

1. Register the Mini App with `@BotFather` — `/newapp`, point it at
   `https://morbius.io/tg` (and/or set it as the bot's Menu Button).
2. Deploy. Opening the Mini App from the bot then loads the hub.

---

## 2026-05-21 — Telegram tournament feed ("The Rail") + player DM alerts

**What & why:** A live Telegram feed of poker tournament activity. When a
tournament is created, the bot posts a formatted card into the group; as players
take seats it edits the card in place and posts join/leave lines; when the table
fills / goes live / finishes it updates again. Alongside it, linked players get
personal DMs for the moments that matter to them.

### How it works

- New `server/src/services/telegram-rail.service.ts` owns all of it. Every
  exported function is best-effort — it catches everything internally and never
  throws. The hooks in `poker-tournament.service.ts` call them fire-and-forget
  (`void railX(...)`), so Telegram can never delay or break gameplay.
- **The Rail (group):** card on create → edited as seats fill → "took a seat" /
  "left" lines → "full" → "live" (with a Spectate button) → winner line. The
  card is one message edited in place via `editMessageText`.
- **DM alerts (linked players):** busted out, results (finished #N, won X),
  tournament cancelled + refunded, and creator alerts (your tournament filled /
  finished).
- Posts to the group only when `TELEGRAM_GROUP_CHAT_ID` is set; DMs only to
  wallets with Telegram linked and notifications enabled. Everything is a silent
  no-op until configured.

### Added

- `server/migrations/124_telegram_tournament_cards.sql` — stores the group card
  message id per tournament so it can be edited in place. (Numbered 124 — 122 is
  duplicated and 123 exists from main's merge.)
- `server/src/services/telegram-rail.service.ts` — the Rail + DM module.
- `/chatid` bot command — returns a chat's id so an admin can wire up the group.
- `TELEGRAM_GROUP_CHAT_ID` env placeholder.

### Changed

- `server/src/services/telegram.service.ts` — added `editTelegramMessage` and
  `getTelegramGroupChatId`; `sendTelegramMessage` now returns the `messageId`.
- `server/src/services/poker-tournament.service.ts` — eight fire-and-forget
  lifecycle hooks (created, joined, left, filled, started, busted, completed,
  cancelled).
- `server/src/routes/telegram.routes.ts` — the `/chatid` command.

### Verification outcome

- All changed files transpile clean; backend `tsc --noEmit` clean for every
  Telegram and poker-tournament file.
- **Not yet done (needs environment access):** migration 124 not applied
  (sandbox has no DB); live Telegram delivery untested.

### Action items for the user

1. Apply the migration: `node server/run-migration.js migrations/124_telegram_tournament_cards.sql`
2. Add the bot to your Telegram group, send it `/chatid`, and set
   `TELEGRAM_GROUP_CHAT_ID` to that value — in `server/.env` and on Railway.
3. Deploy. The Rail goes live once the group id is set.

---

## 2026-05-21 — Telegram alerts moved into the app (settings page removed)

**What & why:** Replaced the standalone `/settings` page with a compact,
reusable "Telegram alerts" control, placed where it's actually useful: the
wallet dropdown menu, the poker page, and the tournament-create success popup.
A buried settings page nobody visits became an in-context control.

### How it works

- New `components/telegram/TelegramAlerts.tsx` — a "smart toggle", because
  Telegram alerts can't be a plain switch:
  - **Not linked** → flipping it on opens the one-time link flow (code → bot).
  - **Linked** → a real on/off switch for notifications + a small Unlink link.
  - Resilient — a failed status check still shows an actionable control (this
    also fixes the empty-panel bug from the old settings page).
  - Two placements: `menu` (wallet-dropdown row) and `panel` (bordered panel).

### Changed

- `components/shared/WalletMenu.tsx` — added the Telegram alerts row to the
  wallet dropdown; the dropdown now stays open while the link modal is up so it
  can't unmount the modal mid-flow.
- `app/poker/page.tsx` — the alerts panel sits above the tournament lobby.
- `components/poker/tournament/PokerTournamentCreator.tsx` — the create-success
  popup now shows the inline alerts panel, replacing the old one-time nudge
  dialog.

### Removed

- `app/settings/page.tsx`, `components/settings/TelegramLink.tsx`,
  `components/settings/TelegramNudgeDialog.tsx` — superseded by the new control.
  (`hooks/useTelegramStatus.ts` and the `/api/telegram` proxy are unchanged.)

### Verification outcome

- All changed files transpile clean; ESLint clean.

---

## 2026-05-20 — Poker lobby shows every tournament

**What & why:** The poker lobby previously hid empty tournaments older than 7
days. By preference it now shows EVERY poker tournament — nothing is pruned by
age, emptiness, or status (cancelled and completed rows are included too). This
also stops slow-filling Sit & Gos from quietly vanishing from the lobby.

### Changed

- `server/src/services/poker-tournament.service.ts` — `listPokerTournaments`
  dropped its staleness `WHERE` filter entirely; the row cap was raised from 50
  to 1000 (a defensive backstop only — never reached on normal traffic).

### Verification outcome

- Transpiles clean; backend `tsc --noEmit` is clean for the changed file.

---

## 2026-05-20 — Fill-based Sit & Go tournaments + unregister-with-refund

**What & why:** Added "Sit & Go" as a second poker tournament start mode,
alongside the existing scheduled (time-based) tournaments. A Sit & Go has no
clock — it starts the moment every seat is taken. Industry-standard behavior:
the trigger is a full table, there is no deadline, and the safety net is that
players can unregister for a full refund any time before it fills.

**Also fixed a real gap found along the way:** MORBIUS-chip buy-ins previously
had NO unregister-with-refund path at all (the code hard-blocked it for anything
that was not a custom-token tournament). Unregister now works for every buy-in
type, on both scheduled tournaments and Sit & Gos.

### How it works

- A new `startMode` (`time` | `fill`) is stored in `poker_config`. Absent =
  `time`, so every existing tournament is unaffected.
- `fill` mode: no `scheduled_start_at` and no `poker_start` event at creation.
  When the final seat is taken, `joinPokerTournament` sets a 60-second countdown
  (`scheduled_start_at = now()+60s`) and schedules a `poker_start` event — the
  exact same scheduler + Telegram path a scheduled tournament uses, so the
  countdown is restart-safe and the "starting soon" pings fire automatically.
- A Sit & Go's seat count is fixed: `minPlayers` is forced equal to `maxPlayers`.

### Changed — backend

- `server/src/services/poker-tournament.service.ts`
  - New `PokerStartMode` type; `startMode` added to `PokerTournamentConfig` and
    `PokerTournamentSummary`; `parsePokerConfig` parses it (defaults to `time`).
  - `createPokerTournament`: `scheduledStartAt` is now optional — required only
    for `time` mode; `fill` mode skips it and the `poker_start` event.
  - `joinPokerTournament`: when a `fill` tournament's last seat is taken, starts
    the 60s countdown via the scheduler instead of dealing instantly.
  - `leavePokerTournamentRegistration`: rewritten to refund all three buy-in
    types — custom-token escrow, MORBIUS chips, and freeroll — and to block
    unregistering once a Sit & Go has filled and locked in.
  - `listPokerTournaments`: exposes `startMode` to the lobby.
- `server/src/services/websocket.service.impl.js` — `handlePokerTournamentCreate`
  no longer requires `scheduledStartAt` for `fill` mode.

### Changed — frontend

- `hooks/use-poker-tournament.ts` — `PokerStartMode` type; `startMode` on the
  config + summary; `scheduledStartAt` made optional on create params.
- `components/poker/tournament/PokerTournamentCreator.tsx` — a "Scheduled /
  Sit & Go" toggle that swaps the date/time picker for a Sit & Go info panel,
  and threads `startMode` into the create params.
- `components/poker/tournament/PokerTournamentLobby.tsx` — the lobby shows
  "Sit & Go · when full" instead of a clock for unfilled fill-mode tournaments,
  and the "Leave" (unregister) button now appears for every buy-in type — hidden
  only once a Sit & Go has filled and is counting down.

### Added — tests

- `server/src/__tests__/poker/tournaments/poker-sng-fill.test.ts` — covers
  fill-mode create, the fill-triggered countdown, the chip refund on unregister,
  and unregister being blocked after a Sit & Go locks in.

### Verification outcome

- All changed TS/TSX files transpile clean; `websocket.service.impl.js` passes
  `node --check`.
- Backend `tsc --noEmit`: clean — no type errors in any changed file.
- ESLint: clean on all changed frontend files.
- **Not yet done (needs environment access):** the new test file could not be
  executed — the poker tests run against a real database and the build sandbox
  has no DB connection. Run `cd server && npm test` to execute them.

### Notes

- No database migration is required — `tournaments.scheduled_start_at` was
  already nullable.
- The Telegram "starting soon" pings (see entry below) work automatically for
  Sit & Gos: when one fills, its 60s countdown is a normal `scheduled_start_at`.

---

## 2026-05-20 — Telegram tournament notifications (opt-in)

**What & why:** Added an opt-in Telegram notification system so poker tournament
players get pinged shortly before their game starts — they can register, walk
away, and come back right before the cards fly instead of waiting at the table.
A single shared Telegram bot serves all users; each player links their Telegram
account to their wallet once, via a one-time code.

**Scope note:** This change is notifications only. It hooks the *existing
time-based* tournament starts (a "starting soon" ping ~60s before the scheduled
start, plus a "final call" ~10-15s before). A separate fill-based start option
was discussed but intentionally left out of scope; the notification fan-out
(`notifyTournamentStarting`) is written generically so it can be reused by a
fill-based start later with no rework.

### Added

- `server/migrations/122_telegram_notifications.sql` — 3 new **isolated** tables
  (`telegram_links`, `telegram_link_codes`, `telegram_tournament_pings`). No
  ALTERs to `players`, `tournaments`, or any core table — fully reversible.
- `server/src/services/telegram.service.ts` — low-level Telegram Bot API client:
  `sendTelegramMessage`, `setTelegramWebhook`, `generateLinkCode`,
  `isTelegramConfigured`, `getPublicAppUrl`, `shortWallet`. Degrades to a silent
  no-op (never throws) when `TELEGRAM_BOT_TOKEN` is unset.
- `server/src/services/telegram-notifications.service.ts` — the "starting soon"
  fan-out: `tickTournamentStartTelegramNotifications` (scheduler-driven) and the
  reusable `notifyTournamentStarting`. Best-effort; per-(tournament,kind) claim
  row prevents duplicate sends; skipped under `NODE_ENV=test`.
- `server/src/routes/telegram.routes.ts` — `POST /api/telegram/webhook`
  (secret-header verified), `POST /api/telegram/link-code`,
  `GET /api/telegram/status`, `POST /api/telegram/preferences`,
  `POST /api/telegram/unlink`, and `POST /api/admin/telegram/setup-webhook`
  (behind the existing `/api/admin` guard).
- `app/api/telegram/[...path]/route.ts` — Next.js proxy for the browser-facing
  endpoints to the Express backend (matches the `/api/cosmetics` proxy pattern).
- `hooks/useTelegramStatus.ts` — frontend hook that reads/refetches link status.
- `components/settings/TelegramLink.tsx` — the Notifications settings panel
  (link button, code modal with 2s status polling, linked state, on/off toggle,
  unlink).
- `components/settings/TelegramNudgeDialog.tsx` — one-time pop-up shown after a
  player creates a poker tournament, suggesting they link Telegram (only if not
  already linked).
- `app/settings/page.tsx` — new `/settings` page hosting the Notifications panel.

### Changed

- `server/src/runtime/app-runtime.ts` — registers the Telegram routes.
- `server/src/services/freeroll-scheduler.service.ts` — its existing ~15s poll
  now also runs the Telegram notification tick (wrapped in try/catch so it can
  never break the poll loop).
- `server/.env` — added 4 blank placeholders: `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_APP_URL`.
- `components/poker/tournament/PokerTournamentCreator.tsx` — renders
  `<TelegramNudgeDialog>` in the post-create success view (2-line change).

### Deviations from the original handoff

- Spec said add columns to a `users` table; there is no `users` table (the table
  is `players`). Used 3 dedicated, isolated tables instead — safer and avoids
  depending on a `players` row existing for every wallet.
- A missing bot token degrades gracefully (no-op) instead of throwing at module
  load, so a Telegram misconfiguration can never stop the server booting.
- Notifications hook time-based starts (the only start mode that exists today),
  not a "fill" event.
- The buy-in figure was deliberately omitted from the message text to avoid
  displaying a wrong number (chip-vs-wei ambiguity); name + player count + CTA
  are shown instead.

### Verification outcome

- All 10 new/modified files transpile clean (TypeScript compiler API).
- Backend `tsc --noEmit`: clean — no errors in any new/changed backend file.
- ESLint: clean on all 5 new frontend files.
- **Not yet done (needs environment access):** migration not applied — the build
  sandbox had no network route to the Neon DB; live Telegram send/webhook test —
  needs a real bot token.

### Action items for the user

1. Apply the migration:
   `node server/run-migration.js migrations/122_telegram_notifications.sql`
2. Fill the 4 Telegram env vars in `server/.env` (and production env).
3. Register the webhook once (after deploy):
   `POST /api/admin/telegram/setup-webhook` (or the BotFather `setWebhook` call).
