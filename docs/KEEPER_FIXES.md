# Keno Keeper Bot - Issues & Fixes

## Critical Issues Found in Original Keeper

### 1. **VRF Provider Blocking** ⚠️
**Problem:** If `randomnessProvider` is set to a non-zero address in the contract, `finalizeRound()` will ALWAYS revert with `RandomnessNotReady()` at line 477 of CryptoKeno.sol.

**Impact:** Keeper gets stuck in infinite loop, never able to finalize rounds.

**Fix:** Ensure `randomnessProvider` is `address(0)` in contract deployment/configuration.

---

### 2. **Unnecessary Lookahead Logic**
**Problem:** Lines 92-109 try to create future rounds that may already exist, causing failed transactions.

**Impact:** Wasted gas, confusing error logs, potential race conditions.

**Fix:** Removed lookahead. Contract auto-creates rounds via `_ensureOpenRound()` when users buy tickets.

---

### 3. **Double startNextRound() Calls**
**Problem:** Two separate code paths call `startNextRound()`:
- Lines 67-73: After finalizing
- Lines 74-84: When round already finalized

**Impact:** Second call will revert, wasting gas and creating error noise.

**Fix:** Single, cleaner logic path with proper error handling.

---

### 4. **No Owner Verification**
**Problem:** `startNextRound()` has `onlyOwner` modifier but keeper doesn't verify wallet is owner.

**Impact:** All `startNextRound()` calls fail if keeper isn't owner.

**Fix:** Added ownership check at startup with clear warning.

---

### 5. **Poor Error Handling**
**Problem:** Generic catch-all error handling makes debugging difficult.

**Impact:** Can't distinguish between expected errors (already finalized) vs critical errors (contract misconfigured).

**Fix:** Specific error handling for each revert reason.

---

### 6. **No Circuit Breaker**
**Problem:** If contract has a persistent issue, keeper runs forever burning gas.

**Impact:** Wasted gas, no alert that something is wrong.

**Fix:** Consecutive error counter with automatic shutdown after 10 failures.

---

## Key Improvements in Fixed Version

### ✅ Cleaner Logic Flow
```javascript
1. Check if paused → skip
2. Get current round state
3. If expired & not finalized → finalize
4. If START_NEXT enabled → start next round
5. Handle errors gracefully
```

### ✅ Better Logging
- Clear status for each check
- Timestamps
- Color-coded emojis for visibility
- Time remaining/expired indicators

### ✅ Ownership Verification
- Checks if keeper wallet is owner at startup
- Warns if `START_NEXT=true` but not owner
- Prevents confusion about why calls fail

### ✅ Pause Detection
- Checks if contract is paused
- Skips operations when paused
- Prevents wasted transactions

### ✅ Smart Error Handling
- Differentiates between:
  - Expected errors (already finalized, already started)
  - Critical errors (RandomnessNotReady, owner check failed)
- Only increments error counter for unexpected errors

### ✅ Circuit Breaker
- Stops after 10 consecutive errors
- Prevents infinite gas burning
- Alerts you that manual intervention needed

---

## Configuration Guide

### Required `.env` Variables
```bash
PRIVATE_KEY=0x...                    # Keeper wallet (must be owner if START_NEXT=true)
KENO_ADDRESS=0x23B3eD54A120...      # Your deployed Keno contract
```

### Optional `.env` Variables
```bash
PULSECHAIN_RPC=https://rpc.pulsechain.com   # Default RPC
KEEPER_POLL_MS=15000                         # Check interval (15s default)
KEEPER_START_NEXT=true                       # Auto-start next round (requires owner)
KEEPER_GAS_LIMIT=2000000                     # Gas limit per tx
```

---

## Usage

### Start the Fixed Keeper
```bash
node scripts/keno-keeper-fixed.js
```

### Expected Output (Normal Operation)
```
🤖 Keno Keeper Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Keeper Address: 0x...
Contract: 0x23B3eD54A1208077a3789640A366Bf1F17876ec6
Poll Interval: 15000ms
Auto-start Next: true
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Keeper wallet is contract owner

[2025-01-15T10:30:00Z] Round 5 | OPEN | 120s remaining
   ⏳ Round still active, waiting...

[2025-01-15T10:30:15Z] Round 5 | OPEN | 105s remaining
   ⏳ Round still active, waiting...

[2025-01-15T10:32:00Z] Round 5 | OPEN | expired 5s ago
🎲 Finalizing round 5...
   📝 Tx: 0xabc123...
   ✅ Finalized in block 12345678
🚀 Starting next round...
   📝 Tx: 0xdef456...
   ✅ Started next round in block 12345679
```

---

## Troubleshooting

### ❌ "RandomnessNotReady" Error
**Cause:** Contract has `randomnessProvider` set to non-zero address.

**Fix:** Deploy contract with `randomnessProvider = address(0)` OR update contract to set it to zero.

---

### ⚠️ "Keeper wallet is NOT owner"
**Cause:** `KEEPER_START_NEXT=true` but wallet isn't contract owner.

**Options:**
1. Use owner wallet as keeper
2. Set `KEEPER_START_NEXT=false` (rounds will start when users buy tickets)
3. Transfer ownership to keeper wallet

---

### 💥 "Too many consecutive errors"
**Cause:** Persistent issue with contract or configuration.

**Fix:** Check contract state manually, verify configuration, check if paused.

---

## PulseChain Specific Notes

- **No oracles/VRF:** Contract uses blockhash or commit-reveal for randomness
- **Fast blocks:** PulseChain has ~10s blocks, keeper polls every 15s by default
- **Low gas costs:** PulseChain gas is cheap, so frequent polling is acceptable
- **RPC reliability:** Use a reliable RPC endpoint (default: https://rpc.pulsechain.com)

---

## Recommended Settings for Production

```bash
# Conservative polling (less RPC load)
KEEPER_POLL_MS=30000

# Higher gas limit for safety
KEEPER_GAS_LIMIT=3000000

# Auto-start for best UX
KEEPER_START_NEXT=true

# Use owner wallet
PRIVATE_KEY=<owner_wallet_private_key>
```

---

## Testing Checklist

- [ ] Keeper can finalize expired rounds
- [ ] Keeper starts next round automatically (if START_NEXT=true)
- [ ] Keeper handles already-finalized rounds gracefully
- [ ] Keeper detects when contract is paused
- [ ] Keeper warns if not owner (when START_NEXT=true)
- [ ] Keeper shuts down after persistent errors
- [ ] Logs are clear and actionable

---

## Migration from Old Keeper

1. Stop the old keeper: `Ctrl+C` or `kill <pid>`
2. Update `.env` with any new variables
3. Start new keeper: `node scripts/keno-keeper-fixed.js`
4. Monitor logs for first few rounds
5. Verify rounds are finalizing correctly

**No contract changes needed** - the fixed keeper works with your existing contract.
