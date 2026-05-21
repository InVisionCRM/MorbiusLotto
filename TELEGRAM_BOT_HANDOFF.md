# Telegram Bot Notifications — Implementation Handoff

## Context

**Project**: MORBlotto — Web3 casino on PulseChain. Next.js App Router frontend + Express/WebSocket backend + PostgreSQL (Neon).
**Repo root**: `/Users/kyle/MORBlotto`
**Goal**: Add Telegram notifications so poker SNG (Sit-N-Go) players get pinged when their game fills and is about to start, instead of having to sit and wait at the table.

The site has low traffic right now, so we're shifting poker tournaments from "scheduled start time" to "starts when N players have registered." Players need to be able to register and walk away, then come back when notified.

## Stack you'll be touching

- **Backend**: Express server in `server/src/`. Tournament logic lives in `server/src/tournament.service.ts`. Poker game logic in `server/src/poker-game.service.ts`. WebSocket service in `server/src/websocket.service.ts`. DB access via `server/src/database.service.ts` (Neon serverless Postgres).
- **Frontend**: Next.js App Router. Settings/profile UI under `app/`. Shared UI primitives in `components/ui/` (Shadcn/Radix).
- **DB**: PostgreSQL via Neon. Migrations live in `server/migrations/` and run via `node server/run-migration.js migrations/<filename>.sql` from repo root. Loads `.env` from `server/`, uses `DATABASE_URL`. **Always run migrations after creating them — don't leave for the user.**
- **Wallet-based identity**: users are identified by EVM wallet address (PulseChain, chainId 369). There's no email/phone on file.

## Architecture

A single Telegram bot serves all users. Players link their Telegram account to their wallet address once via a one-time code. When an SNG fills, the server fans out a `sendMessage` API call to every registered player who has linked Telegram.

**Two directions of bot traffic**:
1. **Outbound (server → player)**: HTTPS POST to `https://api.telegram.org/bot<TOKEN>/sendMessage`. Used for fill notifications.
2. **Inbound (player → server)**: Telegram POSTs to our webhook when a player messages the bot. Used only for the `/link <code>` and `/unlink` flows.

## Prerequisites (human steps the user has already done or will do)

1. Create the bot via `@BotFather` on Telegram — `/newbot`, name it (e.g. `MORBlottoBot`), receive a token.
2. Add `TELEGRAM_BOT_TOKEN=<token>` to `server/.env` (and to production env).
3. Add `TELEGRAM_WEBHOOK_SECRET=<random-string>` to `server/.env` (used as the `X-Telegram-Bot-Api-Secret-Token` header for webhook auth — see step "Register webhook" below).
4. Add `PUBLIC_APP_URL=https://morblotto.com` (or correct production URL) to `server/.env` — used to build deep links inside Telegram messages.

If the token / env vars are not yet present, stop and ask the user before continuing.

## Tasks

### 1. Database migration

Create `server/migrations/<next-number>_telegram_notifications.sql` (use the next number after the highest existing migration). Schema:

```sql
-- Add Telegram fields to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);

-- One-time link codes
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_wallet ON telegram_link_codes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_expires ON telegram_link_codes(expires_at);
```

**Verify the `users` table column name for wallet address before running** (`wallet_address` is the common convention but check the latest migration or `database.service.ts`). Adjust if different.

Run the migration immediately after creating it:
```bash
node server/run-migration.js migrations/<filename>.sql
```

### 2. Telegram client helper

Create `server/src/telegram.service.ts` with:

- `sendTelegramMessage(chatId: number, text: string, opts?: { buttons?: Array<{ text: string; url: string }>; parseMode?: 'Markdown' | 'HTML' })` — wraps `fetch` to `api.telegram.org/bot<token>/sendMessage`. Handles errors, logs failures, returns `{ ok: boolean }`. If `buttons` provided, build an `inline_keyboard` with one row per button.
- `setTelegramWebhook(url: string, secret: string)` — calls `setWebhook` with `secret_token`. Use this as a one-time setup script you can also expose as `POST /api/telegram/setup-webhook` (admin-only).
- `generateLinkCode(): string` — 6-char uppercase alphanumeric, e.g. `AB12CD`. Avoid ambiguous chars (0/O, 1/I).

Read `TELEGRAM_BOT_TOKEN` from `process.env`. Throw at module load if missing.

### 3. Webhook route

Add to the Express server (wherever routes are registered — likely `server/src/index.ts` or a routes file):

`POST /api/telegram/webhook`:
- Verify `X-Telegram-Bot-Api-Secret-Token` header matches `process.env.TELEGRAM_WEBHOOK_SECRET`. If not, return 401.
- Parse `update.message`. Extract `chat.id`, `from.username`, `text`.
- Route by command:
  - `/start <code>` (deep-link from web UI) and `/link <code>` — both consume the code:
    - Look up `code` in `telegram_link_codes` where `consumed_at IS NULL AND expires_at > now()`.
    - If found: set `users.telegram_chat_id = chat.id`, `telegram_username = from.username`, `telegram_linked_at = now()`. Mark code consumed. Reply: ✅ "Linked to wallet `0xAbCd…1234`. You'll be notified when poker games fill."
    - If not found / expired / already consumed: reply with a clear error and instructions to generate a new code.
  - `/unlink` — clear `telegram_chat_id` for the user matching this `chat.id`. Reply confirming.
  - `/help` or unknown — show available commands.

### 4. Link-flow API endpoints

Add to the Express server:

