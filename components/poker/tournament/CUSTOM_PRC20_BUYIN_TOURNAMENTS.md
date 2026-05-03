# Custom PRC-20 buy-in poker tournaments

Recap of the **custom-token buy-in** Sit & Go flow: players pay a **per-seat ERC-20 / PRC-20** amount into **`TournamentPrizeEscrow`** via **`addToPrizePool`**, the server **verifies** each join transaction, and **cancel / under-min / leave-registration** prefer **push refunds** (`payout` / `payoutMultiple`) while the pool is still **not** cancelled, then **`cancelTournament`** when the escrow is drained.

---

## Product summary

| Aspect | Behavior |
| --- | --- |
| **Create** | Creator picks token metadata + **buy-in per player** (wei string). **No** creator `depositPrizePool` / approve flow at publish — pool starts at **0** and grows as players join. |
| **Join** | Player **approve (exact)** → **`addToPrizePool(bytes32 tournamentId, token, amount)`** → WebSocket **`poker_tournament_join`** with **`joinEscrowTxHash`**. Server parses receipt (event / topic alignment with **`PrizePoolAdded`**) and credits **`tournaments.prize_pool`**. |
| **Fees** | Buy-in &gt; 0 ⇒ existing **3% platform / 2% creator** path in **`distributePrizes`** (not the freeroll 5%/0% redirect). |
| **Cancel / insufficient players** | For **token buy-in** pools: **`payoutMultiple`** refunds then **`cancelTournamentInEscrow`** when liabilities match; **no** `creatorReclaim` for “add-only” pools (**`depositor`** stays zero). |
| **Leave during registration** | **`poker_tournament_leave_registration`**: on-chain payout for that player’s buy-in, then DB removes entry and decrements **`prize_pool`**. |

---

## Why `TournamentPrizeEscrowV5`

- **Baseline:** V4 semantics preserved for **`depositPrizePool`** (freerolls: single depositor, **`creatorReclaim`**).
- **New:** **`addToPrizePool(tournamentId, token, amount)`**  
  - First call for a bytes32: sets **`pool.token`**, **`totalDeposited`**, leaves **`depositor = address(0)`** (never `msg.sender` for multi-funder pools).  
  - Later calls: same token, not cancelled, accumulate **`totalDeposited`**.
- **Rationale:** V4 **`creatorReclaim`** pays the remainder to **`pool.depositor`**. If the first joiner became depositor, they could drain others’ funds after cancel. Buy-in-only tournaments therefore use **only** **`addToPrizePool`** on the product path; freerolls keep **`depositPrizePool`**.

### Cancel vs `setUnclaimedShares`

V4 **`setUnclaimedShares`** requires **`!pool.cancelled`**. The **primary** recovery path is: **refund via `payout` / `payoutMultiple` while active**, then **`cancelTournament`** when **`totalDeposited == amountPaidOut`**. Pull-after-cancel is optional future work (contract relaxation or a dedicated method).

---

## Server implementation

### Source of truth & types

- **`GuaranteedPrizePoolSource`** includes **`custom_token_buyin`**.
- **`CreatePokerTournamentParams`** / WS create: **`guaranteedPrizePoolSource: 'custom_token_buyin'`**, **`customTokenBuyIn`** (address, decimals, symbol, name), **`buyInAmount`** = per-player **wei string**.
- **Schema:** Reuses **`prize_token_*`** columns (no separate “buy-in token” column). **`escrow_tx_hash`** may stay **NULL** at create; **`escrow_tournament_id_bytes32`** (or equivalent derivation) is stored so join/payout always has the bytes32 key.

### Create (`poker-tournament.service.ts`)

- Validates **`custom_token_buyin`** only with **`buy_in > 0`** and metadata sanitization.
- **`initialPrizePool`** / DB **`prize_pool`** starts at **0**; **no** chip debit for the buy-in itself at create.

### Join

