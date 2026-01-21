# Blackjack Contract Function Analysis

## Contract Address
`0x0ab9C51d0e8d4C983D5051c8fe89A9e9A7f4BB76` (Deployed at block 25576188)

## Issue
Error: `Function "depositMORBIUS" not found on ABI`

## Analysis Results

### ✅ Functions Required by Frontend (from hooks/use-blackjack-contract.ts)

| Function Name | Purpose | Status in ABI | Status in Contract Code |
|--------------|---------|---------------|------------------------|
| `getPlayerReserve` | Get player's MORBIUS reserve | ✅ Present | ✅ Present |
| `totalReserves` | Get total contract reserves | ✅ Present | ✅ Present |
| `emergencyPaused` | Check if emergency pause is active | ✅ Present | ✅ Present |
| `getDailyWithdrawalInfo` | Get daily withdrawal limits | ✅ Present | ✅ Present |
| `deposit` | Deposit PLS (auto-swap to MORBIUS) | ✅ Present | ✅ Present |
| `depositMORBIUS` | Deposit MORBIUS directly | ✅ Present | ✅ Present |
| `withdraw` | Withdraw MORBIUS from reserve | ✅ Present | ✅ Present |
| `revealServerSeed` | Reveal server seed for verification | ✅ Present | ✅ Present |

### ✅ All Functions Present in Contract Code (Blackjack.sol)

The contract code includes all required functions:
- `deposit()` - Line 172
- `depositMORBIUS(uint256 amount)` - Line 213 ⚠️ **CRITICAL**
- `withdraw(uint256 amount)` - Line 227
- `getPlayerReserve(address player)` - Line 352
- `totalReserves` - Public mapping
- `emergencyPaused` - Public variable
- `getDailyWithdrawalInfo(address player)` - Line 366
- `revealServerSeed(bytes32 serverSeed)` - Line 310

### ✅ All Functions Present in ABI (abi/blackjack.ts)

The ABI includes all required functions:
- `deposit` - Line 438
- `depositMORBIUS` - Line 451 ⚠️ **CRITICAL**
- `withdraw` - Line 774
- `getPlayerReserve` - Line 532
- `totalReserves` - Line 735
- `emergencyPaused` - Line 471
- `getDailyWithdrawalInfo` - Line 503
- `revealServerSeed` - Line 642

## Root Cause

The error indicates that the **deployed contract** at `0x0ab9C51d0e8d4C983D5051c8fe89A9e9A7f4BB76` does **NOT** have the `depositMORBIUS` function, even though:
1. ✅ The function exists in the current contract code (`Blackjack.sol`)
2. ✅ The function exists in the ABI (`abi/blackjack.ts`)
3. ❌ The function does **NOT** exist in the deployed contract

This means the contract was deployed from an **older version** of the code that didn't include `depositMORBIUS`.

## Solution

### Option 1: Redeploy Contract (Recommended)

Redeploy the contract with the latest code that includes `depositMORBIUS`:

```bash
cd contracts
npx hardhat run scripts/deploy-blackjack.js --network pulsechain
```

**After redeployment:**
1. Update `BLACKJACK_ADDRESS` in `lib/contracts.ts`
2. Update `BLACKJACK_DEPLOY_BLOCK` in `lib/contracts.ts`
3. Verify the ABI matches the deployed contract

### Option 2: Verify Current Deployment

First, verify what functions are actually available on the deployed contract:

```bash
cd contracts
npx hardhat run scripts/verify-blackjack-functions.js --network pulsechain
```

This will show:
- Which functions are available
- Which functions are missing
- Whether redeployment is needed

## Additional Functions Available

The contract also includes these functions (not currently used by frontend):

### Admin Functions
- `pause()` / `unpause()` - Pause/unpause contract
- `setAuthorizedServer(address)` - Set authorized server for settlements
- `setEmergencyAdmin(address)` - Set emergency admin
- `setEmergencyPause(bool)` - Set emergency pause state
- `emergencyWithdraw(uint256)` - Emergency withdrawal (admin only)
- `transferOwnership(address)` - Transfer ownership
- `renounceOwnership()` - Renounce ownership

### Settlement Functions
- `settleGame(address, int256, bytes32, bytes)` - Settle game (server only)

### View Functions
- `owner()` - Get contract owner
- `authorizedServer()` - Get authorized server address
- `emergencyAdmin()` - Get emergency admin address
- `paused()` - Check if contract is paused
- `playerReserves(address)` - Get player reserve balance
- `isSeedRevealed(bytes32)` - Check if seed is revealed
- `MORBIUS_TOKEN()` - Get MORBIUS token address
- `WPLS_TOKEN()` - Get WPLS token address
- `pulseXRouter()` - Get PulseX router address
- `MIN_DEPOSIT()` - Get minimum deposit amount
- `MIN_WITHDRAWAL()` - Get minimum withdrawal amount
- `MAX_DAILY_WITHDRAWAL()` - Get max daily withdrawal
- `HOUSE_EDGE_BPS()` - Get house edge in basis points
- `BPS_DENOMINATOR()` - Get BPS denominator

## Recommendation

**REDEPLOY THE CONTRACT** - The deployed contract is missing the `depositMORBIUS` function which is required for direct MORBIUS deposits. Without this function, users can only deposit PLS (which gets auto-swapped), but cannot deposit MORBIUS directly.

## Steps to Redeploy

1. **Backup current contract address** (if needed for migration)
2. **Deploy new contract:**
   ```bash
   cd contracts
   npx hardhat run scripts/deploy-blackjack.js --network pulsechain
   ```
3. **Update contract address** in `lib/contracts.ts`
4. **Update deployment block** in `lib/contracts.ts`
5. **Verify ABI matches** deployed contract
6. **Configure contract** (set authorized server, etc.):
   ```bash
   npx hardhat run scripts/configure-blackjack.js --network pulsechain
   ```
7. **Test all functions** work correctly

## Verification Script

A verification script has been created at:
`contracts/scripts/verify-blackjack-functions.js`

Run it to check which functions are available on any deployed contract:
```bash
cd contracts
BLACKJACK_ADDRESS=0x0ab9C51d0e8d4C983D5051c8fe89A9e9A7f4BB76 npx hardhat run scripts/verify-blackjack-functions.js --network pulsechain
```
