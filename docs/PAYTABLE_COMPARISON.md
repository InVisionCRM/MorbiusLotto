# CryptoKeno Paytable vs Real Club Keno - Comparison Analysis

## Overview
Comparison between real Club Keno prize structure and your CryptoKeno contract paytables.

---

## ❌ CRITICAL DIFFERENCES FOUND

Your paytables **DO NOT MATCH** real Keno logic. There are significant discrepancies:

---

## 📊 SPOT-BY-SPOT COMPARISON

### 1-SPOT GAME
**Real Club Keno:**
- 1 of 1: $2 (2x multiplier)

**Your Contract:**
```solidity
paytable[1][1] = 3;  // 3x multiplier
```

**Status:** ❌ **INCORRECT** - Should be 2x, not 3x

---

### 2-SPOT GAME
**Real Club Keno:**
- 2 of 2: $11 (11x multiplier)

**Your Contract:**
```solidity
paytable[2][2] = 12;  // 12x multiplier
paytable[2][1] = 1;   // 1x multiplier
```

**Status:** ⚠️ **CLOSE BUT WRONG**
- 2 of 2 should be 11x, not 12x
- Real Keno doesn't pay on 1 of 2 (you shouldn't either for authenticity)

---

### 3-SPOT GAME
**Real Club Keno:**
- 3 of 3: $27 (27x multiplier)
- 2 of 3: $2 (2x multiplier)

**Your Contract:**
```solidity
paytable[3][3] = 46;  // 46x multiplier
paytable[3][2] = 5;   // 5x multiplier
paytable[3][1] = 1;   // 1x multiplier
```

**Status:** ❌ **COMPLETELY WRONG**
- 3 of 3 should be 27x, not 46x (70% too high!)
- 2 of 3 should be 2x, not 5x (150% too high!)
- Real Keno doesn't pay on 1 of 3

---

### 4-SPOT GAME
**Real Club Keno:**
- 4 of 4: $72 (72x multiplier)
- 3 of 4: $5 (5x multiplier)
- 2 of 4: $1 (1x multiplier)

**Your Contract:**
```solidity
paytable[4][4] = 130;  // 130x multiplier
paytable[4][3] = 20;   // 20x multiplier
paytable[4][2] = 2;    // 2x multiplier
```

**Status:** ❌ **ALL WRONG**
- 4 of 4 should be 72x, not 130x (81% too high!)
- 3 of 4 should be 5x, not 20x (300% too high!)
- 2 of 4 should be 1x, not 2x (100% too high!)

---

### 5-SPOT GAME
**Real Club Keno:**
- 5 of 5: $410 (410x multiplier)
- 4 of 5: $18 (18x multiplier)
- 3 of 5: $2 (2x multiplier)

**Your Contract:**
```solidity
paytable[5][5] = 800;  // 800x multiplier
paytable[5][4] = 100;  // 100x multiplier
paytable[5][3] = 15;   // 15x multiplier
paytable[5][2] = 2;    // 2x multiplier
```

**Status:** ❌ **ALL WRONG**
- 5 of 5 should be 410x, not 800x (95% too high!)
- 4 of 5 should be 18x, not 100x (456% too high!)
- 3 of 5 should be 2x, not 15x (650% too high!)
- Real Keno doesn't pay on 2 of 5

---

### 6-SPOT GAME
**Real Club Keno:**
- 6 of 6: $1,100 (1,100x multiplier)
- 5 of 6: $57 (57x multiplier)
- 4 of 6: $7 (7x multiplier)
- 3 of 6: $1 (1x multiplier)

**Your Contract:**
```solidity
paytable[6][6] = 1600;  // 1,600x multiplier
paytable[6][5] = 200;   // 200x multiplier
paytable[6][4] = 25;    // 25x multiplier
paytable[6][3] = 4;     // 4x multiplier
```

**Status:** ❌ **ALL WRONG**
- 6 of 6 should be 1,100x, not 1,600x (45% too high)
- 5 of 6 should be 57x, not 200x (251% too high!)
- 4 of 6 should be 7x, not 25x (257% too high!)
- 3 of 6 should be 1x, not 4x (300% too high!)

---

### 7-SPOT GAME
**Real Club Keno:**
- 7 of 7: $2,000 (2,000x multiplier)
- 6 of 7: $100 (100x multiplier)
- 5 of 7: $11 (11x multiplier)
- 4 of 7: $5 (5x multiplier)
- 3 of 7: $1 (1x multiplier)

