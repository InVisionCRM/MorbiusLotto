# SIWE — Overview & Manual

**Purpose:** replace "trust the wallet address in the request body" with "verify a session cookie that proves the wallet signed an EIP-4361 message at sign-in." One pattern, one middleware, every private route protected.

**Why it matters:** every Critical finding in the audit that wasn't on-chain (admin proxy, withdraw, tournament cancel, profile edits, cosmetics, WebSocket impersonation) collapses into one fix once requests carry a verifiable session instead of a self-claimed address.

---

## How it works in one diagram

```
  ┌───────────┐                                ┌────────────┐                    ┌──────────────┐
  │  Frontend │                                │  Backend   │                    │   Postgres   │
  │  (Wagmi)  │                                │  (Express) │                    │              │
  └─────┬─────┘                                └──────┬─────┘                    └──────┬───────┘
        │                                             │                                 │
   1.   │  GET /api/auth/nonce                        │                                 │
        ├────────────────────────────────────────────►│                                 │
        │                                             │  INSERT auth_nonces             │
        │                                             ├────────────────────────────────►│
        │  { nonce }                                  │                                 │
        │◄────────────────────────────────────────────┤                                 │
        │                                             │                                 │
   2.   │  build SIWE message with nonce,             │                                 │
        │  signMessage(...) via wallet                │                                 │
        │                                             │                                 │
   3.   │  POST /api/auth/verify { message, sig }     │                                 │
        ├────────────────────────────────────────────►│                                 │
        │                                             │  verify sig, consume nonce,     │
        │                                             │  INSERT sessions                │
        │                                             ├────────────────────────────────►│
        │  Set-Cookie: morb_session=...               │                                 │
        │◄────────────────────────────────────────────┤                                 │
        │                                             │                                 │
   4.   │  every subsequent request carries cookie    │                                 │
        ├────────────────────────────────────────────►│                                 │
        │                                             │  requireAuth → SELECT sessions  │
        │                                             ├────────────────────────────────►│
        │                                             │  req.user.address set           │
        │  200 OK                                     │                                 │
        │◄────────────────────────────────────────────┤                                 │
```

After step 4, every Express handler can use `req.user.address` as the trusted caller. No more `req.body.address`.

---

## What was added in this PR

Six new files, plus two `package.json` edits. **Nothing is wired into the live server yet** — you turn it on by adding three lines to `server/src/server.ts` (see *Wiring up* below).

| File | What it does |
|---|---|
| [`server/migrations/123_sessions.sql`](../server/migrations/123_sessions.sql) | Creates `auth_nonces` + `sessions` tables |
| [`server/src/services/auth.service.ts`](../server/src/services/auth.service.ts) | `issueNonce`, `verifyAndCreateSession`, `lookupSession`, `revokeSession`, `revokeAllForWallet`, `pruneExpired` |
| [`server/src/middleware/require-auth.ts`](../server/src/middleware/require-auth.ts) | `attachUser`, `requireAuth`, `requireSameAddress` middleware factories |
| [`server/src/routes/auth.routes.ts`](../server/src/routes/auth.routes.ts) | `GET /api/auth/nonce`, `POST /api/auth/verify`, `POST /api/auth/logout`, `GET /api/auth/me` |
| `server/package.json` | Adds `siwe`, `cookie-parser`, `@types/cookie-parser` |

Read order if you want to grok the code: migration → service → middleware → routes.

---

## Turning it on (one-time setup)

### 1. Install the deps

```bash
cd server
npm install
```

This pulls in `siwe@^3`, `cookie-parser@^1.4`, and the types. No other dep changed.

### 2. Run the migration

```bash
# from repo root
node server/run-migration.js migrations/123_sessions.sql
```

You should see `auth_nonces` and `sessions` tables in Neon afterward.

### 3. Set env vars

Add to your Railway server env (or `server/.env` locally):

```
SIWE_EXPECTED_DOMAIN=morbius.io        # must equal the domain the frontend includes in the SIWE message
NODE_ENV=production                    # already set in prod; controls Secure cookie + SameSite=none
```

