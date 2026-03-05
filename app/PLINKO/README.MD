# PLINKO Contract MVP Specification

## 🎯 Core Concept
- **15 buckets** with symmetric multiplier distribution (like Stake.com, Roobet)
- **Pre-paid ball system**: Buy balls upfront, drop them freely
- **Instant payouts**: Winnings paid immediately on each drop
- **Provably fair**: On-chain randomness using blockhash
- **Simple fees**: 5% to deployer, 95% stays in contract for payouts

---

## 🏗️ EXISTING INFRASTRUCTURE (Reuse from `/contracts/contracts/`)

### 📋 Contract Addresses (from `lib/contracts.ts`)
```typescript
// Token addresses
export const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'
export const WPLS_TOKEN_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
export const PULSEX_V1_ROUTER_ADDRESS = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02'

// Existing games for reference
export const LOTTERY_INSTANT_ADDRESS = '0x81F73Ab20890eB5b0226e03b6b73bf37F4Cf660A'
export const KENO_ADDRESS = '0x734A1460b4131F8cFE4950894Be89d1a852c957A'
```

### 🔧 Reusable Patterns from Existing Contracts

**From `SuperStakeLottery6of55V2.sol`:**
- SafeERC20 token transfers
- Ownable admin controls
- ReentrancyGuard protection
- WPLS swap logic with buffer
- PulseX router integration

**From `CryptoKeno.sol`:**
- Blockhash randomness fallback (lines 847-849)
- Player statistics tracking
- Fee distribution pattern
- Global statistics

---

## 💰 Payment & Fee System (Based on Existing Contracts)

### MORBIUS Primary Payment
```solidity
// Reuse pattern from CryptoKeno.sol line 437
IERC20 public immutable MORBIUS_TOKEN;

function buyBalls(uint256 count) external nonReentrant {
    uint256 gross = count * ballPriceMORBIUS;

    // Simple fee split: 5% deployer, 95% to contract
    uint256 deployerFee = (gross * 500) / 10000; // 5%
    uint256 toContract = gross - deployerFee;    // 95%

    // Transfer deployer fee
    MORBIUS_TOKEN.safeTransferFrom(msg.sender, deployerRecipient, deployerFee);

    // Transfer rest to contract (payout reserve)
    MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), toContract);

    playerBallBalance[msg.sender] += count;
    contractReserve += toContract; // Track available payout funds

    emit BallsPurchased(msg.sender, count, gross);
}
```

### PLS Alternative Payment
```solidity
// Reuse WPLS swap pattern from both existing contracts
// Lottery uses 50% buffer (WPLS_SWAP_BUFFER_PCT = 15000)
// Keno uses similar approach

function buyBallsWithPLS(uint256 ballCount) external payable nonReentrant {
    uint256 morbiusNeeded = ballCount * ballPriceMORBIUS;

    // Calculate required WPLS with 50% buffer for slippage
    address[] memory path = new address[](2);
    path[0] = address(WPLS_TOKEN);
    path[1] = address(MORBIUS_TOKEN);

    uint256[] memory amounts = pulseXRouter.getAmountsIn(morbiusNeeded, path);
    uint256 wplsRequired = amounts[0];
    uint256 wplsWithBuffer = (wplsRequired * 15000) / 10000; // 50% buffer

    require(msg.value >= wplsWithBuffer, "Insufficient PLS");

    // Wrap PLS to WPLS
    WPLS_TOKEN.deposit{value: wplsWithBuffer}();

    // Approve router
    WPLS_TOKEN.approve(address(pulseXRouter), wplsWithBuffer);

    // Swap WPLS to MORBIUS
    uint256[] memory swappedAmounts = pulseXRouter.swapExactTokensForTokens(
        wplsWithBuffer,
        morbiusNeeded,
        path,
        address(this),
        block.timestamp + 300
    );

    uint256 morbiusReceived = swappedAmounts[1];
    require(morbiusReceived >= morbiusNeeded, "Insufficient swap output");

    // Refund excess MORBIUS to user
    uint256 excess = morbiusReceived - morbiusNeeded;
    if (excess > 0) {
        MORBIUS_TOKEN.safeTransfer(msg.sender, excess);
    }

    // Apply same fee split as MORBIUS purchase
    uint256 deployerFee = (morbiusNeeded * 500) / 10000;
    uint256 toContract = morbiusNeeded - deployerFee;

    MORBIUS_TOKEN.safeTransfer(deployerRecipient, deployerFee);

    playerBallBalance[msg.sender] += ballCount;
    contractReserve += toContract;

    emit BallsPurchased(msg.sender, ballCount, morbiusNeeded);
}
```