**Your Contract:**
```solidity
paytable[7][7] = 7000;  // 7,000x multiplier
paytable[7][6] = 500;   // 500x multiplier
paytable[7][5] = 50;    // 50x multiplier
paytable[7][4] = 5;     // 5x multiplier (CORRECT!)
```

**Status:** ❌ **MOSTLY WRONG**
- 7 of 7 should be 2,000x, not 7,000x (250% too high!)
- 6 of 7 should be 100x, not 500x (400% too high!)
- 5 of 7 should be 11x, not 50x (355% too high!)
- 4 of 7 is CORRECT at 5x ✅
- Missing 3 of 7 payout (should be 1x)

---

### 8-SPOT GAME
**Real Club Keno:**
- 8 of 8: $10,000 (10,000x multiplier)
- 7 of 8: $300 (300x multiplier)
- 6 of 8: $50 (50x multiplier)
- 5 of 8: $15 (15x multiplier)
- 4 of 8: $2 (2x multiplier)

**Your Contract:**
```solidity
paytable[8][8] = 10000;  // 10,000x multiplier (CORRECT!)
paytable[8][7] = 1000;   // 1,000x multiplier
paytable[8][6] = 150;    // 150x multiplier
paytable[8][5] = 15;     // 15x multiplier (CORRECT!)
paytable[8][4] = 2;      // 2x multiplier (CORRECT!)
```

**Status:** ⚠️ **PARTIALLY CORRECT**
- 8 of 8 is CORRECT at 10,000x ✅
- 7 of 8 should be 300x, not 1,000x (233% too high!)
- 6 of 8 should be 50x, not 150x (200% too high!)
- 5 of 8 is CORRECT at 15x ✅
- 4 of 8 is CORRECT at 2x ✅

---

### 9-SPOT GAME
**Real Club Keno:**
- 9 of 9: $25,000 (25,000x multiplier)
- 8 of 9: $2,000 (2,000x multiplier)
- 7 of 9: $100 (100x multiplier)
- 6 of 9: $20 (20x multiplier)
- 5 of 9: $5 (5x multiplier)
- 4 of 9: $2 (2x multiplier)

**Your Contract:**
```solidity
paytable[9][9] = 30000;  // 30,000x multiplier
paytable[9][8] = 4000;   // 4,000x multiplier
paytable[9][7] = 400;    // 400x multiplier
paytable[9][6] = 50;     // 50x multiplier
paytable[9][5] = 6;      // 6x multiplier
```

**Status:** ❌ **ALL WRONG**
- 9 of 9 should be 25,000x, not 30,000x (20% too high)
- 8 of 9 should be 2,000x, not 4,000x (100% too high!)
- 7 of 9 should be 100x, not 400x (300% too high!)
- 6 of 9 should be 20x, not 50x (150% too high!)
- 5 of 9 should be 5x, not 6x (20% too high)
- Missing 4 of 9 payout (should be 2x)

---

### 10-SPOT GAME
**Real Club Keno:**
- 10 of 10: $100,000 (100,000x multiplier)
- 9 of 10: $5,000 (5,000x multiplier)
- 8 of 10: $500 (500x multiplier)
- 7 of 10: $50 (50x multiplier)
- 6 of 10: $10 (10x multiplier)
- 5 of 10: $2 (2x multiplier)
- 0 of 10: $5 (5x multiplier) - **SPECIAL BONUS**

**Your Contract:**
```solidity
paytable[10][10] = 100000;  // 100,000x multiplier (CORRECT!)
paytable[10][9] = 10000;    // 10,000x multiplier
paytable[10][8] = 1000;     // 1,000x multiplier
paytable[10][7] = 100;      // 100x multiplier
paytable[10][6] = 10;       // 10x multiplier (CORRECT!)
paytable[10][5] = 5;        // 5x multiplier
```

**Status:** ❌ **MOSTLY WRONG + MISSING SPECIAL**
- 10 of 10 is CORRECT at 100,000x ✅
- 9 of 10 should be 5,000x, not 10,000x (100% too high!)
- 8 of 10 should be 500x, not 1,000x (100% too high!)
- 7 of 10 should be 50x, not 100x (100% too high!)
- 6 of 10 is CORRECT at 10x ✅
- 5 of 10 should be 2x, not 5x (150% too high!)
- **MISSING: 0 of 10 should pay 5x** (special consolation prize)

---

## 🚨 MISSING FEATURES FROM REAL KENO

### 1. **Zero-Hit Consolation Prize**
Real Keno pays 10-spot players who miss ALL numbers:
- **0 of 10: $5** (odds 1 in 21.84)

This is a psychological feature - "you lost so bad you won!" Your contract doesn't implement this.

