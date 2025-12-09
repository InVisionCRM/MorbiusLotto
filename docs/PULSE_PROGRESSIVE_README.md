# Pulse Progressive Jackpot

## Overview

**Pulse Progressive** is a crypto-native progressive jackpot system inspired by Michigan's "The Jack" add-on for Club Keno. It creates a continuously growing jackpot that players can win by matching 9 or more numbers on eligible games.

## How It Works

### For Players

1. **Eligibility**: Play a 9-Spot or 10-Spot Keno game
2. **Opt-In**: Add the "Pulse Progressive" option when purchasing tickets (+0.001 PLS per draw)
3. **Win Condition**: Match 9 or more numbers to win the jackpot
4. **Payout**: Winners split the jackpot pool if multiple winners occur in the same round

### Jackpot Mechanics

- **Starting Seed**: 100,000 PLS
- **Fee Structure**:
  - Players pay 0.001 PLS per draw
  - 85% goes to progressive pool (0.00085 PLS)
  - 15% protocol fee (0.00015 PLS)
- **Reset**: After a win, jackpot resets to 100,000 PLS base seed
- **Growth**: Jackpot grows with every progressive ticket purchased

## Contract Implementation

### State Variables

```solidity
uint256 public progressivePool;           // Current jackpot amount
uint256 public progressiveBaseSeed;       // Reset value (100,000 tokens)
uint256 public progressiveCostPerDraw;    // Fee per draw (0.001 tokens)
uint256 public progressiveFeeBps;         // % to pool (8500 = 85%)
uint256 public progressiveTotalCollected; // Lifetime contributions
uint256 public progressiveTotalPaid;      // Lifetime payouts
uint256 public progressiveWinCount;       // Number of wins
uint256 public lastProgressiveWinRound;   // Last winning round
```

### Win Condition Logic

```solidity
// In _processClaimInternal():
if ((ticket.addons & ADDON_PROGRESSIVE) != 0 && ticket.spotSize >= 9 && hits >= 9) {
    roundInfo.progressiveWinners.push(ticketId);
}
```

### Distribution

Winners must call `distributeProgressive(roundId)` after the round is finalized:

```solidity
function distributeProgressive(uint256 roundId) external {
    // Validates round is finalized and has winners
    // Splits pool equally among all winners
    // Resets pool to base seed
    // Emits ProgressiveWon events
}
```

## Admin Functions

### Configure Progressive

```solidity
function setProgressiveConfig(
    uint256 baseSeed,      // Reset amount
    uint256 costPerDraw,   // Fee per draw
    uint256 feeBps_        // % to pool (in basis points)
) external onlyOwner
```

### Seed Pool

```solidity
function seedProgressivePool(uint256 amount) external onlyOwner
```

## View Functions

### Get Progressive Stats

```solidity
function getProgressiveStats() external view returns (
    uint256 currentPool,
    uint256 baseSeed,
    uint256 costPerDraw,
    uint256 totalCollected,
    uint256 totalPaid,
    uint256 winCount,
    uint256 lastWinRound
)
```

## Events

```solidity
event ProgressiveWon(
    uint256 indexed roundId,
    uint256 indexed ticketId,
    address indexed player,
    uint256 jackpotAmount,
    uint256 shareAmount
);

event ProgressivePoolUpdated(uint256 newAmount, uint256 totalCollected);

event ProgressiveConfigUpdated(uint256 baseSeed, uint256 costPerDraw, uint256 feeBps);
```

## UI Components

### Full Display Component

```tsx
import { PulseProgressive } from '@/components/CryptoKeno/pulse-progressive'

<PulseProgressive
  currentPool={progressivePool}
  baseSeed={progressiveBaseSeed}
  totalCollected={totalCollected}
  totalPaid={totalPaid}
  winCount={winCount}
  lastWinRound={lastWinRound}
/>
```

### Compact Widget (for navbar/header)

```tsx
import { PulseProgressiveWidget } from '@/components/CryptoKeno/pulse-progressive-widget'

<PulseProgressiveWidget
  currentPool={progressivePool}
  onClick={() => router.push('/progressive')}
/>
```

### Ticket Purchase Toggle

