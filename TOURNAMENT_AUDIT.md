# Tournament System Audit Report

## Executive Summary

The tournament system is **mostly well-built** with comprehensive on-chain integration, prize distribution, and rebuy mechanics. However, there are **several critical issues** and missing logic that need to be addressed.

---

## ✅ What's Working Correctly

### 1. Tournament Creation Flow
- ✅ On-chain contract creation when `MORBIUS_TOURNAMENT_ADDRESS` is configured
- ✅ Event parsing to extract `tournamentId`
- ✅ Database entry creation with `on_chain_tournament_id`
- ✅ Custom token tournament support (Escrow V3)
- ✅ Fee configuration (creator fee 0-5%, platform fee from env)
- ✅ Validation of tournament parameters

### 2. Tournament Join Flow
- ✅ On-chain join verification for tournaments with `on_chain_tournament_id`
- ✅ Approval + join transaction sequence
- ✅ Database entry creation after on-chain verification
- ✅ `setActive()` call when first player joins
- ✅ PIN code validation for private tournaments
- ✅ Max players check
- ✅ Balance checks (off-chain tournaments)

### 3. Prize Distribution
- ✅ Multiple payout paths (MorbiusTournament, Escrow V3, Escrow V1/V2, DB balance)
- ✅ Fee distribution (platform + creator)
- ✅ Transaction rollback on payout failures
- ✅ `setCompleted()` call after distribution
- ✅ Escrow remainder reclaim

### 4. Rebuy Logic
- ✅ Validation (enabled, max rebuys, busted status)
- ✅ Balance checks
- ✅ Prize pool updates (platform MORBIUS only)
- ✅ Entry state updates (chips, rebuy count, total buy-in)

