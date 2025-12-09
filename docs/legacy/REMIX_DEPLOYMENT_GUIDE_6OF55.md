# Remix Deployment Guide for SuperStakeLottery6of55

## NEW 6-OF-55 LOTTERY CONTRACT - Deploy This One!

This is the advanced lottery contract with number matching (6-of-55), MegaMillions, and HEX overlay features.

## Quick Deployment Steps

### 1. Open Remix
Go to https://remix.ethereum.org

### 2. Create New File
- In the File Explorer (left panel), create a new file: `SuperStakeLottery6of55.sol`
- **OR** click the folder icon and upload the flattened file directly

### 3. Copy Contract Code
Copy the contents from:
```
/Users/kyle/MORBlotto/morbius_lotto/contracts/SuperStakeLottery6of55-flattened.sol
```

Paste it into the Remix editor.

### 4. Compile Contract
- Click the "Solidity Compiler" tab (left sidebar, 2nd icon)
- **Compiler version: Select `0.8.28`** (must match contract version)
- **IMPORTANT:** Click "Advanced Configurations" dropdown
- **Enable "Enable optimization"** (set runs to 200)
- **CRITICAL:** Look for one of these options:
  - "Enable viaIR"
  - "Compile via IR"
  - "Use IR-based code generator"
  - If you don't see any of these, scroll down in Advanced Configurations
  - ⚠️ **This is REQUIRED** - the contract will not compile without it
  - Without this enabled, you'll get errors about copying structs to storage

**If you can't find viaIR checkbox - Use JSON Configuration:**
1. In Remix, go to the Solidity Compiler tab
2. Scroll down and look for "Compiler configuration"
3. You should see a JSON editor showing your current settings
4. Copy this complete configuration and paste it in:

```json
{
  "language": "Solidity",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    },
    "viaIR": true,
    "outputSelection": {
      "*": {
        "": [
          "ast"
        ],
        "*": [
          "abi",
          "metadata",
          "devdoc",
          "userdoc",
          "storageLayout",
          "evm.legacyAssembly",
          "evm.bytecode",
          "evm.deployedBytecode",
          "evm.methodIdentifiers",
          "evm.gasEstimates",
          "evm.assembly"
        ]
      }
    }
  }
}
```

**Notice the `"viaIR": true` on line 8** - this is the critical addition!

- Click "Compile SuperStakeLottery6of55.sol"
- Wait for green checkmark ✅
- If you see errors about multiple pragma versions, make sure you're using the flattened file

### 5. Connect MetaMask
- Click "Deploy & Run Transactions" tab (left sidebar, 3rd icon)
- Environment: Select "Injected Provider - MetaMask"
- MetaMask will pop up - approve the connection
- **VERIFY** it shows "PulseChain (369)" in Remix
- Verify your wallet address is correct
- Make sure you have enough PLS for gas (recommend at least 0.1 PLS)

### 6. Set Constructor Parameters

**IMPORTANT - Use the correct addresses:**

**Parameter 1 - _psshTokenAddress:**
```
0x9977e170C9B6E544302E8DB0Cf01D12D55555289
```
⚠️ This is the SuperStake (pSSH) token address on PulseChain mainnet

**Parameter 2 - _initialRoundDuration:**
```
259200
```
(259200 seconds = 3 days for production)
- For testing, you can use `600` (10 minutes)
- For production, use `259200` (3 days)

### 7. Deploy
- Click the orange "Deploy" button next to `SuperStakeLottery6of55`
- MetaMask will pop up
- **IMPORTANT: Set Gas Limit to 8000000 (8 million)** in MetaMask
  - This contract is larger and needs more gas
  - Click "Edit" in MetaMask to manually set gas limit
- Click "Confirm"
- Wait 30-60 seconds for deployment

### 8. Get Contract Address
- After deployment, the contract will appear in "Deployed Contracts" section
- Click the copy icon next to the contract address
- **SAVE THIS ADDRESS!** You'll need it to update the frontend