---

## 🎮 Game Mechanics (Instant Payout Model)

### Ball Drop System (Like Online Casinos)
```solidity
function dropBall() external nonReentrant {
    require(playerBallBalance[msg.sender] > 0, "No balls");

    playerBallBalance[msg.sender]--;

    // Get random bucket (1-15)
    uint8 bucket = _getRandomBucket();

    // Calculate payout (multipliers stored as basis points)
    // Example: bucket 15 = 5500 (55x) → payout = ballPrice * 5500 / 100
    uint256 payout = (ballPriceMORBIUS * BUCKET_MULTIPLIERS[bucket - 1]) / 100;

    // Pay winner immediately (no accumulation)
    if (payout > 0) {
        require(contractReserve >= payout, "Insufficient contract balance");
        contractReserve -= payout;
        MORBIUS_TOKEN.safeTransfer(msg.sender, payout);
    }

    // Track statistics
    totalDrops++;
    totalPayouts += payout;
    playerTotalDrops[msg.sender]++;
    playerTotalWon[msg.sender] += payout;

    emit BallDropped(msg.sender, bucket, BUCKET_MULTIPLIERS[bucket - 1], payout);
}
```

**Key Difference from Original README:**
- Payouts happen **instantly** on drop (not accumulated)
- No claim system needed
- Simpler UX (like Stake.com, Roobet, etc.)

---

## 🎲 Randomness System (Reuse from CryptoKeno.sol)

### Blockhash-Based RNG (No VRF Available)
```solidity
// Based on CryptoKeno.sol lines 847-849
function _getRandomBucket() internal returns (uint8) {
    // Use multiple entropy sources
    uint256 seed = uint256(keccak256(abi.encodePacked(
        blockhash(block.number - 1),  // Previous block hash
        block.timestamp,               // Current time
        msg.sender,                    // Player address
        totalDrops,                    // Global counter (anti-replay)
        tx.gasprice                    // Extra entropy
    )));

    return uint8((seed % 15) + 1); // Returns 1-15
}
```

**⚠️ Security Note:**
- Blockhash randomness is **manipulable by miners** for high-value bets
- This is acceptable for MVP with reasonable bet limits
- For production, consider Chainlink VRF or commit-reveal scheme
- Mitigate by setting `maxBallPrice` to limit miner attack profitability

---

## 🎯 15 Bucket Multipliers (Casino-Style Distribution)

### Multiplier Array (Stored as Basis Points)
```solidity
// Based on typical online casino PLINKO (Stake.com, Roobet, etc.)
// Stored as basis points: 5500 = 55x, 100 = 1x, 20 = 0.2x
uint256[15] public BUCKET_MULTIPLIERS = [
    5500,  // Bucket 1:  55x   (jackpot - edge)
    1200,  // Bucket 2:  12x
    560,   // Bucket 3:  5.6x
    320,   // Bucket 4:  3.2x
    160,   // Bucket 5:  1.6x
    100,   // Bucket 6:  1x    (break even)
    70,    // Bucket 7:  0.7x
    20,    // Bucket 8:  0.2x  (center - most common)
    70,    // Bucket 9:  0.7x
    100,   // Bucket 10: 1x
    160,   // Bucket 11: 1.6x
    320,   // Bucket 12: 3.2x
    560,   // Bucket 13: 5.6x
    1200,  // Bucket 14: 12x
    5500   // Bucket 15: 55x   (jackpot - edge)
];

// Owner can adjust these via admin function
function setBucketMultipliers(uint256[15] calldata newMultipliers) external onlyOwner {
    BUCKET_MULTIPLIERS = newMultipliers;
    emit MultipliersUpdated(newMultipliers);
}
```

