# Keno Multi-Draw Ticket Fix

## Issue

When a user buys a ticket with **multiple consecutive draws** (e.g., 5 draws), the UI incorrectly shows:
- Round #38 (future round)
- Timer showing hours instead of minutes
- "Scheduled Round" banner

**Example:**
- User buys ticket for 5 draws starting at Round #34
- Contract creates Rounds 34, 35, 36, 37, 38
- Contract sets `currentRoundId = 38` (last round)
- UI shows Round #38 which starts in 1 hour (wrong!)

## Root Cause

### Contract Behavior
The CryptoKeno contract's `_ensureFutureRounds()` function:

```solidity
function _ensureFutureRounds(uint256 startingRoundId, uint8 draws) internal {
    // Creates rounds: startingRoundId, startingRoundId+1, ..., startingRoundId+draws-1
    // Then sets: currentRoundId = startingRoundId + draws - 1
}
```

**When you buy a 5-draw ticket starting at Round 34:**
1. Creates Rounds 34, 35, 36, 37, 38
2. Sets `currentRoundId = 38`
3. Each round is 15 minutes apart
4. Round 38 starts 60 minutes from now (4 × 15 minutes)

### UI Problem
The UI was simply using `currentRoundId` from the contract, assuming it represents the **active** round. But `currentRoundId` is actually the **latest created round**, not the currently active one.

## The Solution

### Smart Active Round Detection

Instead of blindly using `currentRoundId`, the UI now:

1. **Queries multiple rounds** (last 10 rounds for efficiency)
2. **Checks timestamps** to find which round is actually active NOW
3. **Uses the active round** for display and timer

```typescript
// Check if round is currently active
if (startTime <= now && now < endTime) {
  // This is the active round!
  setActualActiveRoundId(rid)
}
```

### Benefits

✅ **Shows correct active round** - Round #34 when that's active, not #38
✅ **Correct timer** - Shows ~15:00 for active round, not 60+ minutes
✅ **Auto-updates** - Rechecks every 30 seconds to catch round transitions
✅ **Efficient** - Only checks last 10 rounds, not all from 1 to N

## How It Works Now

### Scenario: User Buys 5-Draw Ticket

**Contract State:**
- `currentRoundId = 38` (last round created)
- Round 34: Active NOW (ends in 12 min)
- Round 35: Starts in 12 min (ends in 27 min)
- Round 36: Starts in 27 min (ends in 42 min)
- Round 37: Starts in 42 min (ends in 57 min)
- Round 38: Starts in 57 min (ends in 72 min)

**UI Behavior:**
1. Reads `currentRoundId = 38`
2. Searches rounds 28-38 (last 10)
3. Checks Round 34: `startTime <= now < endTime` ✅
4. Uses Round 34 for display
5. Shows: "Round #34" with "~12:00" timer
6. No warning banner (round is active)

**After Round 34 Ends:**
1. Auto-rechecks (30s interval)
2. Round 34: `now >= endTime` ❌
3. Checks Round 35: `startTime <= now < endTime` ✅
4. Updates to Round 35
5. Timer resets to ~15:00

## Implementation Details

### File Modified
`/morbius_lotto/app/keno/page.tsx`

### Key Changes

**1. State for Active Round (Line 195)**
```typescript
const [actualActiveRoundId, setActualActiveRoundId] = useState<number>(1)
```

**2. Active Round Finder (Lines 204-255)**
```typescript
useEffect(() => {
  const findActiveRound = async () => {
    // Search last 10 rounds
    for (let rid = startSearch; rid <= maxRoundId; rid++) {
      const roundData = await publicClient.readContract(...)

      // Check if active
      if (start <= now && now < end) {
        setActualActiveRoundId(rid)
        return
      }
    }
  }

  findActiveRound()

  // Re-check every 30 seconds
  const interval = setInterval(findActiveRound, 30000)
  return () => clearInterval(interval)
}, [currentRoundIdData, publicClient])
```

**3. Use Actual Active Round (Line 257)**
```typescript
const activeRoundId = actualActiveRoundId
```

This replaces the old:
```typescript
const activeRoundId = currentRoundIdData ? Number(currentRoundIdData) : 1
```

### Performance Impact

- **Initial load:** 1-10 contract reads (depending on how many rounds to check)
- **Updates:** Every 30 seconds
- **Efficient:** Only checks recent rounds, not all rounds since Round 1

## Testing

### Test Case 1: Single Draw Ticket
- Buy ticket for 1 draw
- Contract sets `currentRoundId = 34`
- UI finds Round 34 is active
- Shows: "Round #34" with ~15:00 timer ✅

### Test Case 2: Multi-Draw Ticket
- Buy ticket for 5 draws starting at Round 34
- Contract sets `currentRoundId = 38`
- UI searches 28-38, finds Round 34 is active
- Shows: "Round #34" with ~12:00 timer ✅
- After Round 34 ends, auto-updates to Round 35 ✅

### Test Case 3: Round Transition
- Active round ends
- 30s later, UI rechecks
- Finds next round is now active
- Updates display automatically ✅

## User Experience

### Before Fix:
❌ Round #38 displayed (confusing!)
❌ Timer shows 60+ minutes (scary!)
❌ "Scheduled Round" warning (misleading!)
❌ Users think game is broken

### After Fix:
✅ Round #34 displayed (correct!)
✅ Timer shows ~12:00 (accurate!)
✅ No warning banner (clean!)
✅ Auto-updates to next round (smooth!)

## Edge Cases Handled

1. **No active round:** Falls back to `currentRoundId`
2. **Round just ended:** Finds next round that's starting
3. **All rounds in future:** Shows earliest future round
4. **Contract read errors:** Logs error, continues checking
5. **Network issues:** Retry via 30s interval

## Future Improvements

Potential contract-level fix:
```solidity
// Add a new function to the contract
function getActiveRoundId() external view returns (uint256) {
    uint256 now = block.timestamp;

    // Search backwards from currentRoundId to find active round
    for (uint256 i = currentRoundId; i >= 1; i--) {
        if (rounds[i].startTime <= now && now < rounds[i].endTime) {
            return i;
        }
    }

    return currentRoundId; // fallback
}
```

This would eliminate the need for UI-side searching.

## Summary

✅ **Issue:** Multi-draw tickets caused UI to show wrong round number
✅ **Cause:** Contract sets `currentRoundId` to last future round
✅ **Fix:** UI now searches for actually active round based on timestamps
✅ **Result:** Correct round and timer display regardless of ticket draws
✅ **Performance:** Efficient (only checks last 10 rounds)
✅ **Reliability:** Auto-updates every 30 seconds

The game now correctly displays the active round even when users buy multi-draw tickets!