For local dev, use `SIWE_EXPECTED_DOMAIN=localhost:3000` (or whatever port you run Next on).

### 4. Wire into `server.ts`

These are the only changes to the existing server file. Add them where the comments suggest:

```ts
// At the top with the other imports:
import cookieParser from 'cookie-parser';
import { AuthService } from './services/auth.service';
import { registerAuthRoutes } from './routes/auth.routes';
import { attachUser } from './middleware/require-auth';

// After app.use(cors(...)) and before app.use('/api/', limiter):
app.use(cookieParser());

// Wherever the other services are instantiated (near DatabaseService):
const authService = new AuthService(dbService.pool); // or however the pool is exposed

// Mount the routes alongside the others:
registerAuthRoutes({ app, authService });

// Optional: globally attach req.user on every request (non-blocking).
// Lets read-heavy routes show personalised data without forcing auth.
app.use(attachUser(authService));
```

> Note: `auth.service.ts` takes a `pg.Pool` directly. If `DatabaseService` doesn't expose the pool, either add a getter (`get pool() { return this._pool }`) or pass the pool you already construct in `server.ts`. Same pattern as `MoneyDatabasePort`.

### 5. Restart server, verify

```bash
curl http://localhost:3001/api/auth/nonce
# {"nonce":"<random>","expiresAt":"2026-..."}
```

You're live. **No existing route changed behavior.** The login flow exists but nothing requires it yet.

---

## Using it on a route

This is the punch line — the entire auth refactor turns into a one-liner per route.

### Before (vulnerable)

```ts
// server/src/routes/money.routes.ts
app.post('/api/withdraw', async (req, res) => {
  const { address, amount } = req.body ?? {};   // ← trust whatever the caller sends
  const result = await moneyService.enqueueWithdrawal(address, amount);
  sendJson(res, result);
});
```

### After (safe)

```ts
import { requireAuth } from '../middleware/require-auth';

app.post('/api/withdraw', requireAuth(authService), async (req, res) => {
  const address = req.user!.address;            // ← provably the signed-in wallet
  const { amount } = req.body ?? {};
  const result = await moneyService.enqueueWithdrawal(address, amount);
  sendJson(res, result);
});
```

That's the whole pattern. Two changes per route:

1. Add `requireAuth(authService)` between the path and the handler.
2. Replace `req.body.address` / `req.query.address` / `req.params.address` with `req.user!.address`.

### Routes with an address in the URL

For routes like `POST /api/player/:address/profile` where the address is part of the path, also check it matches the session:

```ts
import { requireAuth, requireSameAddress } from '../middleware/require-auth';

app.post('/api/player/:address/profile',
  requireAuth(authService),
  requireSameAddress(req => req.params.address),
  async (req, res) => {
    const address = req.user!.address;
    ...
  });
```

That closes the "logged in as Alice, sent request for Bob" hole.

### Mixed public + authed routes

For a route that's public but enriches the response when logged in (e.g. a player profile page that hides certain fields from strangers):

```ts
// rely on the global attachUser middleware mounted in server.ts:
app.get('/api/player/:address/profile', async (req, res) => {
  const profile = await dbService.getProfile(req.params.address);
  const viewerIsOwner = req.user?.address.toLowerCase() === req.params.address.toLowerCase();
  sendJson(res, viewerIsOwner ? profile : redactSensitive(profile));
});
```

No `requireAuth`, no 401 — `req.user` is just `undefined` for anonymous callers.

---

## Routes to flip over

In priority order — the highest-impact gaps from the audit first.

### Must-flip (Critical)

| Route | Audit ID | Change |
|---|---|---|
| `POST /api/withdraw` | [BE-001](backend.md) | `requireAuth`; use `req.user.address` |
| `POST /api/tournament/:id/cancel` | [BE-003](backend.md) | `requireAuth`; check creator matches `req.user.address` |
| `POST /api/tournament/:id/reclaim` | [BE-003](backend.md) | same |
| `POST /api/player/:address/profile` | [BE-004](backend.md) | `requireAuth` + `requireSameAddress(req => req.params.address)` |
| `POST /api/cosmetics/gift` | [BE-004](backend.md) | `requireAuth`; sender from session, recipient from body |
| `POST /api/deposit/notify` | [SEC-003](security.md) | `requireAuth`; address from session |
| `POST /api/poker/chips/purchase`, `cashout` | [SEC-003](security.md) | `requireAuth` |
| `POST /api/instantLottery/play` (body-address path) | [BE-009](backend.md) | `requireAuth` |