---

## 📉 ECONOMIC IMPACT ANALYSIS

### Overall, Your Paytables Are:
- **~100-300% HIGHER** than real Club Keno
- This makes the game **massively unprofitable** for the house
- Your RTP (Return to Player) is likely **>100%**, meaning players profit long-term

### Example:
**4-Spot Game:**
- Real payout: 72x for 4 of 4
- Your payout: 130x for 4 of 4
- **You pay 81% more than real Keno**

With 1000 players:
- Real Keno house edge: ~25% (house profits)
- Your Keno house edge: **NEGATIVE** (house loses money)

---

## ✅ CORRECT REAL KENO PAYTABLES

Here's what your contract SHOULD use (ignoring dollar amounts, just multipliers):

```solidity
function _initDefaultPaytables() internal {
    // 1-SPOT
    paytable[1][1] = 2;

    // 2-SPOT
    paytable[2][2] = 11;
    // No payout for 1 of 2

    // 3-SPOT
    paytable[3][3] = 27;
    paytable[3][2] = 2;
    // No payout for 1 of 3

    // 4-SPOT
    paytable[4][4] = 72;
    paytable[4][3] = 5;
    paytable[4][2] = 1;

    // 5-SPOT
    paytable[5][5] = 410;
    paytable[5][4] = 18;
    paytable[5][3] = 2;
    // No payout for 2 of 5

    // 6-SPOT
    paytable[6][6] = 1100;
    paytable[6][5] = 57;
    paytable[6][4] = 7;
    paytable[6][3] = 1;

    // 7-SPOT
    paytable[7][7] = 2000;
    paytable[7][6] = 100;
    paytable[7][5] = 11;
    paytable[7][4] = 5;
    paytable[7][3] = 1;

    // 8-SPOT
    paytable[8][8] = 10000;
    paytable[8][7] = 300;
    paytable[8][6] = 50;
    paytable[8][5] = 15;
    paytable[8][4] = 2;

    // 9-SPOT
    paytable[9][9] = 25000;
    paytable[9][8] = 2000;
    paytable[9][7] = 100;
    paytable[9][6] = 20;
    paytable[9][5] = 5;
    paytable[9][4] = 2;

    // 10-SPOT
    paytable[10][10] = 100000;
    paytable[10][9] = 5000;
    paytable[10][8] = 500;
    paytable[10][7] = 50;
    paytable[10][6] = 10;
    paytable[10][5] = 2;
    paytable[10][0] = 5;  // SPECIAL: Zero hits pays!
}
```

---

## 🎯 RECOMMENDATION

**Your current paytables are NOT based on real Club Keno.**

### Options:

1. **Use Real Club Keno Paytables** (recommended for authenticity)
   - Adjust contract to match real values above
   - Players will recognize familiar payouts
   - Proven sustainable house edge

2. **Keep Your Custom Paytables** (if intentional)
   - Accept that payouts are ~2-3x higher than real Keno
   - Requires MASSIVE bankroll to cover big wins
   - May be unprofitable long-term
   - Should rebrand as "Premium Keno" or "High Payout Keno"

3. **Hybrid Approach**
   - Use real multipliers for common hits (4-7 spot)
   - Keep higher multipliers for rare hits (8-10 of 10)
   - Balance profitability with excitement

---

## 🔴 CRITICAL CONTRACT ISSUE

**Zero-Hit Payout Not Implemented:**

Your contract doesn't support `paytable[10][0]` (0 hits out of 10).

The paytable is indexed by `hits`, and there's no code path to pay for 0 hits:

```solidity
uint256 basePrize = ticket.wagerPerDraw * paytable[ticket.spotSize][hits];
```

If `hits = 0`, `paytable[10][0]` would need to be set, but your initialization doesn't include it.

**To fix:** You'd need to add special logic in `_processClaimInternal()` to check for 10-spot with 0 hits.

---

## 📊 SUMMARY

| Aspect | Real Club Keno | Your Contract | Status |
|--------|----------------|---------------|--------|
| Payout Multipliers | Standard | 100-300% Higher | ❌ TOO HIGH |
| Missing Payouts | None | Several (1 of 2, 1 of 3, etc.) | ⚠️ EXTRA |
| Zero-Hit Bonus | Yes (10-spot) | No | ❌ MISSING |
| Game Logic | Proven profitable | Likely unprofitable | ⚠️ RISKY |

**Verdict:** Your paytables **DO NOT MATCH** real Keno. They're significantly more generous, which makes the game unsustainable unless you have a large bankroll and are okay with lower house edge.
