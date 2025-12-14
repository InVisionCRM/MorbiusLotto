import { ethers } from 'ethers';

const RPC_URL = 'https://rpc.pulsechain.com';
const KENO_ADDRESS = '0x3e0e64F76Fb985f8CDbcC0169ff9e1E5cB7fE52c';
const MORBIUS_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

const KENO_ABI = [
  'function currentRoundId() view returns (uint256)',
  'function getRound(uint256 roundId) view returns (tuple(uint256 id, uint64 startTime, uint64 endTime, uint8 state, bytes32 requestId, bytes32 randomSeed, uint8 bullsEyeIndex, uint8 bullsEyeNumber, uint8[20] winningNumbers, uint8[3] plus3Numbers, uint256 drawnMultiplier, uint256 totalBaseWager, uint256 poolBalance, uint256 totalMultiplierAddon, uint256 totalBullsEyeAddon, uint256 totalPlus3Addon, uint256 totalProgressiveAddon, uint256[] progressiveWinners))',
  'function progressivePool() view returns (uint256)',
  'function pendingBurnToken() view returns (uint256)',
  'function burnThreshold() view returns (uint256)',
  'function feeBps() view returns (uint256)',
  'function getProgressiveStats() view returns (uint256 currentPool, uint256 baseSeed, uint256 costPerDraw, uint256 totalCollected, uint256 totalPaid, uint256 winCount, uint256 lastWinRound)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const morbiusToken = new ethers.Contract(MORBIUS_ADDRESS, ERC20_ABI, provider);
  const kenoContract = new ethers.Contract(KENO_ADDRESS, KENO_ABI, provider);

  console.log('=== CONTRACT BALANCE ANALYSIS ===\n');

  // Get total MORBIUS balance
  const totalBalance = await morbiusToken.balanceOf(KENO_ADDRESS);
  const decimals = await morbiusToken.decimals();
  console.log('📊 Total MORBIUS in Contract:', ethers.formatUnits(totalBalance, decimals), 'MORBIUS');
  console.log('   Raw:', totalBalance.toString(), '\n');

  // Get current round info
  const currentRoundId = await kenoContract.currentRoundId();
  console.log('🎲 Current Round:', currentRoundId.toString());

  const roundData = await kenoContract.getRound(currentRoundId);
  console.log('   Pool Balance:', ethers.formatUnits(roundData.poolBalance, decimals), 'MORBIUS');
  console.log('   Raw:', roundData.poolBalance.toString(), '\n');

  // Get progressive jackpot
  const progressiveStats = await kenoContract.getProgressiveStats();
  console.log('💰 Progressive Jackpot:', ethers.formatUnits(progressiveStats.currentPool, decimals), 'MORBIUS');
  console.log('   Raw:', progressiveStats.currentPool.toString(), '\n');

  // Get pending burn
  const pendingBurn = await kenoContract.pendingBurnToken();
  const burnThreshold = await kenoContract.burnThreshold();
  console.log('🔥 Pending Burn:', ethers.formatUnits(pendingBurn, decimals), 'MORBIUS');
  console.log('   Burn Threshold:', ethers.formatUnits(burnThreshold, decimals), 'MORBIUS');
  console.log('   Raw Pending:', pendingBurn.toString(), '\n');

  // Calculate where the tokens are
  console.log('=== TOKEN DISTRIBUTION ===\n');
  const accounted = roundData.poolBalance + progressiveStats.currentPool + pendingBurn;
  const unaccounted = totalBalance - accounted;

  console.log('Player Pool (current round):', ethers.formatUnits(roundData.poolBalance, decimals));
  console.log('Progressive Jackpot:', ethers.formatUnits(progressiveStats.currentPool, decimals));
  console.log('Pending Burn (fees):', ethers.formatUnits(pendingBurn, decimals));
  console.log('---');
  console.log('Total Accounted:', ethers.formatUnits(accounted, decimals));
  console.log('Unaccounted:', ethers.formatUnits(unaccounted, decimals));

  console.log('\n=== DIAGNOSIS ===\n');

  if (pendingBurn > roundData.poolBalance) {
    console.log('⚠️  ISSUE: Most tokens are in pending burn (fees)!');
    console.log('   → Fees collected:', ethers.formatUnits(pendingBurn, decimals), 'MORBIUS');
    console.log('   → These will be burned when threshold is reached');
  }

  if (roundData.poolBalance < ethers.parseUnits('1000', decimals)) {
    console.log('⚠️  ISSUE: Player pool is very low!');
    console.log('   → Pool balance:', ethers.formatUnits(roundData.poolBalance, decimals), 'MORBIUS');
    console.log('   → This means prizes have been paid out');
  }

  if (progressiveStats.currentPool === 0n) {
    console.log('⚠️  ISSUE: Progressive jackpot is empty!');
    console.log('   → No progressive pool funds available');
  }

  // Get fee rate
  const feeBps = await kenoContract.feeBps();
  console.log('\n📈 Fee Rate:', (Number(feeBps) / 100).toFixed(2), '%');
}

main().catch(console.error);