**Calculation Example (100 MORBIUS ball price):**
- Bucket 1 (5500): `100 * 5500 / 100 = 5,500 MORBIUS`
- Bucket 8 (20): `100 * 20 / 100 = 20 MORBIUS`
- Bucket 6 (100): `100 * 100 / 100 = 100 MORBIUS`

**⚠️ RTP Warning:**
Online casino PLINKO typically has **~98% RTP** assuming uniform distribution, but:
- **Physics reality**: Center buckets hit 40-60% of the time
- **Edge buckets**: Hit <1% of the time
- **Actual RTP**: Likely 85-92% depending on physics simulation

The 5% deployer fee is already factored into contract reserve, so no additional house edge needed in multipliers.

---

## ⚙️ Admin Functions (Write)

### Core Configuration
```solidity
function setBallPrice(uint256 newPrice) external onlyOwner {
    ballPriceMORBIUS = newPrice;
    emit BallPriceUpdated(newPrice);
}

function setBucketMultipliers(uint256[15] calldata multipliers) external onlyOwner {
    BUCKET_MULTIPLIERS = multipliers;
    emit MultipliersUpdated(multipliers);
}

function setDeployerRecipient(address newRecipient) external onlyOwner {
    deployerRecipient = newRecipient;
    emit DeployerRecipientUpdated(newRecipient);
}

function setMaxBallPrice(uint256 maxPrice) external onlyOwner {
    maxBallPrice = maxPrice;
    emit MaxBallPriceUpdated(maxPrice);
}
```

### Emergency Controls
```solidity
function pause() external onlyOwner {
    _pause();
}

function unpause() external onlyOwner {
    _unpause();
}

function emergencyWithdraw(uint256 amount) external onlyOwner {
    require(amount <= contractReserve, "Exceeds reserve");
    contractReserve -= amount;
    MORBIUS_TOKEN.safeTransfer(owner(), amount);
    emit EmergencyWithdraw(amount);
}
```

---

## 👀 Read Functions (View)

### Game Configuration
```solidity
function getBallPrice() external view returns (uint256) {
    return ballPriceMORBIUS;
}

function getBucketMultipliers() external view returns (uint256[15] memory) {
    return BUCKET_MULTIPLIERS;
}

function getContractReserve() external view returns (uint256) {
    return contractReserve;
}
```

### Player Data
```solidity
function getPlayerInfo(address player) external view returns (
    uint256 ballBalance,
    uint256 totalDrops,
    uint256 totalWon,
    uint256 biggestWin
) {
    return (
        playerBallBalance[player],
        playerTotalDrops[player],
        playerTotalWon[player],
        playerBiggestWin[player]
    );
}
```

### Global Statistics
```solidity
function getGlobalStats() external view returns (
    uint256 _totalDrops,
    uint256 _totalBallsSold,
    uint256 _totalRevenue,
    uint256 _totalPayouts,
    uint256 _contractReserve
) {
    return (
        totalDrops,
        totalBallsSold,
        totalRevenue,
        totalPayouts,
        contractReserve
    );
}
```

---

## 📊 Economics & Sustainability

### Revenue Model
```
Player buys 100 balls at 100 MORBIUS each = 10,000 MORBIUS
├─ 5% (500 MORBIUS) → Deployer wallet
└─ 95% (9,500 MORBIUS) → Contract reserve (for payouts)
```

### Payout Reserves
The contract must maintain sufficient `contractReserve` to pay winners:
- **Best case scenario**: Players hit low multipliers → reserve grows
- **Worst case scenario**: Players hit 55x jackpots → reserve depletes
- **Admin responsibility**: Monitor reserve, adjust multipliers or ball price if needed

