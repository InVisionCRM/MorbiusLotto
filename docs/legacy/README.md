# MORBlotto - 6-of-55 Lottery DApp

Modern, dark-themed lottery DApp for the 6-of-55 lottery system on PulseChain.

## Features

- **6-of-55 Number Selection**: Pick 6 unique numbers from 1-55
- **Wallet Connection**: RainbowKit integration with PulseChain support
- **Prize Brackets**: Win based on how many numbers you match (1-6)
- **MegaMillions**: Progressive jackpot that triggers every 55th round
- **HEX Overlay**: Bonus jackpot when someone matches all 6 numbers
- **Free Tickets**: Earn credits for non-winning tickets
- **Responsive Design**: Mobile-optimized interface
- **Dark Theme**: Modern crypto-native UI

## Prerequisites

1. **WalletConnect Project ID**
   - Go to [https://cloud.walletconnect.com](https://cloud.walletconnect.com)
   - Create a new project
   - Copy your Project ID

2. **Deployed SuperStakeLottery6of55 Contract**
   - Deploy the smart contract from `/contracts` directory
   - Get the deployed contract address

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` file:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your WalletConnect Project ID:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_actual_project_id_here
```

### 3. Update Contract Address

Edit `lib/contracts.ts` and replace the lottery contract address:

```typescript
export const LOTTERY_ADDRESS = '0xYourDeployedContractAddress' as const
```

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
morbius_lotto/
├── app/
│   ├── page.tsx              # Main lottery page
│   ├── layout.tsx            # Root layout with providers
│   ├── providers.tsx         # Web3 providers wrapper
│   └── globals.css           # Global styles
├── components/
│   ├── lottery/
│   │   ├── header.tsx        # Navigation header
│   │   ├── number-picker.tsx # 6-of-55 number selection
│   │   ├── ticket-purchase.tsx   # Ticket buying UI
│   │   ├── bracket-display.tsx   # Prize bracket visualization
│   │   ├── mega-millions-indicator.tsx # MegaMillions tracker
│   │   ├── hex-jackpot-display.tsx # HEX overlay display
│   │   └── free-ticket-badge.tsx # Free ticket credits
│   └── ui/                   # shadcn components
├── hooks/
│   ├── use-lottery-6of55.ts  # Lottery contract hooks
│   ├── use-token.ts          # Token contract hooks
│   ├── use-countdown.ts      # Timer hook
│   └── use-contract-balance.ts # Contract balance tracking
├── lib/
│   ├── chains.ts             # PulseChain configuration
│   ├── wagmi-config.ts       # wagmi setup
│   ├── contracts.ts          # Contract addresses
│   └── utils.ts              # Helper functions
├── abi/
│   ├── lottery6of55.ts       # Lottery 6of55 ABI
│   └── erc20.ts              # ERC20 ABI
└── docs/
    ├── REMIX_DEPLOYMENT_GUIDE_6OF55.md # Deployment guide
    └── CONTRACTS_README.md   # Contract documentation
```

## Key Features Explained

### Prize Distribution

- **55%** of ticket sales goes to prize brackets
- **25%** goes to SuperStake HEX stake address
- **20%** goes to MegaMillions progressive jackpot

### Prize Brackets

- **Bracket 6**: Match all 6 numbers (jackpot)
- **Bracket 5**: Match 5 numbers
- **Bracket 4**: Match 4 numbers
- **Bracket 3**: Match 3 numbers
- **Bracket 2**: Match 2 numbers
- **Bracket 1**: Match 1 number

Unclaimed bracket prizes roll into the MegaMillions bank.

### MegaMillions

- Triggers every 55th round
- Entire accumulated bank distributed to all winning brackets
- Resets after distribution

### HEX Overlay

- Activates when someone matches all 6 numbers
- **70%** to Bracket 6 winners
- **30%** to SuperStake HEX stake address

### Free Tickets

- Earn 1 credit per non-winning ticket
- Credits automatically applied at purchase
- Never expire

## Building for Production

```bash
npm run build
```

Test production build locally:

```bash
npm start
```

## Deployment

### Deploy to Vercel

1. Push code to GitHub

2. Connect to Vercel:
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Add environment variable: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   - Deploy

3. Configure custom domain (optional)

## Contract Deployment

See `docs/REMIX_DEPLOYMENT_GUIDE_6OF55.md` for detailed deployment instructions.

Quick steps:

1. **Deploy SuperStakeLottery6of55 Contract**
2. **Update Contract Address** in `lib/contracts.ts`
3. **Update PSSH Token Address** if different
4. **Verify Contract** (recommended)

## Technology Stack

- **Next.js 16**: React framework
- **TypeScript**: Type safety
- **Tailwind CSS v4**: Styling
- **wagmi v2**: Ethereum library
- **viem v2**: Low-level Ethereum utilities
- **RainbowKit**: Wallet connection UI
- **TanStack Query**: Data fetching
- **sonner**: Toast notifications
- **shadcn/ui**: Component library

## Smart Contract Details

- **Token**: SuperStake (pSSH)
- **Network**: PulseChain (Chain ID: 369)
- **Ticket Cost**: 1 pSSH = 1 ticket
- **Numbers**: Pick 6 from 1-55

## Documentation

- Contract deployment: `docs/REMIX_DEPLOYMENT_GUIDE_6OF55.md`
- Contract details: `docs/CONTRACTS_README.md`

## License

MIT