### Should-flip (High)

The whole admin surface. The audit's recommendation is to bind admin to wallet, not to a shared secret. After SIWE is in:

1. Drop the `x-admin-secret` header pattern (current `process.env.AP` injection).
2. On admin routes (or in a dedicated admin middleware), check `req.user.address` is in `ADMIN_WALLETS` before letting the request through.
3. On the Next.js side, remove the `if (process.env.AP) headers.set('x-admin-secret', process.env.AP)` lines from `app/api/admin/[[...path]]/route.ts` and friends — the cookie travels naturally with `fetch(..., { credentials: 'include' })`.

That single change closes [SEC-001](security.md), [BE-005](backend.md), and [BE-004](backend.md) at once.

### Could-flip (Medium/Low)

Anything that currently reads `req.body.address` / `req.headers['x-admin-wallet']` and trusts it without a signature. Use `grep -rn "req\.body\.\(address\|wallet\)" server/src/routes/` to find them all.

---

## WebSocket integration

The WS layer currently reads `?address=` from the upgrade URL ([BE-002](backend.md)). After SIWE:

In `websocket.service.impl.js` `handleConnection`, replace the "trust query-param" branch with:

```js
// Parse cookies from the upgrade request.
const cookies = parseCookies(req.headers.cookie || '');
const token = cookies['morb_session'];
if (!token) { ws.close(1008, 'no session'); return; }

const session = await authService.lookupSession(token);
if (!session) { ws.close(1008, 'session invalid'); return; }

ws.playerAddress = session.walletAddress;  // checksummed, trusted
ws.isAuthenticated = true;
```

The EIP-712 challenge code path can stay as a fallback for native (non-browser) clients, but the default browser path becomes cookie-based and matches HTTP auth exactly.

> `parseCookies` can be a four-line helper or you can pull in the `cookie` package. Don't reuse `cookieParser()` middleware here — it's Express-only.

---

## Frontend integration

The frontend isn't included in this PR. The flow on the React side will be:

```ts
// pseudocode — concrete hook to come next
import { useAccount, useSignMessage } from 'wagmi';

async function signIn(address: `0x${string}`) {
  // 1. fetch a nonce
  const { nonce } = await fetch('/api/auth/nonce', { credentials: 'include' }).then(r => r.json());

  // 2. build the SIWE message
  const message = new SiweMessage({
    domain: window.location.host,            // must match SIWE_EXPECTED_DOMAIN on server
    address,
    statement: 'Sign in to MORBlotto',
    uri: window.location.origin,
    version: '1',
    chainId: 369,                            // PulseChain
    nonce,
  }).prepareMessage();

  // 3. wallet signs it
  const signature = await signMessageAsync({ message });

  // 4. exchange for a session cookie
  await fetch('/api/auth/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
}
```

Key points:

- `credentials: 'include'` on every fetch (both `/auth/*` calls and every authed API call later).
- Trigger `signIn` when the user clicks a "Sign in" button or auto-trigger on wallet connect — your call. Many dapps prompt the signature *the first time* the user attempts a privileged action; that's better UX than gating the whole site.
- Persist nothing on the client. The cookie is the entire state.
- On logout: `await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })`. RainbowKit's `disconnect()` should call this.

A `hooks/use-siwe.ts` and a tiny `<SiweProvider>` are the natural next step on the frontend.

---

## Rollout plan (recommended order)