- Optional **`joinEscrowTxHash`** on **`joinPokerTournament`**.
- **`verifyEscrowAddToPrizePoolJoinTx`** (`server/src/utils/escrow-join-verify.ts`): receipt logs, correct escrow address, tournament id, token, amount **exact** match to **`buy_in_amount`**, contributor = player tx **`from`**.
- **Idempotency:** **`tournament_entries.escrow_join_tx_hash`** + partial unique index (migration **`114_tournament_entry_escrow_join_tx.sql`**).
- On “full table” / rollback after verified deposit: server pushes refund (**`refundEscrowAfterRollback`** / **`sendEscrowPayout`**) so funds are not stranded.

### Cancel / scheduled under-min

- Token buy-in (`prize_token_address` + **`buy_in > 0`**): **`sendEscrowPayoutMultiple`** per registered player for buy-in amount, then **`cancelTournamentInEscrow`**; skip on-chain work if pool never initialized (token zero).

### Leave registration

- **`leavePokerTournamentRegistration`**: payout buy-in on-chain first, then DB transaction; broadcast **`poker_tournament_registration_left`** (or named equivalent in message-types).

### `distributePrizes` (`tournament.service.ts`) 

- When **`prize_token_address`** is set: **`getEscrowPoolStatus`** — sync **`actualPrizePool`** (and DB alignment) from **`totalDeposited - amountPaidOut`** before prize fee math, reducing RPC vs DB drift.

### Escrow address resolution

- **`getTournamentPrizeEscrowAddress()`** (`server/src/utils/tournament-escrow-address.ts`): **`TOURNAMENT_PRIZE_ESCROW_ADDRESS`** / **`NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS`**, else documented default. Used by payout/status/oversight helpers instead of hardcoded addresses.

---

## WebSocket

| Direction | Message | Notes |
| --- | --- | --- |
| Client → server | **`poker_tournament_create`** | Payload includes **`guaranteedPrizePoolSource`**, **`customTokenBuyIn`** when applicable. |
| Client → server | **`poker_tournament_join`** | Optional **`joinEscrowTxHash`**. |
| Client → server | **`poker_tournament_leave_registration`** | Registration-only leave + refund path. |
| Server → client | **`poker_tournament_*`** broadcasts | Include registration-left where implemented. |

Types/constants stay aligned between **`server/src/services/websocket/message-types.ts`** and **`lib/websocket-message-types.ts`** (and **`lib/websocket-client.ts`** request shapes where typed).

---

## Frontend implementation

### Creator (`PokerTournamentCreator.tsx`)

- **Fourth funding branch** under buy-in: **Buy-in currency** = **Poker chips** vs **Custom PRC-20**.
- Custom path: **`Prc20TokenPicker`** + human **buy-in per player** → wei via **`parseUnits`**; **`Review & create`** uses normal **`handleCreate`** (no two-step escrow at publish).
- **`buildCreateParams`** sets **`custom_token_buyin`**, **`customTokenBuyIn`**, **`buyInAmount`** as token wei string.

### Lobby (`PokerTournamentLobby.tsx`)

- **`isCustomTokenBuyIn`:** non-zero **`buyInAmount`** + **`prizeTokenAddress`**.
- **`formatBuyInCell`:** token human amount + symbol/name label helpers (same spirit as freeroll prize display).
- **Join:** Non-private → **`escrow_pay`** overlay; private → PIN → **`escrow_pay`** if token buy-in.
- **`EscrowBuyInJoinPanel`:** approve if needed → **`addToPrizePool`** → pass hash to **`joinTournament`**.
- **Retry:** If deposit succeeds but WS join fails, **`joinTournament`** **throws** (see hook); UI keeps tx hash in a ref and offers **“Retry registration (same deposit)”** (idempotent server-side on same hash).
- **Leave:** **`leaveTournamentRegistration`** for registered + **registration** + token buy-in.

### Hook (`hooks/use-poker-tournament.ts`)

