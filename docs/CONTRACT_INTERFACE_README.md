# Contract Interface Documentation

## Overview

The Contract Interface page (`/contracts`) provides a comprehensive admin and debugging interface for interacting with both the **SuperStakeLottery6of55V2** and **CryptoKeno** smart contracts.

## Access

Navigate to: `https://your-domain.com/contracts`

Or click "Contracts" in the navigation menu.

## Features

### Wallet Connection
- Connect your wallet using RainbowKit
- Read functions work without connection
- Write functions require wallet connection

## SuperStakeLottery6of55V2 Interface

### User Actions

#### 1. Buy Tickets (Morbius)
**Purpose:** Purchase lottery tickets with Morbius tokens

**Parameters:**
- Approval Amount: Amount of Morbius to approve for the contract
- Ticket Numbers: JSON array of number arrays

**Example:**
```json
[[1,2,3,4,5,6], [7,8,9,10,11,12]]
```

**Notes:**
- Each ticket costs 1,000 Morbius
- Must approve contract first
- Pick 6 unique numbers (1-55) per ticket
- Max 100 tickets per transaction

#### 2. Buy Tickets for Multiple Rounds
**Purpose:** Purchase tickets for current and future rounds

**Parameters:**
- Ticket Groups: 3D array of tickets per round
- Round Offsets: Array of round offsets (0=current, 1=next, etc.)

**Example:**
```json
Ticket Groups: [[[1,2,3,4,5,6]], [[7,8,9,10,11,12]]]
Round Offsets: [0, 1]
```

**Notes:**
- Offset 0 = current round
- Max offset = 100 rounds ahead
- Total cost = tickets × rounds × 1000 Morbius

#### 3. Buy Tickets with WPLS
**Purpose:** Purchase tickets using WPLS (auto-swaps to Morbius)

**Parameters:**
- WPLS Approval Amount
- Ticket Numbers: JSON array
- Extra Buffer: Optional extra slippage buffer (basis points)

**Example:**
```json
Tickets: [[1,2,3,4,5,6]]
Extra Buffer: 0
```

**Notes:**
- Default buffer: 11.1% (covers tax + slippage)
- Extra buffer: 100 = 1%, 1000 = 10%
- Contract swaps via PulseX automatically

#### 4. Claim Winnings
**Purpose:** Claim prizes from finalized rounds

**Parameters:**
- Round ID: The round number to claim from

**Example:**
```
Round ID: 5
```

**Notes:**
- Only works on finalized rounds
- Can only claim once per round
- Winnings transferred immediately

### Admin Actions (Owner Only)

#### 1. Finalize Round
**Purpose:** Manually finalize the current round

**Notes:**
- Can only finalize after round duration expires
- Generates winning numbers
- Calculates and distributes prizes
- Starts new round
- Anyone can call this

#### 2. Update Settings
**Purpose:** Configure lottery parameters

**Parameters:**
- Round Duration (seconds): Time between draws
- MegaMorbius Interval (rounds): Every Nth round triggers MegaMorbius
- Block Delay: Blocks to wait for randomness

**Example:**
```
Round Duration: 86400 (24 hours)
MegaMorbius Interval: 5
Block Delay: 0
```

**Notes:**
- Requires owner permissions
- Changes take effect on next round

### Statistics

#### 1. Current Round Information
**Displays:**
- Round ID
- State (OPEN/LOCKED/FINALIZED)
- Total Morbius in pool
- Total Tickets sold
- Unique Players
- Time Remaining
- MegaMorbius Round status

#### 2. Your Lifetime Statistics
**Displays:**
- Tickets Bought
- Total Spent
- Total Claimed
- Claimable Now

#### 3. Global Statistics
**Displays:**
- Total Tickets Ever
- Total Collected
- Total Claimed
- Outstanding Prizes
- MegaMorbius Bank

#### 4. Prize Distribution Configuration
**Displays:**
- Bracket Percentages (1-6 matches)
- Winners Pool %
- Burn %
- MegaMorbius %

## CryptoKeno Interface