### 5. Tournament Cancellation
- ✅ Creator-only cancellation
- ✅ Refund logic for buy-ins
- ✅ Escrow cancellation for custom token tournaments
- ✅ Game count check (can't cancel if games played)

---

## 🚨 Critical Issues

### 1. **MISSING: On-Chain Rebuy Support**
**Severity: HIGH**

**Issue:** Rebuys only work for off-chain tournaments. For on-chain tournaments (`on_chain_tournament_id` set), rebuys:
- Deduct from DB balance ✅
- Add to DB prize pool ✅
- **BUT:** Do NOT call `MorbiusTournament.joinTournament()` again
- **Result:** Prize pool mismatch between contract and database

**Location:** `server/src/services/tournament.service.ts:2031` (`processRebuy`)

**Fix Required:**
```typescript
// In processRebuy, after validation:
if (isOnChain && tournament.on_chain_tournament_id != null) {
  // Call MorbiusTournament.joinTournament() again
  // This will transfer MORBIUS and update contract prize pool
  const result = await joinMorbiusTournament(
    tournament.on_chain_tournament_id,
    normalizedAddress,
    tournament.buy_in_amount
  );
  if (!result.success) {
    throw new Error(`On-chain rebuy failed: ${result.error}`);
  }
}
```

**Impact:** On-chain tournaments with rebuys will have incorrect prize pools. Contract holds less than database thinks.

---

### 2. **MISSING: On-Chain Tournament Cancellation**
**Severity: HIGH**

**Issue:** `cancelTournament()` refunds DB balances but does NOT:
- Call `MorbiusTournament.cancelTournament()` on-chain
- Refund players from contract prize pool
- Handle Escrow V3 cancellation (only handles V1/V2)

**Location:** `server/src/services/tournament.service.ts:2534` (`cancelTournament`)

**Fix Required:**
```typescript
// After refunding DB balances:
if (tournament.on_chain_tournament_id != null) {
  // Cancel on-chain tournament
  await cancelMorbiusTournament(tournament.on_chain_tournament_id);
  
  // Refund players from contract (they can call refund() themselves, or server can batch)
  // OR: Add server-side refund loop calling MorbiusTournament.refund()
}
```

**Impact:** On-chain tournaments can't be properly cancelled. Funds stuck in contract.

---

### 3. **MISSING: Escrow V3 Cancellation Support**
**Severity: MEDIUM**

**Issue:** `cancelTournament()` only calls `cancelTournamentInEscrow()` which handles V1/V2. No V3 support.

**Location:** `server/src/services/tournament.service.ts:2602`

**Fix Required:**
```typescript
if (tournament.prize_token_address) {
  if (tournament.on_chain_tournament_id != null) {
    // Use Escrow V3 cancellation
    const { cancelEscrowV3Tournament } = await import('../utils/escrow-payout');
    await cancelEscrowV3Tournament(tournament.on_chain_tournament_id);
  } else {
    // Use V1/V2 cancellation
    const { cancelTournamentInEscrow } = await import('../utils/escrow-payout');
    await cancelTournamentInEscrow(tournamentId);
  }
}
```

---

### 4. **MISSING: Prize Pool Sync for On-Chain Tournaments**
**Severity: MEDIUM**

**Issue:** For on-chain tournaments with platform MORBIUS:
- Buy-ins go to `MorbiusTournament` contract ✅
- Database `prize_pool` is updated for calculation ✅
- **BUT:** Database `prize_pool` is NOT synced with contract `prizePool`
- **Result:** Database may show incorrect prize pool if contract has more/less

**Location:** `server/src/services/tournament.service.ts:1977` (join) and `distributePrizes`

**Fix Required:**
- Option 1: Read contract `prizePool` before distribution and use that
- Option 2: Don't track `prize_pool` in DB for on-chain tournaments, read from contract

**Current Behavior:** Database `prize_pool` is used for calculation, but contract holds actual funds. Mismatch possible.

---

### 5. **MISSING: Validation - On-Chain Tournament Must Have Contract Address**
**Severity: MEDIUM**

**Issue:** If `on_chain_tournament_id` is set but `MORBIUS_TOURNAMENT_ADDRESS` is not configured, system will fail silently or error.

**Location:** Multiple places check `on_chain_tournament_id` but don't verify contract is configured

**Fix Required:** Add validation in `createTournament`:
```typescript
if (params.onChainTournamentId != null) {
  if (!MORBIUS_TOURNAMENT_ADDRESS || MORBIUS_TOURNAMENT_ADDRESS === ZERO_ADDRESS) {
    throw new Error('Cannot create on-chain tournament: MORBIUS_TOURNAMENT_ADDRESS not configured');
  }
}
```

---

### 6. **MISSING: Race Condition Protection - Multiple Joins**
**Severity: LOW-MEDIUM**

**Issue:** Two players joining simultaneously could both pass `entryCount < maxPlayers` check before either creates entry.

**Location:** `server/src/services/tournament.service.ts:1910` (max players check)

**Current Protection:** Database transaction with `FOR UPDATE` would help, but not used here.

**Fix Required:** Use `SELECT ... FOR UPDATE` when checking entry count:
```sql
SELECT COUNT(*) FROM tournament_entries WHERE tournament_id = $1 FOR UPDATE
```

---

### 7. **MISSING: Escrow V3 Creator Reclaim**
**Severity: MEDIUM**

**Issue:** `creatorReclaimFunds()` only handles Escrow V1/V2. No V3 support.

**Location:** `server/src/services/tournament.service.ts:2632`

**Fix Required:** Add V3 support similar to cancellation fix above.

---

## ⚠️ Potential Issues

### 1. **Prize Distribution - Fee Calculation**
**Issue:** Fees are calculated from `totalPool` which includes buy-ins. For on-chain tournaments, this may not match contract `prizePool` if rebuys happened.

**Location:** `server/src/services/tournament.service.ts:969`

**Recommendation:** For on-chain tournaments, read actual contract `prizePool` before calculating fees.

---

### 2. **Rebuy - On-Chain Tournament Entry Count**
**Issue:** Rebuys don't increment contract `entryCount`, but they do increment DB rebuy count. This is actually correct (rebuy != new entry), but worth documenting.

**Status:** ✅ Working as intended

---

### 3. **Tournament Completion - All Players Busted**
**Issue:** `checkAndDistributePrizes()` checks if any players have `status = 'playing'`. If all busted, it distributes. But what if tournament has time limit and ends with all busted? Should check `ends_at` too.

**Location:** `server/src/services/tournament.service.ts:829`

**Current Logic:** ✅ Correct - checks `playing` status, which is fine.

---

### 4. **Custom Token Tournaments - Funding Check**
**Issue:** Join flow checks if escrow is funded (`getEscrowPoolStatus`), but for V3 tournaments, should check `getEscrowV3PoolStatus`.

**Location:** `server/src/services/tournament.service.ts:1892`

**Status:** ✅ Already handled - `getEscrowPoolStatus` likely handles both, but verify.

---

## 📋 Missing Features / Edge Cases

### 1. **Tournament Time Limit Expiration**
**Status:** ✅ Handled - `ends_at` is checked in join and game start

### 2. **Max Hands Reached**
**Status:** ✅ Handled - `completeTournamentEntry()` called when `handsPlayed >= maxHands`

### 3. **Freeroll Tournament Support**
**Status:** ✅ Implemented - Separate flow with phases, registration, etc.

### 4. **Tournament Leaderboard Updates**
**Status:** ✅ Implemented - `tournament_leaderboard` table with triggers

### 5. **Multiple Tournament Entries (Same Player)**
**Status:** ✅ Prevented - Check for existing entry in `joinTournament`

---

## 🔒 Security Considerations

### ✅ Good Practices
- ✅ PIN code validation for private tournaments
- ✅ Creator-only cancellation
- ✅ Transaction rollback on payout failures
- ✅ On-chain verification before DB entry creation
- ✅ Reentrancy guards in contracts

### ⚠️ Potential Concerns
1. **Server Key Security:** `TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY` must be kept secure
2. **Race Conditions:** Multiple joins could exceed `maxPlayers` (see issue #6)
3. **Prize Pool Manipulation:** Database `prize_pool` could be manipulated if not synced with contract

---

## 📊 Data Consistency Issues

### 1. **Prize Pool Sync**
- **On-Chain Tournaments:** Database `prize_pool` may not match contract `prizePool`
- **Impact:** Prize calculations may be incorrect
- **Fix:** Sync from contract before distribution

### 2. **Entry Count Sync**
- **On-Chain Tournaments:** Database entry count should match contract `entryCount`
- **Current:** Not verified
- **Impact:** Low - mainly for display

---

## 🎯 Recommendations

### Priority 1 (Critical)
1. **Add on-chain rebuy support** - Fix rebuy flow for on-chain tournaments
2. **Add on-chain cancellation** - Fix cancellation for on-chain tournaments
3. **Add Escrow V3 cancellation** - Support V3 in cancellation flow

### Priority 2 (High)
4. **Sync prize pool from contract** - Read contract `prizePool` before distribution
5. **Add race condition protection** - Use `FOR UPDATE` in join flow
6. **Add Escrow V3 creator reclaim** - Support V3 in reclaim flow

### Priority 3 (Medium)
7. **Add validation for on-chain tournaments** - Ensure contract address is configured
8. **Add monitoring/logging** - Track prize pool mismatches
9. **Add admin tools** - Manual sync/repair functions

---

## ✅ Summary

**Overall Assessment:** The tournament system is **well-architected** with good separation of concerns and comprehensive features. The main gaps are:

1. **On-chain integration completeness** - Rebuys and cancellation need on-chain support
2. **Escrow V3 support gaps** - Cancellation and reclaim missing V3 paths
3. **Data consistency** - Prize pool sync between contract and database

**Recommendation:** Address Priority 1 issues before production deployment of on-chain tournaments. The system will work for off-chain tournaments, but on-chain tournaments need the fixes above.

---

## 📝 Testing Checklist

- [ ] Create on-chain tournament → Verify contract creation
- [ ] Join on-chain tournament → Verify on-chain join + DB entry
- [ ] Rebuy in on-chain tournament → **CURRENTLY BROKEN** - needs fix
- [ ] Cancel on-chain tournament → **CURRENTLY BROKEN** - needs fix
- [ ] Complete tournament → Verify prize distribution
- [ ] Custom token tournament → Verify escrow funding
- [ ] Escrow V3 tournament → Verify V3 paths work
- [ ] Race condition test → Multiple simultaneous joins
- [ ] Prize pool sync → Verify contract matches database

---

*Audit completed: 2026-02-16*