- `POST /api/telegram/link-code` (authenticated — uses the same wallet-signature auth used elsewhere in the app; check existing patterns in `server/src/`):
  - Generate a code, insert into `telegram_link_codes` with `wallet_address = req.user.wallet_address`, `expires_at = now() + interval '10 minutes'`.
  - Return `{ code, deepLink: "tg://resolve?domain=<BOT_USERNAME>&start=<code>", webLink: "https://t.me/<BOT_USERNAME>?start=<code>", expiresAt }`.
  - Read the bot username from `TELEGRAM_BOT_USERNAME` env var (have the user add this; tell them to use whatever they registered with BotFather, without the `@`).

- `GET /api/telegram/status` (authenticated):
  - Return `{ linked: boolean, username: string | null, linkedAt: string | null, notificationsEnabled: boolean }`.

- `POST /api/telegram/preferences` (authenticated):
  - Body: `{ notificationsEnabled: boolean }`. Update `telegram_notifications_enabled`.

- `POST /api/telegram/unlink` (authenticated):
  - Clear `telegram_chat_id`, `telegram_username`, `telegram_linked_at` for this wallet.

### 5. Hook into SNG fill event

In `server/src/tournament.service.ts` (and/or `poker-game.service.ts` — check where the tournament fill / start-trigger logic lives), find the point where an SNG transitions from "registering" to "starting." This is where you fan out notifications.

Add a helper that:
1. Queries all players registered for the SNG who have `telegram_chat_id IS NOT NULL AND telegram_notifications_enabled = TRUE`.
2. For each, calls `sendTelegramMessage` with the "starting in 60s" message + a "🃏 Take My Seat" button linking to the game URL.
3. Logs success/failure per player. Does **not** fail the SNG start if Telegram delivery fails — best-effort.

Message format (use the in-game currency name **MORBIUS**, never "MRB"):

```
🎰 Your 6-max SNG is filling up!

Buy-in: 1,000 MORBIUS
Seats: 6/6 filled
Starting in 60 seconds.

Tap below to take your seat.
```

Send a second "final call" notification 10 seconds before deal if the player hasn't returned. Skip this in tests (`NODE_ENV=test`) — match the existing pattern used by `setRunoutDelaysForTesting(false)` in poker-game.service.ts.

### 6. Frontend: link UI

Create a "Notifications" section in the user's settings/profile page. The exact path depends on the existing settings page — check `app/` for where account settings live. If no settings page exists yet, add a panel to the existing profile/account area.

UI states (use Shadcn primitives from `components/ui/`):

- **Not linked**: button "Link Telegram." On click, call `POST /api/telegram/link-code`, then show a modal with:
  - The 6-char code in a copyable block.
  - A "Open Telegram" button using the `webLink` from the response.
  - Instructions: "Open Telegram and send this bot the code, or tap the button above."
  - Poll `GET /api/telegram/status` every 2s; close modal on success.
- **Linked**: show username + linked timestamp, a toggle for `notificationsEnabled`, and an "Unlink" button.

Use path alias `@/*` for imports. Keep styling consistent with other settings sections.

### 7. Register the webhook (one-time)

Once deployed, run (or build into a one-time admin script):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<production-domain>/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Or expose this as a protected admin endpoint and document it. The webhook must be HTTPS.

## Gotchas / constraints

- **Bots can only message users who messaged them first.** That's why the `/link` step is mandatory. Don't try to cold-message a `chat_id` you haven't seen inbound.
- **Store the numeric `chat_id`, not the username.** Usernames can change.
- **Wallet popups (Wagmi)**: not relevant to this task, but FYI for other work — never call `writeContractAsync` after an `await`, it loses user-gesture context. We're not touching contracts here.
- **Build flag**: `TSC_COMPILE_ON_ERROR=true` — pre-existing TS errors in unrelated files are normal. Verify your specific changes by transpiling with `ts.transpileModule()`.
- **Currency naming**: use **MORBIUS** in all UI text and messages — never "MRB."
- **Don't add audience-volume stats** (e.g. "X players online") to any UI you build here.

## Testing checklist

- [ ] Migration applies cleanly.
- [ ] `POST /api/telegram/link-code` returns a code that appears in `telegram_link_codes`.
- [ ] Sending `/link <code>` to the bot links the wallet and consumes the code.
- [ ] Sending a stale/used code returns a clear error message.
- [ ] `GET /api/telegram/status` reflects linked state.
- [ ] `/unlink` clears the chat_id and confirms.
- [ ] Toggling `notificationsEnabled` is respected by the SNG fan-out (disabled users don't receive messages).
- [ ] When an SNG fills, all linked + enabled players receive the message with the "Take My Seat" button that deep-links to the game.
- [ ] Failed Telegram delivery does not abort the SNG start.
- [ ] Webhook rejects requests without the correct `X-Telegram-Bot-Api-Secret-Token` header.

## Files you'll likely create or modify

- `server/migrations/<n>_telegram_notifications.sql` *(new)*
- `server/src/telegram.service.ts` *(new)*
- `server/src/routes/telegram.routes.ts` *(new, or add to existing routes file)*
- `server/src/tournament.service.ts` *(modify — hook fill event)*
- `server/src/index.ts` *(modify — register webhook route)*
- `app/<settings-path>/page.tsx` or new `components/Settings/TelegramLink.tsx` *(new)*
- `hooks/useTelegramStatus.ts` *(new, optional — encapsulates the status polling)*

## When you're done

Report:
1. The migration filename and confirmation it was applied.
2. The new API routes and their auth requirements.
3. The exact point in `tournament.service.ts` (or wherever) where the fill event was hooked.
4. Any env vars the user still needs to set in production (Vercel for frontend, wherever the Express server runs for backend).
5. Whether the webhook has been registered (and if not, the exact `curl` command to run).