### Player Actions

#### 1. Buy Keno Ticket
**Purpose:** Purchase multi-draw Keno tickets with add-ons

**Parameters:**
- Round ID: Starting round
- Numbers: Array of 1-10 numbers (1-80)
- Spot Size: Number of spots (1-10)
- Draws: Number of consecutive draws
- Wager Per Draw: Base wager in Morbius
- Add-ons: Optional features

**Example:**
```json
Round ID: 1
Numbers: [1,2,3,4,5,6,7,8,9,10]
Spot Size: 10
Draws: 5
Wager: 0.001
Add-ons: Multiplier ✓, Bulls-Eye ✓
```

**Add-Ons:**
- **Multiplier:** 1x-10x random multiplier on winnings
- **Bulls-Eye:** 3x payout if special number hit
- **Plus 3:** Draw 3 extra numbers for more chances
- **Progressive:** Eligible for jackpot (9/10 spots)

**Notes:**
- Contract draws 20 numbers per round
- Match your numbers to win
- Multi-draw tickets play consecutive rounds
- Cost = (wager + add-on costs) × draws

#### 2. Claim Prize
**Purpose:** Claim winnings from a finalized round

**Parameters:**
- Round ID
- Ticket ID

**Example:**
```
Round ID: 5
Ticket ID: 123
```

**Notes:**
- Must claim within 180 days
- Can only claim once per ticket per round

#### 3. Auto-Claim Settings
**Purpose:** Enable automatic prize claiming

**Notes:**
- When enabled, contract auto-claims during round finalization
- Gas-limited, so may fail for high volume
- Can always claim manually if auto-claim fails

### Admin Actions (Owner Only)

#### 1. Round Management
**Purpose:** Control round progression

**Actions:**
- Start Next Round: Finalizes current (if expired) and starts new round

**Notes:**
- Only owner can execute
- Automatically handles round transitions

#### 2. Paytable Configuration
**Purpose:** Update prize multipliers

**Parameters:**
- Spot Size: 1-10
- Hits: Number of matches
- Multiplier: Prize multiplier (integer)

**Example:**
```
Spot Size: 10
Hits: 10
Multiplier: 100000 (100,000x wager)
```

**Notes:**
- Sets payout for specific outcomes
- Requires owner permissions

#### 3. Contract Configuration
**Purpose:** Adjust core parameters

**Parameters:**
- Round Duration: Seconds per draw
- Max Wager: Maximum bet per draw

**Example:**
```
Round Duration: 180 (3 minutes)
Max Wager: 0.001
```

**Notes:**
- Controls game timing and risk limits

### Statistics

#### 1. Current Round Information
**Displays:**
- Current Round ID

#### 2. Your Keno Statistics
**Displays:**
- Total Wagered
- Total Won
- Tickets Bought
- Win Count
- Win Rate
- Net P&L

#### 3. Global Keno Statistics
**Displays:**
- Total Wagered (all players)
- Total Won (all players)
- Total Tickets
- Active Round

#### 4. Progressive Jackpot Stats
**Displays:**
- Current Jackpot Pool
- Base Seed
- Cost Per Draw
- Total Collected
- Total Paid
- Win Count
- Last Win Round

**Win Condition:**
- 9+ hits on 9/10-spot game
- Must have Progressive add-on enabled
- Winners share the jackpot pool

## Common Use Cases

### For Players

1. **Buy Lottery Tickets:**
   - Approve Morbius tokens
   - Enter ticket numbers
   - Click "Buy Tickets"

2. **Buy Multiple Rounds:**
   - Use multi-round purchase
   - Set round offsets
   - Save on gas fees

3. **Play Keno:**
   - Choose spot size (1-10)
   - Pick numbers (1-80)
   - Add optional features
   - Select number of draws

4. **Claim Prizes:**
   - Check your stats for claimable amount
   - Enter round ID
   - Click "Claim Winnings"

### For Admins

1. **Monitor Contract:**
   - View global statistics
   - Check round status
   - Track prize pools

