# SuperStakeLottery Smart Contract

Fully automated lottery system for SuperStake token on PulseChain.

## Overview

- **Prize Distribution**: 60% to winner, 20% rollover, 20% burn
- **Ticket Cost**: 1 SuperStake token = 1 ticket (fractional tickets supported)
- **Round Duration**: Configurable (10 minutes for testing, 3 days for production)
- **Randomness**: Block hash-based weighted selection
- **Automation**: Anyone can trigger round conclusion when time elapsed

## Contract Details

- **Token**: SuperStake (0x9977e170C9B6E544302E8DB0Cf01D12D55555289)
- **Network**: PulseChain (Chain ID: 369)
- **Solidity Version**: 0.8.28
- **License**: MIT

## Setup

```bash
npm install
```

## Testing

Run comprehensive test suite:

```bash
npm test
```

Run tests with gas reporting:

```bash
npm run test:gas
```

## Compilation

```bash
npm run compile
```

## Deployment

### Testnet Deployment

1. Create `.env` file:
```bash
cp .env.example .env
```

2. Add your private key to `.env`:
```
PRIVATE_KEY=your_private_key_here
```

3. Get PulseChain testnet PLS from faucet

4. Deploy to testnet:
```bash
npm run deploy:testnet
```

### Mainnet Deployment

1. Ensure `.env` has mainnet deployer private key with sufficient PLS

2. Deploy:
```bash
npm run deploy:mainnet
```

3. Verify contract:
```bash
npx hardhat verify --network pulsechain <CONTRACT_ADDRESS> "0x9977e170C9B6E544302E8DB0Cf01D12D55555289" <ROUND_DURATION>
```

Example:
```bash
npx hardhat verify --network pulsechain 0x123... "0x9977e170C9B6E544302E8DB0Cf01D12D55555289" 259200
```

## Configuration

### Round Duration

- **Testing**: 600 seconds (10 minutes)
- **Production**: 259200 seconds (3 days)

Update in `scripts/deploy.js` before deploying.

## Contract Functions

### User Functions

- `buyTickets(uint256 amount)` - Purchase lottery tickets
- `getRoundInfo()` - Get current round information
- `getPlayerTickets(address player)` - Get player's tickets
- `getRoundHistory(uint256 roundId)` - Get historical round data
- `getCurrentPlayers()` - Get list of current round players
- `getCurrentTotalTickets()` - Get total tickets in current round

### Public Functions

- `concludeRound()` - End current round and select winner (callable by anyone after duration elapsed)

### Owner Functions

- `updateRoundDuration(uint256 newDuration)` - Update round length

## Security Considerations

- ✅ ReentrancyGuard on critical functions
- ✅ Ownable for admin functions
- ✅ Check-effects-interactions pattern
- ✅ Block hash randomness (acceptable for this use case)
- ✅ No external oracle dependencies
- ⚠️  Owner can update duration but cannot access funds
- ⚠️  No pause mechanism (intentional - fully autonomous)

## Gas Costs (Approximate)

- Deploy: ~1.4M gas
- Buy Tickets (first): ~180K gas
- Buy Tickets (repeat): ~64K gas
- Conclude Round (with winner): ~328K gas
- Update Duration: ~30K gas

## Test Coverage

- ✅ Deployment and initialization
- ✅ Ticket purchasing (single, multiple, fractional)
- ✅ Round conclusion with participants
- ✅ Empty round handling
- ✅ Prize distribution (60/20/20)
- ✅ Rollover mechanism
- ✅ Owner functions
- ✅ View functions
- ✅ Randomness distribution (statistical)
- ✅ Edge cases and error conditions

**All 38 tests passing**

## Post-Deployment

1. Save contract address to frontend (`lib/contracts.ts`)
2. Test with small amounts first
3. Monitor first few rounds
4. Share contract address with community
5. Consider updating to 3-day rounds after testing period

## Support

For issues or questions, refer to the main project README.