```tsx
import { ProgressiveAddonToggle } from '@/components/CryptoKeno/progressive-addon-toggle'

<ProgressiveAddonToggle
  enabled={progressiveEnabled}
  onToggle={setProgressiveEnabled}
  costPerDraw={progressiveCostPerDraw}
  draws={draws}
  spotSize={spotSize}
  currentJackpot={progressivePool}
/>
```

## React Hook

```tsx
import { usePulseProgressive } from '@/hooks/usePulseProgressive'

function MyComponent() {
  const {
    currentPool,
    baseSeed,
    totalCollected,
    totalPaid,
    winCount,
    lastWinRound,
    isLoading
  } = usePulseProgressive()

  // Use progressive data
}
```

## Example Usage Flow

### 1. Player Purchases Ticket with Progressive

```typescript
const addons = ADDON_MULTIPLIER | ADDON_PROGRESSIVE // 0x09
await buyTicket({
  roundId: currentRound,
  numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9], // 9 spots
  spotSize: 9,
  draws: 5,
  addons: addons,
  wagerPerDraw: parseEther("0.001")
})
```

### 2. Round Finalizes

```typescript
await finalizeRound(roundId)
// If ticket matches 9+ numbers, it's added to progressiveWinners array
```

### 3. Claim Standard Prize

```typescript
await claim(roundId, ticketId)
// Claims base prize + bulls-eye + multiplier (if applicable)
```

### 4. Distribute Progressive

```typescript
await distributeProgressive(roundId)
// Splits progressive pool among all winners
// Emits ProgressiveWon events
// Resets pool to base seed
```

## Probability & Expected Value

### Win Probability (9-Spot Game)

- Match 9-of-9: ~0.000072% per draw
- ~1 in 1,380,687 draws

### Win Probability (10-Spot Game)

- Match 9-of-10: ~0.00061% per draw
- Match 10-of-10: ~0.0000112% per draw
- Combined: ~0.00062% per draw
- ~1 in 160,000 draws

### Expected Jackpot Growth

With 1000 progressive tickets per round (3 min rounds):
- Revenue per round: 1000 × 0.001 = 1 PLS
- To pool (85%): 0.85 PLS
- Daily growth: 0.85 × 480 rounds = 408 PLS/day
- Monthly growth: ~12,240 PLS/month

### Break-Even Analysis

For a 100,000 PLS starting seed:
- Time to 200k: ~245 days at 1000 tickets/round
- Time to 500k: ~980 days at 1000 tickets/round

**Recommendation**: Adjust base seed based on expected traffic or manually seed pool for marketing impact.

## Marketing Recommendations

1. **Launch Promotion**: Seed initial pool to 250,000 PLS for excitement
2. **Live Ticker**: Display current jackpot prominently on homepage
3. **Win Alerts**: Broadcast progressive wins across all channels
4. **Leaderboard**: Show total progressive winnings by player
5. **Social Proof**: "Last won 3 days ago at Round #1234"

## Security Considerations

- ✅ No reentrancy vulnerabilities (uses ReentrancyGuard)
- ✅ Winners array deleted after distribution (prevents double-payment)
- ✅ Integer overflow protection (Solidity 0.8+)
- ✅ Access control on configuration functions
- ✅ Pool balance validated before transfer

## Testing Checklist

- [ ] Single winner receives full pool
- [ ] Multiple winners split pool correctly
- [ ] Pool resets to base seed after distribution
- [ ] Ineligible spots (1-8) cannot win progressive
- [ ] Progressive disabled tickets don't win
- [ ] Gas costs reasonable for distribution (<500k gas)
- [ ] UI displays real-time jackpot updates
- [ ] Statistics tracked correctly (totalPaid, winCount)

## Future Enhancements

1. **Secondary Jackpot**: Smaller "mini progressive" for 8-of-8 matches
2. **Guaranteed Win**: Force payout if jackpot exceeds threshold
3. **Bonus Multipliers**: Apply multiplier to progressive wins
4. **NFT Rewards**: Issue commemorative NFTs to jackpot winners
5. **Streaming Integration**: Live-stream progressive draws on Twitch

---

**Version**: 1.0.0
**Contract**: CryptoKeno.sol
**Network**: PulseChain (369)
**Last Updated**: December 2025
