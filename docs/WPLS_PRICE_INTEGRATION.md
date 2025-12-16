# WPLS/pSSH Price Integration

## Overview
Implemented real-time WPLS to pSSH price conversion using the PulseX liquidity pool as the primary source, with DexScreener API as a fallback.

## Implementation Details

### New Hook: `use-wpls-price.ts`

**Location:** `/hooks/use-wpls-price.ts`

**Features:**
1. **Primary Source:** Fetches reserves from PulseX V2 pair (`0x9977e170C9B6E544302E8DB0Cf01D12D55555289`)
   - Reads `token0`, `token1`, and `getReserves()` from the pair contract
   - Calculates WPLS per pSSH accounting for decimal differences (WPLS: 18, pSSH: 9)
   - Formula: `(wplsReserve * 1e9) / psshReserve`
   - Refetches every 30 seconds for up-to-date prices

2. **Fallback Source:** DexScreener API
   - Used when PulseX reserves are unavailable or error occurs
   - Endpoint: `https://api.dexscreener.com/latest/dex/pairs/pulsechain/{pairAddress}`

3. **Safety Fallback:** 2x multiplier
   - Used when both primary and fallback sources fail
   - Ensures users can still purchase even if price data is unavailable

### Helper Function: `calculateWplsAmount()`

**Purpose:** Calculate the exact WPLS amount needed for a given pSSH amount

**Parameters:**
- `psshAmount` - Amount of pSSH needed (in base units, 9 decimals)
- `wplsPerPssh` - Price from `useWplsPrice()` hook
- `bufferPercent` - Default 11.1% (5.5% tax + 5% slippage + buffer)

**Calculation:**
```typescript
// Base WPLS needed
const baseWpls = (psshAmount * wplsPerPssh) / 1e9

// Add buffer for tax and slippage
const buffer = 1110 // 11.1%
const wplsWithBuffer = (baseWpls * (10000 + buffer)) / 10000
```

### Updated Component: `purchase-summary-modal.tsx`

**Changes:**
1. Imported `useWplsPrice` and `calculateWplsAmount` hooks
2. Replaced hardcoded `psshCost * 2n` with dynamic price calculation
3. Added price source indicator showing whether price is from "PulseX Pool" or "DexScreener"
4. Added loading indicator when price is updating
5. Added warning message when using fallback price estimate

**UI Indicators:**
```typescript
Price from: PulseX Pool (updating...)
⚠ Using fallback price estimate (2x buffer)  // Only shown on error
```

## Contract Addresses

- **WPLS/pSSH Pair:** `0x9977e170C9B6E544302E8DB0Cf01D12D55555289`
- **WPLS Token:** `0xA1077a294dDE1B09bB078844df40758a5D0f9a27`
- **pSSH Token:** `0xB5C4ecEF450fd36d0eBa1420F6A19DBfBeE5292e`

## Testing

To verify the price calculation is working:

1. Open the lottery app in dev mode
2. Select WPLS as payment method
3. Pick numbers and click "Play Tickets"
4. In the purchase modal, check:
   - The WPLS amount is dynamically calculated (not just 2x pSSH)
   - Price source is displayed ("PulseX Pool" or "DexScreener")
   - Amount updates if you change ticket quantity

## Benefits

1. **Accurate Pricing:** Users see the exact WPLS amount needed based on current market rates
2. **Better UX:** No overpaying with excessive buffers
3. **Reliability:** Multiple fallback layers ensure purchases always work
4. **Transparency:** Users see where the price data comes from
5. **Real-time Updates:** Price refreshes every 30 seconds

## Edge Cases Handled

1. **No liquidity data:** Falls back to DexScreener API
2. **API failure:** Falls back to 2x multiplier
3. **Zero reserves:** Handles division by zero gracefully
4. **Token ordering:** Correctly identifies which reserve is WPLS vs pSSH
5. **Decimal differences:** Properly converts between 18-decimal (WPLS) and 9-decimal (pSSH) tokens

## Files Modified

1. ✅ `/hooks/use-wpls-price.ts` - New file
2. ✅ `/components/lottery/purchase-summary-modal.tsx` - Updated to use real-time pricing

## Next Steps (Optional)

- Add price impact warning if WPLS amount is unusually high
- Show price history/chart for user reference
- Add manual refresh button for price data
- Display current exchange rate prominently
