// Start first round on new CryptoKeno contract
// Run with: node scripts/start-first-round.js

const { createPublicClient, createWalletClient, http } = require('viem');
const { pulsechain } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// Contract address (NEW deployment with Plus 3)
const KENO_ADDRESS = '0x3e0e64F76Fb985f8CDbcC0169ff9e1E5cB7fE52c';

// Load private key from .env (simple parser, no dotenv dependency)
const fs = require('fs');
const path = require('path');
function loadEnv() {
  try {
    // Try contracts/.env first, then ../.env
    const paths = [
      path.join(__dirname, '../contracts/.env'),
      path.join(__dirname, '../.env'),
    ];

    for (const envPath of paths) {
      try {
        const envFile = fs.readFileSync(envPath, 'utf8');
        const lines = envFile.split('\n');
        for (const line of lines) {
          const match = line.match(/^PRIVATE_KEY\s*=\s*(.+)$/);
          if (match) {
            return match[1].trim();
          }
        }
      } catch (err) {
        // Try next path
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Minimal ABI for startFirstRound
const KENO_ABI = [
  {
    inputs: [],
    name: 'startFirstRound',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'currentRoundId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'rounds',
    outputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint64', name: 'startTime', type: 'uint64' },
      { internalType: 'uint64', name: 'endTime', type: 'uint64' },
      { internalType: 'uint8', name: 'state', type: 'uint8' },
      { internalType: 'bytes32', name: 'requestId', type: 'bytes32' },
      { internalType: 'bytes32', name: 'randomSeed', type: 'bytes32' },
      { internalType: 'uint8', name: 'bullsEyeIndex', type: 'uint8' },
      { internalType: 'uint8', name: 'bullsEyeNumber', type: 'uint8' },
      { internalType: 'uint8[20]', name: 'winningNumbers', type: 'uint8[20]' },
      { internalType: 'uint8[3]', name: 'plus3Numbers', type: 'uint8[3]' },
      { internalType: 'uint256', name: 'drawnMultiplier', type: 'uint256' },
      { internalType: 'uint256', name: 'totalBaseWager', type: 'uint256' },
      { internalType: 'uint256', name: 'poolBalance', type: 'uint256' },
      { internalType: 'uint256', name: 'totalMultiplierAddon', type: 'uint256' },
      { internalType: 'uint256', name: 'totalBullsEyeAddon', type: 'uint256' },
      { internalType: 'uint256', name: 'totalPlus3Addon', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

async function main() {
  console.log('🚀 Starting first round for CryptoKeno...\n');

  // Setup clients
  const publicClient = createPublicClient({
    chain: pulsechain,
    transport: http('https://rpc.pulsechain.com'),
  });

  const privateKey = loadEnv();
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found in .env file');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: pulsechain,
    transport: http('https://rpc.pulsechain.com'),
  });

  console.log('Wallet:', account.address);
  console.log('Contract:', KENO_ADDRESS);
  console.log('---\n');

  // Check current round
  try {
    const currentRound = await publicClient.readContract({
      address: KENO_ADDRESS,
      abi: KENO_ABI,
      functionName: 'currentRoundId',
    });

    console.log('Current Round ID:', currentRound.toString());

    if (currentRound > 0n) {
      console.log('\n⚠️  Round already started!');

      // Get round details
      const round = await publicClient.readContract({
        address: KENO_ADDRESS,
        abi: KENO_ABI,
        functionName: 'rounds',
        args: [currentRound],
      });

      console.log('\nRound Details:');
      console.log('  Start Time:', new Date(Number(round[1]) * 1000).toLocaleString());
      console.log('  End Time:', new Date(Number(round[2]) * 1000).toLocaleString());
      console.log('  State:', ['Pending', 'Active', 'Drawing', 'Finalized'][round[3]] || 'Unknown');
      console.log('  Pool Balance:', (Number(round[12]) / 1e18).toFixed(6), 'WPLS');

      console.log('\n✅ First round already exists. No action needed.');
      return;
    }
  } catch (err) {
    console.log('Could not get current round (may not exist yet)');
  }

  // Start first round
  console.log('\n🚀 Sending transaction to start first round...');
  try {
    const hash = await walletClient.writeContract({
      address: KENO_ADDRESS,
      abi: KENO_ABI,
      functionName: 'startFirstRound',
      gas: 500000n,
    });

    console.log('Transaction sent:', hash);
    console.log('Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('\n✅ First round started successfully!');
    console.log('Block:', receipt.blockNumber.toString());
    console.log('Gas used:', receipt.gasUsed.toString());

    // Check new round
    const newRoundId = await publicClient.readContract({
      address: KENO_ADDRESS,
      abi: KENO_ABI,
      functionName: 'currentRoundId',
    });

    console.log('\nCurrent Round ID:', newRoundId.toString());

    const round = await publicClient.readContract({
      address: KENO_ADDRESS,
      abi: KENO_ABI,
      functionName: 'rounds',
      args: [newRoundId],
    });

    console.log('\nRound Details:');
    console.log('  Start Time:', new Date(Number(round[1]) * 1000).toLocaleString());
    console.log('  End Time:', new Date(Number(round[2]) * 1000).toLocaleString());
    console.log('  Duration:', (Number(round[2]) - Number(round[1])) / 60, 'minutes');
    console.log('  State:', ['Pending', 'Active', 'Drawing', 'Finalized'][round[3]] || 'Unknown');
    console.log('  Pool Balance:', (Number(round[12]) / 1e18).toFixed(6), 'WPLS');

    console.log('\n🎉 CryptoKeno is now ready for players!');
    console.log('\nNext steps:');
    console.log('1. Fund the contract with WPLS for payouts');
    console.log('2. Test buying tickets with Plus 3');
    console.log('3. Start the keeper for automatic round finalization');
    console.log('4. Monitor with: node check-keno-contract.js');

  } catch (err) {
    console.error('\n❌ Failed to start first round');
    console.error('Error:', err.message);

    if (err.message.includes('revert') || err.message.includes('execution reverted')) {
      console.error('\nPossible reasons:');
      console.error('- You are not the contract owner/deployer');
      console.error('- First round already started');
      console.error('- Contract not properly initialized');
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
