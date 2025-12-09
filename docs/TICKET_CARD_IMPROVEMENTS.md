# Ticket Card Improvements - Complete Fix

## Issues Fixed

### 1. Flickering/Disappearing Round Details ✅

**Problem:** When clicking "Show Round Details", the breakdown would flash on and off repeatedly, making it unusable.

**Root Cause:** The `TicketRoundBreakdown` component had `activeRoundId` in its useEffect dependencies. Since `activeRoundId` updates every 30 seconds (from the active round detection logic), the component was re-fetching all round data every 30 seconds, causing the UI to flicker.

**Solution:**
- Added `lastFetchTime` state to track when data was last fetched
- Only re-fetch data if more than 60 seconds have passed
- For updates within 60 seconds, just update status flags (isPast, isCurrent, isFuture)
- This prevents unnecessary re-fetches while keeping status indicators updated

**Code (lines 122-139):**
```typescript
const [lastFetchTime, setLastFetchTime] = useState(0)

// Only re-fetch if it's been more than 60 seconds since last fetch
const now = Date.now()
if (roundResults.length > 0 && now - lastFetchTime < 60000) {
  // Just update the status flags without re-fetching
  setRoundResults(prev => prev.map(r => ({
    ...r,
    isPast: r.roundId < activeRoundId,
    isCurrent: r.roundId === activeRoundId,
    isFuture: r.roundId > activeRoundId,
  })))
  return
}
```

### 2. Missing Total PNL Tracking ✅

**Problem:** Users couldn't see:
- Total amount won across all rounds
- Total cost of the ticket
- Net profit/loss (PNL)
- Whether they're profitable or not

**Solution:**
Created new `TicketPNLSummary` component that:
- Calculates total winnings across all rounds
- Shows total cost (wager × draws)
- Displays net PNL (winnings - cost)
- Color-codes results:
  - Green background: Profitable (net PNL > 0)
  - Red text: Loss (net PNL < 0)
  - Gray: Break even (net PNL = 0)

**Code (lines 312-423):**
```typescript
function TicketPNLSummary({ ticket, publicClient, calculateRoundWin }) {
  const [totalWinnings, setTotalWinnings] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  // Calculate total winnings across all rounds
  useEffect(() => {
    const calculateTotalWinnings = async () => {
      let total = 0
      for (let roundId = firstRound; roundId <= lastRound; roundId++) {
        // Fetch round data and calculate winnings
        const winData = calculateRoundWin(...)
        if (winData && winData.totalWin > 0) {
          total += winData.totalWin
        }
      }
      setTotalWinnings(total)
    }
    calculateTotalWinnings()
  }, [ticket.ticketId, publicClient, calculateRoundWin])

  const totalCost = parseFloat(ticket.wagerPerDraw) * ticket.draws
  const netPNL = totalWinnings - totalCost
  const isProfitable = netPNL > 0

  return (
    <div className={isProfitable ? "bg-emerald-500/20" : "bg-black/20"}>
      <div className="grid grid-cols-3">
        <div>Total Cost: {totalCost.toFixed(4)} WPLS</div>
        <div>Total Winnings: {totalWinnings.toFixed(4)} WPLS</div>
        <div>Net PNL: {netPNL >= 0 ? '+' : ''}{netPNL.toFixed(4)}</div>
      </div>
    </div>
  )
}
```

## New UI Features

### Ticket Card Layout (After Fixes)

