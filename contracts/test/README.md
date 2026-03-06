# Hot-wallet flow test scripts

Runnable scripts to test the hot-wallet withdrawal queue and deposit confirmation flow against a running Blackjack server.

**Prerequisites**

- Server running with hot-wallet enabled (`HOT_WALLET_PRIVATE_KEY` set in `server/.env`).
- Database migrations applied: `050_hot_withdrawal_jobs.sql`, `051_pending_deposits.sql`.
- For withdraw: the given wallet must have sufficient **off-chain (DB) balance** (e.g. from prior deposit or gameplay).

**Environment**

- `BLACKJACK_SERVER_URL` – Base URL of the Blackjack server (default: `http://localhost:3001`).

**Scripts**

| Script | Purpose |
|--------|---------|
| `hot-wallet-withdraw-test.js` | Enqueue a withdrawal, poll until completed/failed. |
| `hot-wallet-deposit-notify-test.js` | Notify server of a deposit (tx hash + amount); balance credited after confirmations. |
| `hot-wallet-status-test.js` | Fetch status of a single withdrawal job by ID. |

**Run from repo root**

```bash
export BLACKJACK_SERVER_URL=http://localhost:3001

# Withdraw 10 MORBIUS to the given address (must have DB balance)
node contracts/test/hot-wallet-withdraw-test.js 0xYourAddress 10

# Notify a deposit (amount in wei; 1 MORBIUS = 1000000000000000000)
node contracts/test/hot-wallet-deposit-notify-test.js 0xYourAddress 0xTxHashHex 1000000000000000000

# Check status of a job
node contracts/test/hot-wallet-status-test.js <jobId>
```