2. **Finalize Rounds:**
   - Wait for round to expire
   - Click "Finalize Round"
   - New round starts automatically

3. **Update Parameters:**
   - Adjust round duration
   - Change MegaMorbius interval
   - Update paytables

4. **Emergency Operations:**
   - Pause contracts (if needed)
   - Withdraw excess funds
   - Reclaim expired prizes

## Troubleshooting

### Transaction Failures

**"Insufficient allowance"**
- Approve tokens before buying tickets

**"Round not open"**
- Wait for new round to start
- Or finalize expired round

**"Already claimed"**
- You've already claimed this round
- Check different rounds

**"Nothing to claim"**
- No winnings for this round
- Check your tickets match winning numbers

### UI Issues

**"Connect wallet" required**
- Connect wallet for write functions
- Read functions work without connection

**"Wrong network"**
- Switch to PulseChain mainnet
- Use network switcher in wallet

**Data not loading**
- Click "Refresh" buttons
- Check contract is deployed
- Verify network connection

## Security Notes

1. **Approval Safety:**
   - Only approve amount you intend to spend
   - Revoke approvals when done

2. **Transaction Review:**
   - Review all parameters before signing
   - Check gas estimates
   - Verify contract addresses

3. **Owner Functions:**
   - Only contract owner can execute admin functions
   - Owner address is set at deployment
   - Cannot be changed after deployment

## Support

For issues or questions:
1. Check contract addresses in `/lib/contracts.ts`
2. Verify network is PulseChain mainnet
3. Check transaction history on block explorer
4. Review event logs for detailed error messages

## Contract Addresses

**Lottery:** Check `LOTTERY_ADDRESS` in `/lib/contracts.ts`
**Keno:** Check `KENO_ADDRESS` in `/lib/contracts.ts`
**Morbius Token:** Check `MORBIUS_TOKEN_ADDRESS` in `/lib/contracts.ts`
**WPLS Token:** Check `WPLS_TOKEN_ADDRESS` in `/lib/contracts.ts`

## Technical Details

### JSON Format Examples

**Single Ticket:**
```json
[[1,2,3,4,5,6]]
```

**Multiple Tickets:**
```json
[[1,2,3,4,5,6], [7,8,9,10,11,12], [13,14,15,16,17,18]]
```

**Multi-Round Tickets:**
```json
{
  "ticketGroups": [[[1,2,3,4,5,6]], [[7,8,9,10,11,12]]],
  "roundOffsets": [0, 1]
}
```

**Keno Numbers:**
```json
[1,2,3,4,5,6,7,8,9,10]
```

### Add-On Bitmasks (Keno)

Add-ons are combined using bitwise OR:
- Multiplier: `1 << 0` (1)
- Bulls-Eye: `1 << 1` (2)
- Plus 3: `1 << 2` (4)
- Progressive: `1 << 3` (8)

**Example combinations:**
- Multiplier only: 1
- Multiplier + Bulls-Eye: 3
- All add-ons: 15

## Gas Optimization

1. **Batch Operations:**
   - Buy multiple tickets in one transaction
   - Use multi-round purchases

2. **Claim Together:**
   - Wait to claim multiple rounds at once
   - Use batch claim functions if available

3. **Auto-Claim:**
   - Enable for automatic claiming
   - Saves manual transaction costs

## FAQ

**Q: Can I cancel a ticket purchase?**
A: No, all sales are final once transaction confirms

**Q: When can I claim winnings?**
A: After round is finalized (automatically after duration expires)

**Q: What happens if I don't claim?**
A: Prizes expire after 180 days for Keno, unclaimed lottery prizes roll over

**Q: Can I play from any wallet?**
A: Yes, any PulseChain-compatible wallet works

**Q: Are there limits on ticket purchases?**
A: Lottery: 100 tickets per transaction, 500 total for multi-round
A: Keno: Configurable max wager per draw

**Q: How does the progressive jackpot work?**
A: Win 9+ spots on 9/10-spot Keno with Progressive add-on enabled. Winners share the pool.