### 9. Verify Deployment
Test the deployed contract:
- Click `getCurrentRoundInfo` - should show round 1 with state 0 (OPEN)
- Click `TICKET_PRICE` - should return `1000000000` (1 pSSH with 9 decimals)
- Click `NUMBERS_PER_TICKET` - should return `6`
- Click `MAX_NUMBER` - should return `55`
- Click `owner` - should return your wallet address
- Click `getMegaMillionsBank` - should return `0`
- Click `getHexJackpot` - should return `0`

## Constructor Parameters Summary

```
_psshTokenAddress: 0x9977e170C9B6E544302E8DB0Cf01D12D55555289
_initialRoundDuration: 259200 (3 days) or 600 (10 min for testing)
```

## Contract Features

- **6-of-55 Number Matching**: Players pick 6 unique numbers from 1-55
- **Multiple Prize Brackets**: 6 brackets based on match count (1-6 matches)
- **MegaMillions**: Every 55th round, entire bank distributed to winners
- **HEX Overlay**: When bracket 6 (6 matches) is hit, HEX jackpot activates
- **Free Tickets**: Non-winners get 1 free ticket credit for next round
- **Prize Distribution**: 55% to winners, 25% to stake, 20% to MegaMillions bank

## How It Works

**To buy tickets:**
1. Users approve pSSH tokens: `approve(lotteryAddress, amount)`
2. Users call `buyTickets(ticketNumbers)` where `ticketNumbers` is an array of 6-number arrays
3. Each ticket costs 1 pSSH (9 decimals)
4. Free ticket credits are automatically applied

**Example ticket numbers:**
```solidity
[[1, 5, 12, 23, 34, 45], [2, 8, 15, 22, 33, 44]]
```

## Troubleshooting

### Error: "invalid value for value.hash"
- Make sure MetaMask is connected to PulseChain (Chain ID 369)
- Try resetting Remix connection: Click "Injected Provider" dropdown → "Reset"
- Try an alternative RPC: https://pulsechain-rpc.publicnode.com

### Error: "Multiple pragma versions"
- Make sure you're using the flattened file
- The flattened file should have only ONE `pragma solidity ^0.8.28;` at the top

### Error: "Out of gas"
- Increase gas limit to 8000000 (8 million) or higher
- Make sure you have enough PLS in your wallet

### Contract deployment fails
- Check you're on PulseChain mainnet (not testnet)
- Verify the pSSH token address is correct
- Make sure round duration is > 0

## After Deployment

1. **Save the contract address** - Copy it immediately!
2. **Update frontend**: Edit `/morbius_lotto/lib/contracts.ts`
   - Change `LOTTERY_ADDRESS` to your deployed address
3. **Verify on PulseScan**: 
   - Go to https://scan.pulsechain.box
   - Search for your contract address
   - Verify the contract code
4. **Test the contract**:
   - Try buying a ticket
   - Check round info
   - Verify all functions work

## Gas Estimates

- **Deployment**: ~6-8 million gas
- **Buy Tickets (1 ticket)**: ~150,000-200,000 gas
- **Buy Tickets (10 tickets)**: ~500,000-700,000 gas
- **Finalize Round**: ~500,000-1,000,000 gas (depends on number of tickets)
- **Claim Winnings**: ~100,000-150,000 gas

## Important Notes

- The contract automatically starts round 1 on deployment
- Rounds automatically finalize when time expires (anyone can call `finalizeRound()`)
- MegaMillions triggers every 55th round (rounds 55, 110, 165, etc.)
- HEX overlay only triggers when bracket 6 (6 matches) has winners
- Free tickets are credited automatically to non-winners after round finalization

## Support

If you encounter any issues:
1. Check the Remix console for error messages
2. Verify all parameters are correct
3. Make sure you have enough PLS for gas
4. Try resetting the Remix connection

Good luck with your deployment! 🚀

