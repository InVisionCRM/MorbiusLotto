/**
 * test-plinko-pls.js
 *
 * Tests buyBallsWithPLSAndDrop() using PRIVATE_KEY as the player.
 * Drops 1 ball at LOW risk (0) using the minimum viable PLS amount.
 *
 * Usage:
 *   npx hardhat run scripts/test-plinko-pls.js --network pulsechain
 */

import hre from "hardhat";

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)",
];

const PLINKO_ABI = [
  "function buyBallsWithPLSAndDrop(uint256 ballCount, uint8 riskLevel) external payable",
  "function minWagerPerBall() external view returns (uint256)",
  "function maxWagerPerBall() external view returns (uint256)",
  "function contractReserve() external view returns (uint256)",
  "event BallDropped(address indexed player, uint256 seed, uint8 bucket, uint256 multiplier, uint256 payout, uint8 riskLevel)",
  "event PayoutFeesCollected(address indexed player, uint256 grossPayout, uint256 feeDistribution, uint256 feePlatform, uint256 netToPlayer)",
];

const PLINKO_ADDRESS  = process.env.PLINKO_ADDRESS  || "0xa6585d334bb737d64eCE7abCA5acC087dd46E99e";
const ROUTER_ADDRESS  = process.env.PLINKO_ROUTER   || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
const WPLS_ADDRESS    = process.env.PLINKO_WPLS_TOKEN || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const MORBIUS_ADDRESS = process.env.MORBIUS_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

// Risk levels: 0=LOW, 1=MEDIUM, 2=HIGH
const RISK_LEVEL = 0;
const BALL_COUNT = 1;

async function main() {
  const [player] = await hre.ethers.getSigners();
  const router = new hre.ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, player);
  const plinko = new hre.ethers.Contract(PLINKO_ADDRESS, PLINKO_ABI, player);

  const plsBalance = await hre.ethers.provider.getBalance(player.address);
  const minWager = await plinko.minWagerPerBall();
  const maxWager = await plinko.maxWagerPerBall();
  const reserve = await plinko.contractReserve();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Player       :", player.address);
  console.log("PLS balance  :", hre.ethers.formatEther(plsBalance), "PLS");
  console.log("Min wager    :", hre.ethers.formatEther(minWager), "MORBIUS");
  console.log("Max wager    :", hre.ethers.formatEther(maxWager), "MORBIUS");
  console.log("Reserve      :", hre.ethers.formatEther(reserve), "MORBIUS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // --- Price discovery: how much PLS = minWager MORBIUS? ---
  // We want wagerPerBall = morbiusOut / ballCount >= minWager
  // So we need morbiusOut >= minWager * ballCount
  const targetMorbius = minWager * BigInt(BALL_COUNT) * 2n; // 2x minimum for safety buffer
  const path = [WPLS_ADDRESS, MORBIUS_ADDRESS];

  // Binary-ish search: start with 1000 PLS and see what MORBIUS we get, scale up
  const samplePLS = hre.ethers.parseEther("1000");
  const sampleOut = await router.getAmountsOut(samplePLS, path);
  const morbiusPerPLS = sampleOut[1]; // MORBIUS for 1000 PLS

  console.log("Price check  : 1000 PLS →", hre.ethers.formatEther(morbiusPerPLS), "MORBIUS");

  // Calculate PLS needed for targetMorbius, add 20% slippage buffer
  const plsNeeded = (targetMorbius * samplePLS * 12n / 10n) / morbiusPerPLS;
  console.log("Sending      :", hre.ethers.formatEther(plsNeeded), "PLS for", BALL_COUNT, "ball(s)");
  console.log("Risk level   :", ['LOW', 'MEDIUM', 'HIGH'][RISK_LEVEL]);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // --- Verify price quote for the actual send amount ---
  const quoteAmounts = await router.getAmountsOut(plsNeeded, path);
  const expectedMorbius = quoteAmounts[1];
  const expectedWagerPerBall = expectedMorbius / BigInt(BALL_COUNT);
  console.log("Quote        :", hre.ethers.formatEther(plsNeeded), "PLS →", hre.ethers.formatEther(expectedMorbius), "MORBIUS");
  console.log("Wager/ball   :", hre.ethers.formatEther(expectedWagerPerBall), "MORBIUS");

  if (expectedWagerPerBall < minWager) {
    throw new Error(`Wager per ball (${hre.ethers.formatEther(expectedWagerPerBall)}) is below minimum (${hre.ethers.formatEther(minWager)})`);
  }

  // --- Send the transaction ---
  const feeData = await hre.ethers.provider.getFeeData();
  const baseFee = feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei");
  const maxFeePerGas = baseFee * 2n;
  const maxPriorityFeePerGas = hre.ethers.parseUnits("500000", "gwei"); // 0.5M gwei tip

  console.log("\n⏳  Calling buyBallsWithPLSAndDrop…");
  const tx = await plinko.buyBallsWithPLSAndDrop(BALL_COUNT, RISK_LEVEL, {
    value: plsNeeded,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: 500000,
  });

  console.log("   TX hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("   ✅ Confirmed at block", receipt.blockNumber);

  // --- Parse events ---
  const plinkoInterface = new hre.ethers.Interface(PLINKO_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = plinkoInterface.parseLog(log);
      if (parsed?.name === "BallDropped") {
        const { bucket, multiplier, payout } = parsed.args;
        console.log(`\n🎯 Ball landed in bucket ${bucket} — ${Number(multiplier) / 100}x — payout: ${hre.ethers.formatEther(payout)} MORBIUS (gross)`);
      }
      if (parsed?.name === "PayoutFeesCollected") {
        const { grossPayout, feeDistribution, feePlatform, netToPlayer } = parsed.args;
        console.log(`💸 Gross: ${hre.ethers.formatEther(grossPayout)} | Fees: ${hre.ethers.formatEther(feeDistribution + feePlatform)} | Net to player: ${hre.ethers.formatEther(netToPlayer)} MORBIUS`);
      }
    } catch {
      // ignore logs from other contracts
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
