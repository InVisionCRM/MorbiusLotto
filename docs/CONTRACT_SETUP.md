# Contract Interface Setup Instructions

## Installation

The contract interface requires one additional dependency:

```bash
npm install @radix-ui/react-checkbox
# or
pnpm add @radix-ui/react-checkbox
# or
yarn add @radix-ui/react-checkbox
```

## Files Created

### 1. Page Component
- `/app/contracts/page.tsx` - Main contracts page

### 2. Contract Interface Components
- `/components/contracts/lottery-interface.tsx` - Lottery contract UI
- `/components/contracts/keno-interface.tsx` - Keno contract UI

### 3. UI Components
- `/components/ui/checkbox.tsx` - Checkbox component (uses @radix-ui)

### 4. Header Update
- `/components/lottery/header.tsx` - Added navigation to contracts page

### 5. Documentation
- `/CONTRACT_INTERFACE_README.md` - Complete usage guide
- `/CONTRACT_SETUP.md` - This file

## Verification

After installation, verify the setup:

1. **Check Dependencies:**
```bash
npm list @radix-ui/react-checkbox
```

2. **Start Development Server:**
```bash
npm run dev
```

3. **Navigate to Contract Interface:**
```
http://localhost:3000/contracts
```

## Features Implemented

### SuperStakeLottery6of55V2
✅ User Actions
- Buy Tickets (Morbius)
- Buy Tickets for Multiple Rounds
- Buy Tickets with WPLS
- Claim Winnings

✅ Admin Actions
- Finalize Round
- Update Round Duration
- Update MegaMorbius Interval
- Update Block Delay

✅ Statistics
- Current Round Info
- Player Lifetime Stats
- Global Stats
- Bracket Configuration

### CryptoKeno
✅ Player Actions
- Buy Ticket (with add-ons)
- Claim Prize
- Auto-Claim Settings

✅ Admin Actions
- Round Management
- Paytable Configuration
- Contract Configuration

✅ Statistics
- Current Round Info
- Player Stats
- Global Stats
- Progressive Jackpot Stats

## Contract Integration

The interface uses existing contract configurations from:
- `/lib/contracts.ts` - Contract addresses and constants
- `/abi/lottery6of55-v2.ts` - Lottery ABI
- `/lib/keno-abi.ts` - Keno ABI
- `/abi/erc20.ts` - ERC20 token ABI

No additional contract setup is required.

## Usage

### For Players

1. Connect wallet using RainbowKit
2. Navigate to "Contracts" in the header
3. Select "Lottery 6-of-55" or "Crypto Keno" tab
4. Use "User Actions" or "Player Actions" section
5. Approve tokens before purchasing
6. View stats in "Statistics" section

### For Admins/Developers

1. Use "Admin Actions" section (requires owner permissions)
2. Monitor contract state in "Statistics" section
3. Finalize rounds manually if needed
4. Update contract parameters as needed

### For Testing

1. Use read functions without wallet connection
2. Test with small amounts first
3. Verify transactions on PulseChain explorer
4. Check event logs for detailed information

## Styling

The interface matches the existing design:
- Dark theme with purple accents
- Same card/button styles as main app
- Responsive layout
- Consistent typography
- Hover states and transitions

## Tooltips

Every function includes a tooltip (? icon) with:
- Description of what it does
- Example parameters
- Important notes and warnings

## Error Handling

The interface includes:
- Wallet connection checks
- Network validation
- Form validation
- Transaction status tracking
- Success/error notifications (using sonner toast)

## Best Practices

1. **Always approve tokens before buying:**
   - Lottery requires Morbius approval
   - WPLS purchases require WPLS approval
   - Keno requires Morbius approval

2. **Verify parameters before submitting:**
   - Check JSON format for ticket arrays
   - Verify round offsets are valid
   - Confirm add-on selections

3. **Monitor transaction status:**
   - Wait for confirmation
   - Check for success/error messages
   - Verify on block explorer

4. **Use refresh buttons:**
   - Update stats after transactions
   - Refresh round information
   - Check claimable amounts

## Troubleshooting

### Common Issues

**"Module not found: @radix-ui/react-checkbox"**
- Run: `npm install @radix-ui/react-checkbox`

**"Invalid JSON" errors**
- Check array format: `[[1,2,3,4,5,6]]`
- Ensure proper brackets and commas
- No trailing commas

**Transactions failing**
- Verify token approval
- Check wallet balance
- Ensure correct network (PulseChain)
- Try increasing gas limit

**Stats not loading**
- Click refresh button
- Check wallet connection
- Verify contract is deployed

### Development Issues

**TypeScript errors**
- Ensure all dependencies are installed
- Run: `npm install`
- Check tsconfig.json is correct

**Styling issues**
- Verify Tailwind is configured
- Check globals.css is imported
- Ensure UI components are installed

**Hook errors**
- Verify wagmi version compatibility
- Check provider is configured
- Ensure RainbowKit is set up

## Next Steps

1. **Install Dependencies:**
```bash
pnpm add @radix-ui/react-checkbox
```

2. **Test the Interface:**
```bash
pnpm dev
```

3. **Navigate to `/contracts`**

4. **Connect wallet and test functions**

5. **Review documentation in CONTRACT_INTERFACE_README.md**

## Support

For issues:
1. Check console for errors
2. Verify all dependencies installed
3. Check contract addresses are correct
4. Review transaction on block explorer
5. Check wallet network settings

## Additional Resources

- Wagmi Docs: https://wagmi.sh
- RainbowKit Docs: https://www.rainbowkit.com
- Radix UI Docs: https://www.radix-ui.com
- PulseChain Docs: https://docs.pulsechain.com




