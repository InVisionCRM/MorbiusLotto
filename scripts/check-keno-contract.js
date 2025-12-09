// Quick script to check CryptoKeno contract state
// Run with: node scripts/check-keno-contract.js

const { createPublicClient, http } = require('viem');
const { pulsechain } = require('viem/chains');

const KENO_ADDRESS = '0x3e0e64F76Fb985f8CDbcC0169ff9e1E5cB7fE52c';

const KENO_ABI = [
  {
    inputs: [],
    name: 'currentRoundId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'roundId', type: 'uint256' }],
    name: 'getRound',
    outputs: [
      {
        components: [
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
        internalType: 'struct CryptoKeno.Round',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

const client = createPublicClient({
  chain: pulsechain,
  transport: http('https://rpc.pulsechain.com'),
});

async function checkContract() {
  console.log('🔍 Checking CryptoKeno Contract...\n');
  console.log('Contract Address:', KENO_ADDRESS);
  console.log('---\n');

  try {
    // Get current round ID
    const currentRoundId = await client.readContract({
      address: KENO_ADDRESS,
      abi: KENO_ABI,
      functionName: 'currentRoundId',
    });

    console.log('📊 Current Round ID:', currentRoundId.toString());
    console.log('---\n');

    // Get round data
    const roundData = await client.readContract({
      address: KENO_ADDRESS,
      abi: KENO_ABI,
      functionName: 'getRound',
      args: [currentRoundId],
    });

    console.log('📋 Round Data:');
    console.log('  ID:', roundData.id.toString());
    console.log('  Start Time:', roundData.startTime.toString(), '(', new Date(Number(roundData.startTime) * 1000).toISOString(), ')');
    console.log('  End Time:', roundData.endTime.toString(), '(', new Date(Number(roundData.endTime) * 1000).toISOString(), ')');
    console.log('  State:', roundData.state, getStateName(roundData.state));
    console.log('  Pool Balance:', roundData.poolBalance.toString());
    console.log('  Total Base Wager:', roundData.totalBaseWager.toString());
    console.log('---\n');

    // Analysis
    console.log('🔬 Analysis:');
    const now = Date.now();
    const startMs = Number(roundData.startTime) * 1000;
    const endMs = Number(roundData.endTime) * 1000;

    if (startMs === 0 || endMs === 0) {
      console.log('  ❌ PROBLEM: Round has zero timestamps - NOT INITIALIZED');
      console.log('  → Contract owner needs to start the first round');
    } else if (startMs > now + 60000) {
      console.log('  ⚠️  WARNING: Round starts in the future');
      console.log('  → Time until start:', ((startMs - now) / 1000 / 60).toFixed(2), 'minutes');
    } else if (endMs < now - 3600000) {
      console.log('  ⚠️  WARNING: Round ended more than 1 hour ago');
      console.log('  → Time since end:', ((now - endMs) / 1000 / 60).toFixed(2), 'minutes');
      console.log('  → May need to finalize and start new round');
    } else if (endMs > now + 3600000) {
      console.log('  ⚠️  WARNING: Round ends more than 1 hour in future');
      console.log('  → Time until end:', ((endMs - now) / 1000 / 60).toFixed(2), 'minutes');
      console.log('  → This is unusual for 15-minute rounds');
    } else {
      console.log('  ✅ Round timing looks reasonable');
      if (endMs > now) {
        console.log('  → Time remaining:', ((endMs - now) / 1000 / 60).toFixed(2), 'minutes');
      } else {
        console.log('  → Round ended', ((now - endMs) / 1000 / 60).toFixed(2), 'minutes ago');
      }
    }

    if (Number(currentRoundId) > 10 && roundData.totalBaseWager === 0n) {
      console.log('  ⚠️  WARNING: Round ID is high but no wagers - may be test data');
    }

  } catch (error) {
    console.error('❌ Error reading contract:', error.message);
    console.log('\nPossible causes:');
    console.log('  - Contract not deployed at this address');
    console.log('  - RPC connection issue');
    console.log('  - Contract ABI mismatch');
  }
}

function getStateName(state) {
  const states = ['Pending', 'Active', 'Drawing', 'Finalized'];
  return `(${states[state] || 'Unknown'})`;
}

checkContract();