- **`joinTournament(..., joinEscrowTxHash?)`** forwards **`joinEscrowTxHash`**.
- **`leaveTournamentRegistration`** exposed on the hook return.
- **Join errors:** **`catch`** sets **`error`** and **rethrows** so callers can show banners / retry UX (wallet gesture rules unchanged: no **`writeContractAsync`** immediately after **`await waitForTransactionReceipt`** in one click — panel keeps approve + deposit as separate steps inside **`EscrowBuyInJoinPanel`**).

---

## ABI / contracts repo

- Shared ABI artifact extended with **`addToPrizePool`** and **`PrizePoolAdded`** in both **`abi/tournament-prize-escrow-v2.ts`** and **`server/src/abi/tournament-prize-escrow-v2.ts`** (dual-location pattern).
- **`contracts/contracts/TournamentPrizeEscrowV5.sol`**, tests, deploy script under **`contracts/scripts/tournament/deploy/`**.
- **`lib/contracts.ts`**: **`TOURNAMENT_PRIZE_ESCROW_ADDRESS`** resolves from env with V5 default documented in **`ALL_DEPLOYMENTS.MD`**.

---

## Coding choices (intentional)

1. **`depositor` never set from `addToPrizePool`** — security invariant for multi-player refunds vs **`creatorReclaim`**.
2. **Refund-before-cancel** — respects **`setUnclaimedShares`** / cancelled flag semantics without a contract fork for pull-only refunds.
3. **Reuse `prize_token_*` for “funding = payout token”** — avoids duplicate columns and keeps **`calculate_tournament_prizes`** and lobby formatting unified.
4. **BigInt / string at boundaries** — buy-in wei as **string** in API/WS; **`BigInt`** only in TS verification and formatting (consistent with repo money rules).
5. **Join throws on failure** — lobby `try/catch` and chip-vs-token insufficient handling stay explicit; token buy-ins do not open the “poker chips” insufficient dialog.
6. **Separate doc from main README** — `README.md` stays the broad audit; this file is the **feature deep-dive** for escrow buy-ins.

---

## Operations checklist

- Deploy **V5** to PulseChain and set **`TOURNAMENT_PRIZE_ESCROW_ADDRESS`** (server) and **`NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS`** (frontend) to the live address. Until then, **`addToPrizePool`** must exist on the configured escrow or joins will revert client-side.
- Run migration **`114`** (and any predecessors) on environments that need **`escrow_join_tx_hash`**.
- **`TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY`** (or existing server wallet env) remains the authorized signer for **`payout`** / **`payoutMultiple`** / cancel orchestration.

---

## Related files (index)

| Layer | Files |
| --- | --- |
| Contract | `contracts/contracts/TournamentPrizeEscrowV5.sol`, `contracts/test/TournamentPrizeEscrowV5.test.js`, deploy script under `contracts/scripts/tournament/deploy/` |
| Server service | `server/src/services/poker-tournament.service.ts`, `server/src/services/tournament.service.ts` (`distributePrizes`) |
| Join verify | `server/src/utils/escrow-join-verify.ts` |
| Escrow address | `server/src/utils/tournament-escrow-address.ts`, `server/src/utils/escrow-payout.ts`, `escrow-status.ts`, `escrow-oversight.ts` |
| Migration | `server/migrations/114_tournament_entry_escrow_join_tx.sql` |
| WS | `server/src/services/websocket.service.impl.js`, `server/src/services/websocket/poker-router.ts`, `lib/websocket-message-types.ts` |
| Client | `hooks/use-poker-tournament.ts`, `components/poker/tournament/PokerTournamentCreator.tsx`, `PokerTournamentLobby.tsx`, `EscrowBuyInJoinPanel.tsx` |
| Addresses | `lib/contracts.ts`, `ALL_DEPLOYMENTS.MD` |

---

## See also

- [`README.md`](./README.md) — overall poker tournament modes and lifecycle (update that doc’s escrow bullet if it still says escrow is unwired).
