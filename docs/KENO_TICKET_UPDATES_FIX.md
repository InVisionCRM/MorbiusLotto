# Keno Ticket Updates Fix - Draws Remaining

## Issue

The "My Tickets" section was not updating `drawsRemaining` as rounds progressed.

**Expected Behavior:**
- Ticket with 5 draws starting at Round 34
- Round 34: Shows "5 / 5" draws remaining
- Round 35: Shows "4 / 5" draws remaining
- Round 36: Shows "3 / 5" draws remaining
- etc.

**Actual Behavior:**
- Always showed the same `drawsRemaining` value
- Never updated as rounds progressed
- Made it impossible to track ticket status

## Root Cause

### The Contract Behavior

The CryptoKeno contract stores `drawsRemaining` in the ticket struct:

```solidity
struct Ticket {
    address player;
    uint64 firstRoundId;
    uint8 draws;
    uint8 spotSize;
    uint16 addons;
    uint8 drawsRemaining;  // ← This field
    uint256 wagerPerDraw;
    uint256 numbersBitmap;
}
```

**However**, `drawsRemaining` is only updated when the contract **processes** the ticket for a round (when checking for wins, claiming prizes, etc.). It does NOT automatically decrement just because time passes.

### The UI Problem

The UI was using `drawsRemaining` directly from the contract:

```typescript
const drawsRemaining = Number(ticketData.drawsRemaining || 0)
```

This meant:
- If contract never processed the ticket: `drawsRemaining` = original value
- Never changes even as rounds complete
- User has no idea how many draws are actually left

## The Solution

### Calculate Draws Remaining Client-Side

Instead of trusting the contract's `drawsRemaining` field, the UI now **calculates** it based on:
1. Active round number
2. Ticket's first round
3. Ticket's total draws

```typescript
const from = Number(ticketData.firstRoundId)
const draws = Number(ticketData.draws)
const lastRound = from + draws - 1

let drawsRemaining: number

if (activeRoundId < from) {
  // Ticket hasn't started yet
  drawsRemaining = draws
} else if (activeRoundId > lastRound) {
  // Ticket has expired
  drawsRemaining = 0
} else {
  // Ticket is active
  drawsRemaining = lastRound - activeRoundId + 1
}
```

### Example Calculation

**Ticket:**
- First Round: 34
- Total Draws: 5
- Last Round: 38 (34 + 5 - 1)

**As Rounds Progress:**

| Active Round | Calculation | Draws Remaining | Status |
|--------------|-------------|-----------------|---------|
| 33 | `33 < 34` | 5 | Not started |
| 34 | `38 - 34 + 1` | 5 | Active |
| 35 | `38 - 35 + 1` | 4 | Active |
| 36 | `38 - 36 + 1` | 3 | Active |
| 37 | `38 - 37 + 1` | 2 | Active |
| 38 | `38 - 38 + 1` | 1 | Active |
| 39 | `39 > 38` | 0 | Expired |

## Implementation

### File Modified
`/morbius_lotto/app/keno/page.tsx`

### Key Changes

**1. Calculate Based on Active Round (Lines 505-519)**
```typescript
let drawsRemaining: number
if (activeRoundId < from) {
  drawsRemaining = draws  // Ticket hasn't started
} else if (activeRoundId > lastRound) {
  drawsRemaining = 0  // Ticket expired
} else {
  drawsRemaining = lastRound - activeRoundId + 1  // Ticket active
}
```

**2. Add activeRoundId to Dependencies (Line 550)**
```typescript
}, [ticketDetails, ticketIds, roundData, activeRoundId])
```

**3. Enhanced Logging (Lines 521-533)**
```typescript
console.log(`Ticket ${idx} calculation:`, {
  from,
  lastRound,
  draws,
  activeRoundId,
  drawsRemaining,  // Calculated value
  contractDrawsRemaining: Number(ticketData.drawsRemaining || 0),  // Contract value
})
```

## Benefits