```
┌─────────────────────────────────────────────────┐
│ Ticket #123 [Active]                           │
│ 8-spot • 5 draws • Rounds 39–43                │
├─────────────────────────────────────────────────┤
│ Your Numbers:                                   │
│ [5][12][23][34][45][56][67][78]               │
├─────────────────────────────────────────────────┤
│ Wager/Draw        │ Draws Left                 │
│ 0.0010 WPLS       │ 3 / 5                      │
├─────────────────────────────────────────────────┤
│ ⚡ Multiplier  🎯 Bulls-Eye                    │
├─────────────────────────────────────────────────┤
│ 💰 PNL SUMMARY                                  │
│ ┌─────────────┬──────────────┬──────────────┐ │
│ │ Total Cost  │ Total Win    │ Net PNL      │ │
│ │ 0.0050 WPLS │ 0.0875 WPLS  │ +0.0825      │ │
│ └─────────────┴──────────────┴──────────────┘ │
│ ✅ Profitable (green background)               │
├─────────────────────────────────────────────────┤
│ [Show Round Details] ▼                         │
└─────────────────────────────────────────────────┘

[When expanded:]
┌─────────────────────────────────────────────────┐
│ Round-by-Round Results    Total: 0.0875 WPLS   │
│                                                 │
│ ┌─ Round #39 ────────────────────────────────┐ │
│ │ Matched 6: 5, 12, 23, 34, 45, 56          │ │
│ │ +0.0150 WPLS (Base: 25× + Multiplier: 3×) │ │
│ └───────────────────────────────────────────┘ │
│ ┌─ Round #40 (Active) ───────────────────────┐│
│ │ Matched 7: 5, 12, 23, 34, 45, 56, 67      │ │
│ │ +0.0500 WPLS (Base: 500× + Bulls-Eye!)    │ │
│ └───────────────────────────────────────────┘ │
│ ┌─ Round #41 ────────────────────────────────┐ │
│ │ Matched 4: 5, 12, 23, 34                   │ │
│ │ +0.0225 WPLS (Base: 150× × Multiplier: 3×)│ │
│ └───────────────────────────────────────────┘ │
│ ┌─ Round #42 (Pending) ──────────────────────┐│
│ │ Not drawn yet                              │ │
│ └───────────────────────────────────────────┘ │
│ ┌─ Round #43 (Pending) ──────────────────────┐│
│ │ Not drawn yet                              │ │
│ └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Benefits

### 1. Stable UI
✅ Round details stay visible when expanded
✅ No more flickering or disappearing
✅ Smooth user experience

### 2. Complete Financial Tracking
✅ See total cost at a glance
✅ See total winnings across all rounds
✅ See net PNL (profit/loss)
✅ Visual indicators (green = profit, red = loss)

### 3. Detailed Round Breakdown
✅ See results for each individual round
✅ Know which numbers matched
✅ See multipliers and Bulls-Eye hits
✅ Understand how winnings were calculated

### 4. Real-time Updates
✅ Status updates every 30 seconds (Active/Pending/Past)
✅ New round results appear automatically
✅ PNL updates as rounds finalize
✅ No manual refresh needed

## Technical Implementation

### Files Modified
- `/Users/kyle/MORBlotto/morbius_lotto/app/keno/page.tsx`

### Key Changes

**1. TicketRoundBreakdown (lines 109-310)**
- Added `lastFetchTime` state
- Smart caching logic (60-second minimum between fetches)
- Lightweight status updates for frequent checks
- Prevents flickering

**2. TicketPNLSummary (lines 312-423)**
- New component for PNL calculation
- Fetches all round results
- Calculates total winnings
- Displays cost vs winnings vs net PNL
- Color-coded UI based on profitability

**3. Integration (line 1715)**
- Added `<TicketPNLSummary>` to each ticket card
- Appears above the "Show Round Details" button
- Always visible (not hidden in expandable section)

## Performance

### Before
- Round details re-fetched every 30 seconds
- UI flickered constantly
- Poor user experience
- Unnecessary API calls

### After
- Round details cached for 60 seconds
- Only status flags update every 30 seconds
- Smooth, stable UI
- Efficient API usage

### PNL Calculation
- Runs once when ticket card loads
- Fetches only the rounds for that ticket
- Caches result (doesn't re-calculate constantly)
- Fast and efficient

## User Experience

### Before Fixes
❌ Round details flash on/off repeatedly
❌ No idea if ticket is profitable
❌ Can't see total winnings
❌ Must manually calculate PNL
❌ Frustrating and unusable

### After Fixes
✅ Round details stay stable when expanded
✅ Clear profit/loss indicator
✅ Total winnings displayed prominently
✅ Automatic PNL calculation
✅ Color-coded for quick understanding
✅ Professional, polished experience

## Example Scenarios

### Scenario 1: Profitable Ticket
```
Total Cost: 0.0050 WPLS
Total Winnings: 0.0875 WPLS
Net PNL: +0.0825

Background: Green
Text: "Net PNL" in bright emerald
User sees: ✅ This ticket made money!
```

### Scenario 2: Losing Ticket
```
Total Cost: 0.0050 WPLS
Total Winnings: 0.0012 WPLS
Net PNL: -0.0038

Background: Black/Gray
Text: "Net PNL" in red
User sees: ❌ This ticket lost money
```

### Scenario 3: Break Even
```
Total Cost: 0.0050 WPLS
Total Winnings: 0.0050 WPLS
Net PNL: +0.0000

Background: Black/Gray
Text: "Net PNL" in gray
User sees: No profit, no loss
```

### Scenario 4: Active Ticket (Partial Results)
```
Total Cost: 0.0050 WPLS (5 draws)
Total Winnings: 0.0225 WPLS (2 rounds completed)
Net PNL: +0.0175 (so far!)

Status: 3 / 5 draws remaining
User sees: Currently profitable, 3 more chances to win!
```

## Edge Cases Handled

1. **Tickets with 0 winnings** - Shows gray, not red
2. **Future rounds** - Shows "Not drawn yet", doesn't fetch unnecessarily
3. **Error fetching round data** - Shows error message, doesn't crash
4. **Mixed finalized/pending rounds** - Only calculates finalized rounds
5. **Rapid clicking** - Cached data prevents flicker
6. **Network issues** - Loading states and error handling

## Integration with Other Features

Works seamlessly with:
1. **Consecutive draws fix** - Correctly handles multi-draw tickets
2. **Active round detection** - Shows which round is currently active
3. **Draws remaining calculation** - PNL updates as ticket progresses
4. **Round-by-round breakdown** - Detailed view of each round's results
5. **Multiplier and Bulls-Eye** - Calculates bonuses correctly

## Summary

✅ **Issue 1 Fixed:** Round details no longer flicker or disappear
✅ **Issue 2 Fixed:** Total PNL tracking fully implemented
✅ **Bonus:** Color-coded profitability indicators
✅ **Bonus:** Detailed per-round breakdowns
✅ **Result:** Professional, user-friendly ticket tracking

The "My Tickets" section now provides complete, stable, and useful information about every ticket purchase!
