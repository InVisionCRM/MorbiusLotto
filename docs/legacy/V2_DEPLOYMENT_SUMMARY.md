# SuperStakeLottery6of55 V2 Deployment Summary

## ✅ Successfully Deployed

**Contract Address:** `0xcf6094EA8f6Ea462A9bd9e30880F57c324240f83`
**Network:** PulseChain Mainnet (369)
**Deployment Block:** 25175133
**Transaction:** 0xaeb13fb7fe06e615d05f45d9976d812a78876479513bb398a7b833cbbecd65fa

## 🎯 V2 Improvements

### 1. **Enhanced Prize Distribution**
- **Winners Pool:** 60% (↑ from 55%)
- **SuperStake Allocation:** 20% (↓ from 25%)
- **MegaMillions Bank:** 20% (unchanged)

### 2. **Rebalanced Brackets**
Rewards now focus on harder matches:
- Bracket 1 (1 match): 1% (↓ from 2%)
- Bracket 2 (2 match): 2% (↓ from 4%)
- Bracket 3 (3 match): 4% (↓ from 6%)
- Bracket 4 (4 match): 8% (same)
- Bracket 5 (5 match): 15% (↑ from 10%)
- Bracket 6 (6 match): 40% (↑ from 25%)

### 3. **Smart Rollover System**
When no winners in a bracket:
- **Brackets 1-4:** 100% → MegaMillions bank
- **Bracket 5:** 60% → Bracket 6, 40% → MegaMillions
- **Bracket 6:** 60% → Bracket 5, 40% → MegaMillions

### 4. **WPLS Payment Support**
- New `buyTicketsWithWPLS()` function
- Auto-swaps WPLS → pSSH via PulseX
- Accounts for 5.5% pSSH tax + 5% slippage (11.1% buffer)
- Users can pay with WPLS without manually swapping

## 📝 Frontend Updates Completed

### Files Updated:
1. ✅ **lib/contracts.ts** - New contract address and token addresses
2. ✅ **abi/lottery6of55-v2.ts** - V2 ABI with WPLS functions
3. ✅ **hooks/use-lottery-6of55.ts** - Updated to use V2 ABI
4. ✅ **components/lottery/ticket-purchase-v2.tsx** - New component with WPLS support
5. ✅ **app/page.tsx** - Imports new V2 component

### New Features in UI:
- Payment method toggle (pSSH / WPLS)
- Automatic token balance checks for both
- Smart approval handling (WPLS requires 2x buffer)
- Clear indication of which token is being used
- Shows approximate pSSH cost when using WPLS

## 🔗 Contract Addresses

```typescript
// V2 Contract (CURRENT)
export const LOTTERY_ADDRESS = '0xcf6094EA8f6Ea462A9bd9e30880F57c324240f83'

// Token Addresses
export const PSSH_TOKEN_ADDRESS = '0xB5C4ecEF450fd36d0eBa1420F6A19DBfBeE5292e'
export const WPLS_TOKEN_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
export const HEX_TOKEN_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39'
export const PULSEX_ROUTER_ADDRESS = '0x165C3410fC91EF562C50559f7d2289fEbed552d9'
```

## 🚀 Next Steps

### Optional: Verify Contract on PulseScan
```bash
cd morbius_lotto/contracts
npx hardhat verify --network pulsechain \
  0xcf6094EA8f6Ea462A9bd9e30880F57c324240f83 \
  "0xB5C4ecEF450fd36d0eBa1420F6A19DBfBeE5292e" \
  "0xA1077a294dDE1B09bB078844df40758a5D0f9a27" \
  "0x165C3410fC91EF562C50559f7d2289fEbed552d9" \
  600
```

### Test the Frontend
```bash
cd morbius_lotto
npm run dev
```

Then test:
1. ✅ Connect wallet
2. ✅ View current round info
3. ✅ Select numbers
4. ✅ Toggle between pSSH and WPLS payment
5. ✅ Approve token (pSSH or WPLS)
6. ✅ Buy tickets
7. ✅ Verify tickets appear in your list

## 📊 Key Contract Functions

### For Users:
- `buyTickets(uint8[6][] tickets)` - Buy with pSSH
- `buyTicketsWithWPLS(uint8[6][] tickets)` - Buy with WPLS (auto-swap)
- `claimWinnings(uint256 roundId)` - Claim prizes
- `finalizeRound()` - Anyone can finalize expired rounds

### View Functions:
- `getCurrentRoundInfo()` - Get current round data
- `getPlayerTickets(roundId, address)` - Get user's tickets
- `getMegaMillionsBank()` - Check MegaMillions balance
- `getHexJackpot()` - Check HEX overlay balance
- `getFreeTicketCredits(address)` - Check free ticket credits
- `getClaimableWinnings(roundId, address)` - Check winnings

## 🎉 Status: READY TO USE

The V2 contract is live and the frontend is fully updated. Users can now:
- Purchase tickets with pSSH (best rate)
- Purchase tickets with WPLS (auto-swap convenience)
- Enjoy improved prize distribution
- Benefit from smart rollover mechanics
- Win bigger jackpots in high brackets

**PulseScan Link:** https://scan.pulsechain.com/address/0xcf6094EA8f6Ea462A9bd9e30880F57c324240f83