✅ **Real-time Updates** - Draws remaining updates as rounds progress
✅ **Accurate Status** - Users can see exactly how many draws left
✅ **Auto-refresh** - Updates every 30 seconds when active round changes
✅ **No Contract Dependency** - Works even if contract doesn't update `drawsRemaining`
✅ **Future-ready** - Works for tickets starting in future rounds
✅ **Past-aware** - Correctly shows 0 for expired tickets

## User Experience

### Before Fix:
```
Ticket #123
5-spot • 5 draws • Rounds 34-38
Wager: 0.0010 WPLS/draw
Draws remaining: 5

(Never changes, even after Round 34 ends)
```

### After Fix:
```
Round 34:
Ticket #123 [Active]
Draws Left: 5 / 5

Round 35:
Ticket #123 [Active]
Draws Left: 4 / 5

Round 36:
Ticket #123 [Active]
Draws Left: 3 / 5

Round 39:
Ticket #123 [Expired]
Draws Left: 0 / 5
```

## Edge Cases Handled

1. **Future Tickets** (activeRound < firstRound)
   - Shows full draws remaining
   - Example: Round 30, ticket starts Round 34 → Shows "5 / 5"

2. **Active Tickets** (firstRound ≤ activeRound ≤ lastRound)
   - Calculates remaining draws accurately
   - Example: Round 36, ticket 34-38 → Shows "3 / 5"

3. **Expired Tickets** (activeRound > lastRound)
   - Shows 0 draws remaining
   - Badge changes to "Expired" (gray)
   - Example: Round 40, ticket 34-38 → Shows "0 / 5"

4. **Single-Draw Tickets**
   - Works correctly for 1 draw
   - Example: Round 34, ticket for Round 34 → Shows "1 / 1"
   - After Round 34: Shows "0 / 1"

## Integration with Other Fixes

This fix works seamlessly with:
1. **Active Round Detection** - Uses the correctly calculated `activeRoundId`
2. **Ticket Data Polling** - Refreshes every 10 seconds
3. **Active Round Updates** - Updates every 30 seconds
4. **Visual Status Badges** - Active/Expired badges update based on `drawsRemaining`

## Performance

- **Calculation:** O(1) per ticket (simple arithmetic)
- **Re-calculation:** Happens when:
  - Ticket data refreshes (every 10s)
  - Active round changes (every 30s)
  - Round data updates (every 5s)
- **No additional API calls** - Pure client-side calculation

## Testing

### Test Scenario 1: New Ticket
1. Buy ticket for 5 draws at Round 34
2. Immediately shows "5 / 5"
3. Badge shows "Active" (green)
4. ✅ Correct

### Test Scenario 2: Round Progression
1. Round 34 active: "5 / 5"
2. Wait 15 minutes
3. Round 35 active: "4 / 5"
4. Wait 15 minutes
5. Round 36 active: "3 / 5"
6. ✅ Updates automatically

### Test Scenario 3: Expiration
1. Round 38 active: "1 / 5"
2. Wait 15 minutes
3. Round 39 active: "0 / 5"
4. Badge changes to "Expired" (gray)
5. Opacity changes to 60%
6. ✅ Visual feedback works

### Test Scenario 4: Future Ticket
1. Active Round: 30
2. Buy ticket for Round 35 (5 draws)
3. Shows "5 / 5" (all remaining)
4. Badge shows "Active" (ticket is valid)
5. ✅ Future tickets work

## Console Output

You'll see logs like:
```javascript
Ticket 0 calculation: {
  ticketId: 1n,
  from: 34,
  lastRound: 38,
  draws: 5,
  activeRoundId: 35,
  drawsRemaining: 4,  // ← Calculated
  contractDrawsRemaining: 5,  // ← Contract (stale)
  spotSize: 8,
  numbers: [5, 12, 23, 34, 45, 56, 67, 78]
}
```

This helps verify the calculation is correct.

## Summary

✅ **Issue:** Draws remaining never updated
✅ **Cause:** Contract only updates field when processing ticket
✅ **Fix:** Client-side calculation based on active round
✅ **Result:** Real-time updates, accurate status, better UX
✅ **Performance:** Efficient, no extra API calls
✅ **Reliability:** Works even if contract field is stale

The "My Tickets" section now provides **live, accurate status** of all tickets!
