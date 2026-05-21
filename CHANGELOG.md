# Changelog

A running log of notable changes to MORBlotto, newest first.
Each entry records what changed, why, and the verification outcome.

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
