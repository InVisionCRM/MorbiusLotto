# Keno Timer & Round Number Fix

## Issues Identified

### Round Number Problems
1. **Dual State Variables**: The code maintained both `roundId` and `roundIdToPlay` which could get out of sync
2. **Stale Display**: `displayRoundId` used a fallback chain that could show outdated information
3. **Indirect Data Flow**: Round data was fetched based on state variable `roundId` instead of directly from `currentRoundIdData`

### Timer Problems
1. **No Auto-Refresh**: Contract data wasn't being polled, so round changes weren't detected
2. **Race Condition**: Timer depended on `roundData` which might not load immediately
3. **Circular Dependencies**: Progress calculation depended on both `nextDrawTime` and `roundData` creating complex dependency chains
4. **Poor Update Frequency**: Timer updated every 1 second, causing visible jumps in countdown

## Fixes Applied

### 1. Added Polling to Contract Queries
```typescript
// Poll currentRoundId every 5 seconds
const { data: currentRoundIdData } = useReadContract({
  address: KENO_ADDRESS,
  abi: KENO_ABI,
  functionName: 'currentRoundId',
  query: {
    refetchInterval: 5000, // New: automatic polling
  },
})
```

### 2. Direct Round Data Fetching
```typescript
// Use currentRoundIdData directly instead of state variable
const activeRoundId = currentRoundIdData ? Number(currentRoundIdData) : 1

const { data: roundData } = useReadContract({
  address: KENO_ADDRESS,
  abi: KENO_ABI,
  functionName: 'getRound',
  args: [BigInt(activeRoundId)], // Direct use, no intermediate state
  query: {
    enabled: activeRoundId > 0,
    refetchInterval: 5000, // Poll for timer updates
  },
})
```

### 3. Simplified Round Display
```typescript
// Display round ID directly from activeRoundId (no fallbacks needed)
const displayRoundId = useMemo(() => {
  return activeRoundId
}, [activeRoundId])
```

### 4. Timer Reset on Expiration
```typescript
// New effect to reset timer when it expires
useEffect(() => {
  if (!nextDrawTime || nextDrawTime <= 0) return

  const updateTimer = () => {
    const now = Date.now()
    const remaining = Math.max(0, nextDrawTime - now)

    // Reset when expired to trigger refetch
    if (remaining === 0) {
      setNextDrawTime(null)
    }
  }

  updateTimer()
  const timer = setInterval(updateTimer, 100) // 10x more frequent updates
  return () => clearInterval(timer)
}, [nextDrawTime])
```

### 5. Added getRound to KENO_ABI
- Moved the `getRound` ABI definition into `/lib/keno-abi.ts`
- Simplified the page.tsx code by removing inline ABI definition
- Made the contract interface more maintainable

### 6. Improved Progress Calculation Guard
```typescript
// Added roundData check to prevent errors
useEffect(() => {
  if (!nextDrawTime || nextDrawTime <= 0 || !roundData) return
  // ... progress calculation
}, [nextDrawTime, roundData])
```

## How It Works Now

### Data Flow
1. **currentRoundIdData** is polled every 5 seconds from the blockchain
2. **activeRoundId** is computed directly from currentRoundIdData (no state lag)
3. **roundData** is fetched using activeRoundId and also polled every 5 seconds
4. **nextDrawTime** is set from roundData.endTime
5. **Timer updates** every 100ms for smooth countdown
6. **When timer expires**, nextDrawTime is reset to null, triggering new round detection

### Benefits
- ✅ Round number always shows current blockchain state
- ✅ Timer updates smoothly (10x per second)
- ✅ Automatic detection of new rounds (5-second polling)
- ✅ No state synchronization issues
- ✅ Cleaner code with centralized ABI definition

## Testing Checklist
- [ ] Round number displays correctly on page load
- [ ] Round number updates when new round starts (within 5 seconds)
- [ ] Timer counts down smoothly
- [ ] Timer resets when new round starts
- [ ] Progress bar fills correctly during round
- [ ] No console errors related to contract calls
- [ ] Round stats (pool balance, wagers) update correctly