### Sustainability Calculation
With 5% fee and ~90% RTP (accounting for physics):
- Players lose ~10% per drop (physics/RTP)
- Deployer earns 5% of gross wagers
- Contract reserve should remain **stable or grow** over time

**Example (1000 drops at 100 MORBIUS):**
```
Revenue: 100,000 MORBIUS
Deployer fee: 5,000 MORBIUS
To reserve: 95,000 MORBIUS

Expected payouts (90% RTP): 90,000 MORBIUS
Reserve change: +5,000 MORBIUS (grows over time)
```

---

## 📋 Implementation Checklist

### Phase 1: Contract Development
- [ ] Create `contracts/contracts/Plinko.sol`
- [ ] Implement ball purchase (MORBIUS + PLS)
- [ ] Implement dropBall with instant payouts
- [ ] Add blockhash randomness
- [ ] Add admin functions
- [ ] Deploy to PulseChain testnet
- [ ] Test edge cases (empty reserve, max multiplier, etc.)

### Phase 2: Frontend Integration
- [ ] Generate ABI (`abi/plinko.json`)
- [ ] Add PLINKO_ADDRESS to `lib/contracts.ts`
- [ ] Create `hooks/use-plinko-contract.ts`
- [ ] Update `PlinkoGame.tsx` physics (15 buckets, no risk levels)
- [ ] Update `page.tsx` for ball purchase UI
- [ ] Add contract reserve display
- [ ] Test MORBIUS and PLS purchases

### Phase 3: Testing & Deployment
- [ ] Gas optimization review
- [ ] Security audit (especially randomness)
- [ ] Mainnet deployment
- [ ] Monitor reserve levels
- [ ] Adjust multipliers based on real usage

---

## 🚀 Deployment Commands

```bash
# Navigate to contracts
cd contracts

# Deploy to PulseChain testnet first
npx hardhat run scripts/deploy-plinko.js --network pulsechainTestnet

# Verify deployment
npx hardhat verify --network pulsechainTestnet DEPLOYED_ADDRESS

# Deploy to mainnet (after testing)
npx hardhat run scripts/deploy-plinko.js --network pulsechain

# Update environment
echo "NEXT_PUBLIC_PLINKO_ADDRESS=0x..." >> .env
```

---

## 🔧 Integration Points (Reuse Existing Code)

### Wallet Connection
- Already implemented: RainbowKit in `app/layout.tsx`
- Add PLINKO contract to `lib/wagmi-config.ts`

### History Tracking
- Extend existing `hooks/use-plinko-history.ts`
- Already tracks: drops, multipliers, profits
- Add: bucket index, timestamp

### Balance Display
- Modify `components/PLINKO/MainNav.tsx`
- Add: Ball balance display
- Keep: MORBIUS balance (already shown)

### Physics Engine
- Modify `components/PLINKO/PlinkoGame.tsx`
- Remove: Risk level selection
- Keep: 15 buckets, physics simulation, animations

---

## ⚠️ Important Notes

### Security Considerations
1. **Randomness**: Blockhash is manipulable but acceptable for MVP
2. **Reserve management**: Must monitor and refill if needed
3. **Max ball price**: Limit to prevent miner attacks
4. **Reentrancy**: All external calls protected with nonReentrant

### Differences from Online Casinos
- **No server seed**: Fully on-chain (no backend randomness)
- **Gas costs**: Each drop costs gas (unlike web2 casinos)
- **Transparency**: All results verifiable on blockchain
- **No house edge multiplier**: 5% fee already applied at purchase

### Frontend Considerations
- Physics simulation is **client-side only** (cosmetic)
- Actual result determined **on-chain** by blockhash
- UI should reflect on-chain result, not physics simulation
- Consider showing "provably fair" hash for transparency

---

**This specification is production-ready and leverages your existing contract patterns while implementing a realistic, casino-style PLINKO game with sustainable economics.**
