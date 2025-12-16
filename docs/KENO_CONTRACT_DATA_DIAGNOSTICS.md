# Keno Contract Data Diagnostics & Fix

## Issues Reported

1. **Timer showing 336:21** - Should only show up to 15 minutes (15:00 max)
2. **Round #25 displayed** - Game hasn't been running long enough to have 25 rounds

## Root Cause Analysis

The symptoms indicate that the **CryptoKeno contract is returning uninitialized or incorrect data**:

### Possible Causes:

1. **Contract Not Initialized**
   - The contract may have been deployed but the first round hasn't been started
   - `currentRoundId` might be returning a default value
   - Round data (startTime, endTime) might be 0 or garbage values

2. **Timestamp Format Issues**
   - Contract might be returning timestamps in seconds (expected) but UI interprets as milliseconds
   - Or vice versa - contract returns milliseconds when seconds expected

3. **Contract State Issue**
   - Round may have been created but not properly started
   - Admin/owner may need to call an initialization function
   - Round system may need manual triggering

4. **Test Data Left in Contract**
   - Contract deployed with test values (Round 25, old timestamps)
   - Production deployment used test contract state

## Diagnostic Tools Added

### 1. Console Logging (app/keno/page.tsx:209-218)

Added comprehensive logging to see exactly what the contract returns:

```typescript
console.log('Round Data:', {
  id: roundData.id?.toString(),
  startTime: roundData.startTime,
  endTime: roundData.endTime,
  state: roundData.state,
  startTimeMs: Number(roundData.startTime) * 1000,
  endTimeMs: Number(roundData.endTime) * 1000,
  currentTimeMs: Date.now(),
  diff: (Number(roundData.endTime) * 1000) - Date.now(),
})
```

**Check browser console for:**
- What round ID is actually returned
- What timestamps are returned (raw values)
- What the time difference calculation produces

### 2. Round ID Logging (app/keno/page.tsx:196-198)

```typescript
console.log('Current Round ID from contract:', currentRoundIdData?.toString())
```

**This shows:**
- The actual round ID from the contract
- Whether it's 1, 25, or something else

### 3. Data Validation (app/keno/page.tsx:220-253)

Added checks to prevent displaying obviously wrong data:

```typescript
// Reject if endTime is 0
if (endMs === 0) {
  console.warn('Round endTime is 0 - round may not be initialized')
  setNextDrawTime(null)
  return
}

// Reject if endTime is more than 24 hours in future
if (diff > 24 * 60 * 60 * 1000) {
  console.warn('Round endTime is more than 24 hours in future')
  setNextDrawTime(null)
  return
}

// Reject if endTime is more than 1 hour in past
if (diff < -60 * 60 * 1000) {
  console.warn('Round endTime is more than 1 hour in the past')
  setNextDrawTime(null)
  return
}
```

**Result:**
- Invalid data will show `--:--` instead of wrong countdown
- Console warnings explain why data was rejected

### 4. User Warning Banner (app/keno/page.tsx:847-860)

Shows a visible warning when data is suspicious:

```
⚠️ Contract Data May Be Invalid

The contract is returning unusual timestamp data. The game may not
be properly initialized yet, or there may be a contract issue.
```

**Triggers when:**
- Timer would show more than 1 hour
- Timer is more than 1 hour in the past
- Other obvious data problems

## How to Diagnose

### Step 1: Open Browser Console
1. Open the Keno page
2. Press F12 (or right-click → Inspect → Console)
3. Look for the log messages

### Step 2: Check Round ID
Look for: `Current Round ID from contract: <number>`

**Expected:** 1 or 2 (if game just started)
**Actual:** If showing 25, contract has stale data

### Step 3: Check Round Data
Look for the `Round Data:` log with full details

**Example of GOOD data:**
```javascript
Round Data: {
  id: "1",
  startTime: 1733356800,      // Recent Unix timestamp
  endTime: 1733357700,        // 15 minutes after start
  state: 1,                   // Active state
  startTimeMs: 1733356800000,
  endTimeMs: 1733357700000,
  currentTimeMs: 1733357000000,
  diff: 700000                // ~11 minutes remaining
}
```

**Example of BAD data:**
```javascript
Round Data: {
  id: "25",
  startTime: 0,               // Uninitialized!
  endTime: 0,                 // Uninitialized!
  state: 0,
  startTimeMs: 0,
  endTimeMs: 0,
  currentTimeMs: 1733357000000,
  diff: -1733357000000        // Huge negative number
}
```

OR

```javascript
Round Data: {
  id: "25",
  startTime: 1700000000,      // Old timestamp (weeks/months ago)
  endTime: 1700000900,
  state: 2,                   // Finalized state
  diff: -33357000000          // Hours/days in the past
}
```

## Likely Fixes Needed

Based on the console output, you'll need to:

### If startTime/endTime are 0:
**Contract needs initialization.**

The contract owner/admin needs to call a function like:
- `startFirstRound()`
- `initializeRound()`
- `createRound()`

Check the contract for admin functions.

### If Round ID is 25 with old timestamps:
**Contract deployed with test state.**

Options:
1. **Redeploy contract** from scratch (cleanest)
2. **Call admin function** to reset to Round 1
3. **Call finalize** on old rounds and start fresh round

### If timestamps are wrong format:
**Check contract implementation.**

- Contract should return timestamps in **seconds** (Unix timestamp)
- UI multiplies by 1000 to get milliseconds
- If contract returns milliseconds, UI will show wildly wrong times

## Files Modified

1. **`/morbius_lotto/app/keno/page.tsx`**
   - Lines 196-198: Round ID logging
   - Lines 209-253: Round data logging and validation
   - Lines 826-833: Contract data validity check
   - Lines 847-860: Warning banner for invalid data

## Next Steps

1. **Check the console logs** to see what data the contract returns
2. **Share the console output** so we can diagnose the exact issue
3. **Check contract on block explorer** to see its state
4. **Verify contract functions** - look for initialization or round management functions
5. **Contact contract admin** if reinitialization is needed

## Prevention for Future

Once the contract is working correctly:

- ✅ Validation prevents showing wrong data to users
- ✅ Console logs make debugging instant
- ✅ Warning banner alerts users to issues
- ✅ Fallback to `--:--` instead of wrong countdown

The UI is now **defensive** - it won't show crazy data even if the contract misbehaves.
