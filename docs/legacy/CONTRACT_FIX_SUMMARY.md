# Contract Fix Summary - WPLS Swap Issue

## Problem Identified

**Location:** Line 262 in `SuperStakeLottery6of55V2.sol` (original)

**Issue:** The `buyTicketsWithWPLS()` function was failing because the `amountOutMin` parameter in the PulseX swap was set to `psshRequired`, which doesn't account for:
1. The 5.5% pSSH transfer tax
2. Potential slippage during the swap
3. Router's internal checks happening BEFORE the final transfer

## Root Cause

The PulseX router's `swapExactTokensForTokens` function checks:
```solidity
require(amounts[amounts.length - 1] >= amountOutMin, 'PulseXRouter: INSUFFICIENT_OUTPUT_AMOUNT');
```

This check happens based on the pool's calculated output, but:
- When pSSH is transferred from the pool to the contract, it gets taxed 5.5%
- The router's calculation doesn't account for this tax
- Even though we request 11.1% extra via `getAmountsIn`, the router's min check can still fail

## The Fix

**Changed Line 262-264:**
```solidity
// BEFORE:
pulseXRouter.swapExactTokensForTokens(
    wplsNeeded,
    psshRequired,  // ← This was causing failures
    path,
    address(this),
    block.timestamp + 300
);

// AFTER:
pulseXRouter.swapExactTokensForTokens(
    wplsNeeded,
    0,  // Allow any amount, we check psshReceived below
    path,
    address(this),
    block.timestamp + 300
);
```

**Why This is Safe:**
1. We still request the correct amount via `getAmountsIn(psshToRequest, path)` (line 252)
2. We measure the actual pSSH received using balance difference (line 270)
3. We verify `psshReceived >= psshRequired` after the swap (line 271)
4. The 11.1% buffer ensures we get enough even after tax

## Security Considerations

**Is `amountOutMin = 0` safe?**

YES, because:
1. ✅ We pre-calculate the expected amount via `getAmountsIn()`
2. ✅ We verify the actual received amount post-swap
3. ✅ We have a 11.1% buffer built in
4. ✅ The contract immediately checks `require(psshReceived >= psshRequired)`
5. ✅ Transaction reverts if insufficient pSSH received
6. ✅ No sandwich attack risk because we verify the exact amount needed

**Protection Against Attacks:**
- **Sandwich attacks:** Minimal risk - attacker would need to manipulate the pool significantly, and we still verify we got enough pSSH
- **Frontrunning:** Limited benefit - the buffer and post-swap check protect users
- **Price manipulation:** Would only benefit the user (they'd get more pSSH than needed)

## Testing Checklist

Before deploying to mainnet, test:
- [x] Small purchase (1 ticket) with WPLS
- [ ] Medium purchase (10 tickets) with WPLS
- [ ] Large purchase (100 tickets) with WPLS
- [ ] During high volatility / low liquidity
- [ ] With minimal WPLS (just barely enough)
- [ ] With excess WPLS (more than needed)
- [ ] Verify no pSSH is lost in the process
- [ ] Check that buffer is sufficient

## Deployment Steps

1. **Compile the fixed contract:**
   ```bash
   cd contracts
   npx hardhat compile
   ```

2. **Deploy V3 (or update V2):**
   ```bash
   npx hardhat run scripts/deploy-6of55-v2.js --network pulsechain
   ```

3. **Update frontend:**
   - Update `LOTTERY_ADDRESS` in `lib/contracts.ts`
   - Regenerate ABI if needed
   - Test WPLS payment flow

4. **Verify on PulseScan:**
   ```bash
   npx hardhat verify --network pulsechain <CONTRACT_ADDRESS> \
     "0xB5C4ecEF450fd36d0eBa1420F6A19DBfBeE5292e" \
     "0xA1077a294dDE1B09bB078844df40758a5D0f9a27" \
     "0x165C3410fC91EF562C50559f7d2289fEbed552d9" \
     600
   ```

## Alternative Solution (More Conservative)

If you prefer a more conservative approach with slippage protection:

```solidity
// Calculate minimum acceptable pSSH after tax
uint256 minPsshAfterTax = (psshRequired * 9500) / 10000; // Accept 5% slippage

pulseXRouter.swapExactTokensForTokens(
    wplsNeeded,
    minPsshAfterTax,  // 5% slippage tolerance
    path,
    address(this),
    block.timestamp + 300
);
```

This would:
- Still protect against extreme slippage
- Allow the swap to succeed even with small price movements
- Provide better UX with clear slippage limits

## Recommendation

**Use the current fix (amountOutMin = 0)** because:
1. We have robust post-swap verification
2. The 11.1% buffer is already very generous
3. Users get a better experience (fewer failures)
4. The security is equivalent due to our manual check

If issues persist after deployment, consider the alternative solution with 5% slippage tolerance.

## Files Changed

- ✅ `contracts/contracts/SuperStakeLottery6of55V2.sol` - Line 264: Changed `psshRequired` to `0`
- ✅ Added comments explaining the safety of this approach

## Status

- [x] Issue identified
- [x] Fix implemented
- [x] Ready for redeployment
- [ ] Deployed to mainnet
- [ ] Frontend updated
- [ ] Tested on mainnet
