# Contract Analysis - SuperStakeLottery6of55 V2

## Critical Issues Found

### 🚨 CRITICAL: Incorrect Buffer Calculation in `buyTicketsWithWPLS()` (Line 246)

**Location:** Line 246 in `SuperStakeLottery6of55V2.sol`

**Current Code:**
```solidity
uint256 psshToRequest = (psshRequired * WPLS_SWAP_BUFFER_PCT) / TOTAL_PCT;
```

**Problem:**
- `WPLS_SWAP_BUFFER_PCT = 11100` (111.1% in basis points)
- `TOTAL_PCT = 10000` (100% in basis points)
- This calculates: `psshRequired * 1.111` which means **111.1% of the required amount**
- But the buffer should be **adding 11.1% ON TOP**, not making it 111.1% of the original

**Example:**
- User needs: 10 pSSH
- Current calculation: `10 * 11100 / 10000 = 11.1 pSSH` ✅ (this is actually correct!)

**Wait, let me recalculate...**
Actually, looking at this more carefully:
- If we need 10 pSSH
- `(10 * 11100) / 10000 = 11.1 pSSH`
- This IS adding 11.1% extra (10 * 1.111 = 11.1)

So this line is actually **CORRECT**. The issue must be elsewhere.

---

## Potential Issues

### 1. ⚠️ PulseX Router Swap May Fail Due to Slippage

**Location:** Lines 260-266

**Code:**
```solidity
pulseXRouter.swapExactTokensForTokens(
    wplsNeeded,
    psshRequired,  // ← This is the minimum amount out
    path,
    address(this),
    block.timestamp + 300
);
```

**Issue:**
- `amountOutMin` is set to `psshRequired` (exact amount needed)
- But with 5.5% pSSH tax on transfers, the actual amount received will be LESS
- The swap itself will receive the full amount, but when it transfers to the contract, 5.5% is taxed
- This will cause the swap to revert with "INSUFFICIENT_OUTPUT_AMOUNT"

**Solution:**
We need to request MORE pSSH from the swap to account for the transfer tax:
```solidity
// Account for tax on the transfer TO the contract
uint256 psshBeforeTax = (psshRequired * 10000) / (10000 - 550); // Request ~5.8% more
```

---

### 2. ⚠️ Double Tax Accounting Issue

**Location:** Lines 244-269

**Problem Flow:**
1. User needs 10 pSSH after tax
2. Contract requests: `10 * 1.111 = 11.1 pSSH` from router (line 246)
3. Router swap gets WPLS from user and swaps for pSSH
4. Router transfers pSSH to contract → **5.5% tax applied** → Contract receives ~10.5 pSSH
5. Check on line 269: `require(psshReceived >= psshRequired)`
   - Requires: 10 pSSH
   - Received: ~10.5 pSSH
   - ✅ Passes

**BUT WAIT** - there's still an issue:
- Line 252: `getAmountsIn(psshToRequest, path)` asks router how much WPLS needed to GET 11.1 pSSH
- The router calculates based on reserves WITHOUT accounting for the tax
- So the router will calculate WPLS needed to OUTPUT 11.1 pSSH from the pool
- But when that 11.1 pSSH is transferred to our contract, it becomes ~10.5 pSSH
- This should still work, but it's close to the edge

---

### 3. 🔍 Potential Race Condition with `psshBefore`

**Location:** Line 258

**Code:**
```solidity
uint256 psshBefore = pSSH_TOKEN.balanceOf(address(this));
```

**Potential Issue:**
- If the contract already holds pSSH from previous rounds/operations, this is fine
- But the balance check relies on the difference before/after swap
- If someone sends pSSH directly to the contract during the transaction, it would be counted as "received from swap"
- This is unlikely but possible with a frontrun attack

**Not Critical:** Just something to be aware of

---

### 4. ⚠️ `amountOutMin` Should Account for Tax

**Location:** Line 262

**THE REAL ISSUE:**

When calling `swapExactTokensForTokens`:
```solidity
pulseXRouter.swapExactTokensForTokens(
    wplsNeeded,           // Amount of WPLS to swap
    psshRequired,         // Minimum pSSH to receive (10 pSSH)
    path,
    address(this),
    block.timestamp + 300
);
```

The PulseX router will:
1. Take `wplsNeeded` WPLS from the contract
2. Swap in the pool
3. Transfer pSSH to `address(this)`
4. **During step 3, the pSSH transfer is taxed 5.5%**

So if the pool calculates it should send 10.6 pSSH:
- Pool sends: 10.6 pSSH
- Tax applied: 10.6 * 0.945 = 10.017 pSSH received
- Check: `10.017 >= 10` ✅ Passes (barely)

But if there's any price slippage or rounding, this could fail.

**The Fix:**
```solidity
// Account for 5.5% tax on transfer
uint256 minPsshAfterTax = (psshRequired * 10000) / (10000 - 550);

pulseXRouter.swapExactTokensForTokens(
    wplsNeeded,
    minPsshAfterTax,  // Request more to account for tax
    path,
    address(this),
    block.timestamp + 300
);
```

---

## Root Cause Analysis

The transaction is likely failing because:

1. **Line 246** requests 11.1% extra pSSH from `getAmountsIn`
2. **Line 252** calculates WPLS needed to get that amount from the pool
3. **Line 260-266** executes the swap with `amountOutMin = psshRequired` (10 pSSH)
4. **The pool output is taxed 5.5% on transfer**
5. If the pool output is close to 10.6 pSSH, after tax it becomes ~10 pSSH
6. But any small slippage causes it to fail the `amountOutMin` check

---

## Recommended Fixes

### Fix 1: Adjust `amountOutMin` to account for tax (CRITICAL)

```solidity
// Line 262 - Change from:
psshRequired,

// To:
(psshRequired * 10000) / (10000 - 550),  // Account for 5.5% tax
```

### Fix 2: Increase buffer percentage

```solidity
// Line 72 - Change from:
uint256 public constant WPLS_SWAP_BUFFER_PCT = 11100; // 11.1% extra

// To:
uint256 public constant WPLS_SWAP_BUFFER_PCT = 12000; // 20% extra (safer)
```

### Fix 3: Better error handling

Add a more descriptive error message:
```solidity
require(psshReceived >= psshRequired, "Insufficient pSSH after swap and tax");
```

---

## Testing Checklist

After deploying the fix:
- [ ] Test with 1 ticket purchase
- [ ] Test with 10 tickets
- [ ] Test with 100 tickets (max)
- [ ] Test during high volatility periods
- [ ] Test with different WPLS amounts
- [ ] Monitor for slippage failures
- [ ] Check actual pSSH received vs expected

---

## Summary

**Most Likely Cause of Failure:**
The `amountOutMin` parameter in the swap (line 262) doesn't account for the 5.5% transfer tax on pSSH. The swap succeeds in getting pSSH from the pool, but when it's transferred to the contract, the tax is applied, resulting in less than `psshRequired`, causing the swap to revert.

**Immediate Fix Needed:**
Line 262: Change `psshRequired` to `(psshRequired * 10000) / (10000 - 550)` to account for the tax on the transfer.