1. **Land the foundation.** Migration + files added, deps installed. No behavior change. *(this PR)*
2. **Wire `server.ts`.** Three import lines + `app.use(cookieParser())` + `registerAuthRoutes`. Still no behavior change for clients — `/api/auth/*` now exists but nothing uses it.
3. **Frontend sign-in flow.** Build the SIWE hook + a "Sign in to play" UI. Optionally auto-trigger on wallet connect. Verify `/api/auth/me` returns the expected address.
4. **Flip the highest-risk route first: `/api/withdraw`.** Add `requireAuth`, replace `req.body.address`. Deploy. Manually withdraw to confirm.
5. **Flip the tournament + profile + cosmetics + deposit-notify + poker-chip + instant-lottery routes.** One commit per family is easiest.
6. **Flip the admin surface.** Remove `x-admin-secret` injection from the Next.js proxies; add admin-wallet check in the Express admin middleware. This is the biggest UX change for admin tooling but the highest payoff.
7. **Flip WebSocket auth.** Replace `?address=` trust with cookie lookup. Now `REQUIRE_WS_AUTH=true` becomes redundant (good — remove it after a deployment cycle).
8. **Remove dead paths.** Once every route uses `req.user`, search the codebase for `req.body.address` / `req.query.address` / `req.params.address` and confirm nothing privileged still reads them.

Each step is independently revertible — if step 4 breaks something for users, only `/api/withdraw` is affected and you can re-deploy the previous handler in minutes.

---

## Operational notes

### Cookie scope

- `httpOnly: true` — JS can't read it (defense against XSS reading the token directly).
- `secure: true` in prod — HTTPS only.
- `sameSite: 'none'` in prod — required because the frontend (`morbius.io`) and the backend (Railway URL) are on different origins.
- 7-day expiry on the session; consider shorter for higher-value routes if you want.

### Revocation

To kill all sessions for an address (e.g. user requests "log out everywhere," or you detect compromise):

```ts
await authService.revokeAllForWallet(address);
```

The next request from any of those tokens gets 401.

### Daily prune

Schedule once per day (use `freeroll-scheduler.service.ts` pattern, or a cron service):

```ts
const { noncesDeleted, sessionsDeleted } = await authService.pruneExpired();
logger.info('auth.prune', { noncesDeleted, sessionsDeleted });
```

Keeps the two tables bounded.

### Monitoring

The service emits these logs (search for them in your log pipeline):

- `siwe.session.created` — successful sign-in (info)
- `auth.verify.rejected` — bad signature, expired nonce, wrong domain, etc. (warn)
- `auth.nonce.error` / `auth.logout.error` — server-side failures (error)

A spike in `auth.verify.rejected` from a single IP is the classic "someone's brute-forcing a stolen nonce" signal — wire that into a rate-limit or alert.

### What this does NOT cover

- **Smart-contract RNG.** Separate problem ([SC-001](smart-contracts.md)). SIWE doesn't help here — pausing the contracts is the today-fix.
- **XSS theft of cookies via `fetch`.** httpOnly stops JS from reading the cookie, but a script running on your origin can still send authed requests on the user's behalf. **Fix [FE-008](frontend.md) (the WS chat XSS) in the same push, or sessions will leak in practice.**
- **Per-action confirmation for huge actions.** If you ever want "withdraw above 1M MORBIUS requires a fresh signature even if signed in," that's an extra EIP-712 challenge layered on top of the session. Worth doing once the dust settles.

---

## FAQ

**Why a session table instead of a JWT?**
You can revoke a row in Postgres. You can't revoke a JWT until it expires. For real-money authz, revocation matters when something goes wrong.

**Why not next-auth?**
This codebase is split Next + Express. Next-auth lives on the Next side, but the Express server is where the money flows. Easier to put auth where the data lives, especially with WebSocket sharing the same cookie.

**What if the user has multiple wallets / multiple tabs?**
Each sign-in creates an independent session. Switching wallets in MetaMask = new sign-in = new cookie (overwrites the old one). Multiple tabs share the cookie naturally.

**What stops someone from grabbing a nonce and using it later?**
Nonces are one-time use, expire in 10 minutes, and are tied to the address in the signed message (which the wallet signs). You'd have to also forge the signature, which is the whole point of asymmetric crypto.

**Local dev quirks?**
`sameSite: 'none'` requires HTTPS. In dev (NODE_ENV !== 'production') the cookie uses `sameSite: 'lax'` and `secure: false` so it works on plain http://localhost.
