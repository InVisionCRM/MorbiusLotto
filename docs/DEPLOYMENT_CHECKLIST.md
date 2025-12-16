# Pulse Progressive Deployment Checklist

Use this checklist to ensure smooth deployment and integration of the Pulse Progressive feature.

---

## 🔧 Pre-Deployment

### Smart Contract

- [ ] Contract compiles successfully (`npx hardhat compile`)
- [ ] Run unit tests (if available)
- [ ] Verify round duration set to 160 seconds
- [ ] Verify progressive defaults:
  - [ ] Base seed: 100,000 tokens
  - [ ] Cost per draw: 0.001 tokens
  - [ ] Fee to pool: 85%
- [ ] Code review completed
- [ ] Security audit (recommended for mainnet)

### Frontend Setup

- [ ] Install required dependencies:
  ```bash
  npm install framer-motion lucide-react
  ```
- [ ] Update contract ABI in `/abi/CryptoKeno.json`
- [ ] Update contract address in `/lib/contracts.ts`
- [ ] Verify all TypeScript types are correct

---

## 🚀 Deployment Steps

### 1. Deploy Contract

```bash
cd morbius_lotto/contracts
npx hardhat run scripts/deploy-keno.js --network pulsechain
```

**Capture from output:**
- [ ] Contract address: `___________________________`
- [ ] Deployment tx: `___________________________`
- [ ] Block number: `___________________________`

### 2. Verify Contract (Optional but Recommended)

```bash
npx hardhat verify --network pulsechain <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### 3. Initial Configuration

Run these after deployment:

```typescript
// Set max wager (if needed)
await kenoContract.setMaxWagerPerDraw(parseEther("10"))

// Manually seed progressive pool for launch (optional but recommended)
await kenoContract.seedProgressivePool(parseEther("150000")) // Start at 250k total

// Verify settings
const stats = await kenoContract.getProgressiveStats()
console.log('Progressive pool:', formatEther(stats.currentPool))
```

**Record:**
- [ ] Initial pool amount: `___________________________`
- [ ] Configuration tx: `___________________________`

### 4. Update Frontend

Update these files with deployed contract address:

```typescript
// lib/contracts.ts
export const KENO_CONTRACT_ADDRESS = '0x...' // YOUR DEPLOYED ADDRESS
```

- [ ] Update contract address
- [ ] Copy new ABI to `/abi/CryptoKeno.json`
- [ ] Test contract reads work
- [ ] Test contract writes work

---

## 🧪 Testing

### Contract Functions

Test each new function:

- [ ] `buyTicket()` with progressive addon
  - [ ] Verify pool increases by 85% of fee
  - [ ] Verify totalProgressiveAddon tracks correctly
- [ ] `getProgressiveStats()` returns correct data
- [ ] `distributeProgressive()` with single winner
- [ ] `distributeProgressive()` with multiple winners
- [ ] `setProgressiveConfig()` (admin only)
- [ ] `seedProgressivePool()` (admin only)

### UI Components

Test each component:

- [ ] `PulseProgressive` displays correctly
  - [ ] Jackpot counter animates
  - [ ] Stats display accurately
  - [ ] Responsive on mobile
- [ ] `PulseProgressiveWidget` displays correctly
  - [ ] Updates in real-time
  - [ ] Click handler works
- [ ] `ProgressiveAddonToggle` works correctly
  - [ ] Enables/disables properly
  - [ ] Shows eligibility correctly
  - [ ] Cost calculation accurate

### Integration Tests

End-to-end flow:

- [ ] View progressive jackpot on homepage
- [ ] Click to view full progressive page
- [ ] Purchase 9-spot ticket with progressive
- [ ] Wait for round to finalize
- [ ] Claim winning ticket (if won)
- [ ] Call distributeProgressive
- [ ] Verify jackpot reset

---

## 🎨 Frontend Integration

### Add to Navigation

```tsx
// In your navbar/header component
import { PulseProgressiveWidget } from '@/components/CryptoKeno/pulse-progressive-widget'
import { usePulseProgressive } from '@/hooks/usePulseProgressive'

function Navbar() {
  const { currentPool, isLoading } = usePulseProgressive()

  return (
    <nav>
      {/* ... other nav items ... */}
      <PulseProgressiveWidget
        currentPool={currentPool}
        isLoading={isLoading}
        onClick={() => router.push('/progressive')}
      />
    </nav>
  )
}
```

- [ ] Widget added to navbar
- [ ] Widget displays correctly
- [ ] Widget updates in real-time

### Create Progressive Page

Create `/app/progressive/page.tsx`:

```tsx
import { PulseProgressive } from '@/components/CryptoKeno/pulse-progressive'
import { usePulseProgressive } from '@/hooks/usePulseProgressive'

export default function ProgressivePage() {
  const stats = usePulseProgressive()
  return <PulseProgressive {...stats} />
}
```

- [ ] Progressive page created
- [ ] Page accessible via URL
- [ ] Page displays correctly

### Update Ticket Purchase

In your ticket purchase component:

```tsx
import { ProgressiveAddonToggle } from '@/components/CryptoKeno/progressive-addon-toggle'
import { buildAddons } from '@/lib/keno-constants'

function TicketPurchase() {
  const [progressiveEnabled, setProgressiveEnabled] = useState(false)
  const { currentPool, costPerDraw } = usePulseProgressive()

  // When building addons for contract call:
  const addons = buildAddons({
    multiplier: multiplierEnabled,
    bullsEye: bullsEyeEnabled,
    plus3: plus3Enabled,
    progressive: progressiveEnabled
  })

  return (
    <ProgressiveAddonToggle
      enabled={progressiveEnabled}
      onToggle={setProgressiveEnabled}
      costPerDraw={costPerDraw}
      draws={draws}
      spotSize={spotSize}
      currentJackpot={currentPool}
    />
  )
}
```

- [ ] Progressive toggle added
- [ ] Toggle works correctly
- [ ] Cost calculated correctly
- [ ] Purchase includes progressive flag

---

## 📊 Monitoring & Analytics

### Event Tracking

Set up listeners for these events:

```typescript
// Progressive purchase
contract.on('TicketPurchased', (player, ticketId, roundId, ..., addons) => {
  const { progressive } = parseAddons(addons)
  if (progressive) {
    // Track progressive purchase
  }
})

// Progressive win
contract.on('ProgressiveWon', (roundId, ticketId, player, jackpotAmount, shareAmount) => {
  // Alert and celebrate!
  // Update leaderboard
  // Send notifications
})

// Pool updates
contract.on('ProgressivePoolUpdated', (newAmount, totalCollected) => {
  // Update displays
})
```

- [ ] Event listeners set up
- [ ] Analytics tracking configured
- [ ] Alerts configured for wins

### Metrics to Track

- [ ] Progressive opt-in rate (% of eligible tickets)
- [ ] Average jackpot size
- [ ] Time between wins
- [ ] Total progressive revenue
- [ ] Number of active progressive players

---

## 🎯 Marketing Launch

### Pre-Launch (1 week before)

- [ ] Create promotional graphics
- [ ] Write announcement blog post
- [ ] Prepare social media posts
- [ ] Set up email campaign
- [ ] Brief community moderators

### Launch Day

- [ ] Announce on Twitter/X
- [ ] Post in Discord/Telegram
- [ ] Send email to user list
- [ ] Update website homepage banner
- [ ] Pin announcement in community channels

### Post-Launch (first week)

- [ ] Daily jackpot updates on social media
- [ ] Highlight first winner (when it happens)
- [ ] Share player testimonials
- [ ] Monitor feedback and issues
- [ ] Adjust marketing based on metrics

---

## 🔍 Post-Deployment Verification

### Day 1

- [ ] Verify progressive purchases working
- [ ] Check pool is accumulating correctly
- [ ] Monitor gas costs
- [ ] Check for any errors in logs

### Week 1

- [ ] Review opt-in rate
- [ ] Analyze player behavior
- [ ] Gather user feedback
- [ ] Check jackpot growth rate
- [ ] Monitor contract balance

### Month 1

- [ ] Full metrics review
- [ ] Optimize if needed
- [ ] Plan promotional campaigns
- [ ] Consider base seed adjustment
- [ ] Review win frequency

---

## 🆘 Troubleshooting

### Common Issues

**Issue:** Progressive toggle disabled for 9-spot games
- **Check:** Verify `isProgressiveEligible()` logic
- **Fix:** Ensure spotSize >= 9 check is correct

**Issue:** Pool not growing
- **Check:** Verify fee calculation in buyTicket
- **Fix:** Ensure 85% of progressive fee goes to pool

**Issue:** Distribution failing
- **Check:** Verify winners array has entries
- **Fix:** Ensure win condition logic is correct

**Issue:** Widget not updating
- **Check:** Verify useBlockNumber hook working
- **Fix:** Check refetch interval and RPC connection

---

## ✅ Launch Complete

Once all items checked:

- [ ] All tests passing
- [ ] UI fully integrated
- [ ] Analytics tracking
- [ ] Marketing launched
- [ ] Team briefed
- [ ] Documentation complete

---

## 📞 Emergency Contacts

If issues arise:

- **Contract Issues:** _________________________
- **Frontend Issues:** _________________________
- **DevOps:** _________________________
- **Community Manager:** _________________________

---

## 📝 Notes

Additional deployment notes:

```
[Add any specific notes or observations here]
```

---

**Deployment Date:** ___/___/___
**Deployed By:** ___________________________
**Network:** PulseChain (369)
**Status:** ⬜ Not Started | 🔄 In Progress | ✅ Complete
