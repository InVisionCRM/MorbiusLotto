/**
 * Emergency pause and withdraw MORBIUS from InstantLottery6of55 contract reserve.
 *
 * Requirements:
 * - Signer must be the contract owner.
 * - amount must be <= contractReserve (contract enforces this).
 *
 * Usage (from contracts folder; .env must have PRIVATE_KEY = owner key):
 *   npx hardhat run scripts/lottery/withdraw/emergency-withdraw-instant-lottery.js --network pulsechain
 *
 * Withdraw from previous/legacy Instant Lottery (default target):
 *   npx hardhat run scripts/lottery/withdraw/emergency-withdraw-instant-lottery.js --network pulsechain
 *
 * Withdraw from a specific contract:
 *   LOTTERY_INSTANT_ADDRESS=0x... npx hardhat run scripts/lottery/withdraw/emergency-withdraw-instant-lottery.js --network pulsechain
 *
 * Env:
 *   PRIVATE_KEY              — Owner key (required).
 *   LOTTERY_INSTANT_ADDRESS  — InstantLottery6of55 contract (default: previous 0x884843787be5c0387F38722d9e4F2ab1E93c25D8)
 *   LOTTERY_EMERGENCY_AMOUNT — Amount in MORBIUS (e.g. 1000). Omit or set to "all" to withdraw full reserve.
 *   DRY_RUN=1                — Only show amount and recipient, do not send tx.
 */

import hre from "hardhat";

// Previous instant lottery contract (before current 0xDc31A61CB5041022D894EA25Ee8BEEc74788491f)
const PREVIOUS_LOTTERY_INSTANT_ADDRESS = "0x884843787be5c0387F38722d9e4F2ab1E93c25D8";
const DEFAULT_MORBIUS = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
];

const INSTANT_LOTTERY_MINIMAL_ABI = [
  "function owner() view returns (address)",
  "function contractReserve() view returns (uint256)",
  "function paused() view returns (bool)",
  "function pause()",
  "function emergencyWithdraw(uint256 amount)",
];

async function main() {
  const lotteryAddress =
    process.env.LOTTERY_INSTANT_ADDRESS ||
    process.env.NEXT_PUBLIC_LOTTERY_INSTANT_ADDRESS ||
    PREVIOUS_LOTTERY_INSTANT_ADDRESS;

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("Set PRIVATE_KEY in .env to the owner key.");
    process.exit(1);
  }

  const signer = new hre.ethers.Wallet(privateKey.trim(), hre.ethers.provider);
  console.log("Signer (must be owner):", signer.address);
  console.log("Contract:", lotteryAddress);

  const lottery = new hre.ethers.Contract(lotteryAddress, INSTANT_LOTTERY_MINIMAL_ABI, signer);
  const owner = await lottery.owner();
  if (signer.address.toLowerCase() !== owner.toLowerCase()) {
    console.error("Signer is not the owner of this contract. Aborting.");
    process.exit(1);
  }
  console.log("Recipient (owner):      ", owner);

  const token = new hre.ethers.Contract(DEFAULT_MORBIUS, ERC20_ABI, signer);
  const contractBalance = await token.balanceOf(lotteryAddress);
  const symbol = await token.symbol().catch(() => "MORBIUS");
  console.log("Contract token balance: ", hre.ethers.formatEther(contractBalance), symbol);

  let amount;
  const amountRaw = process.env.LOTTERY_EMERGENCY_AMOUNT?.trim();
  if (!amountRaw || amountRaw.toLowerCase() === "all") {
    const reserve = await lottery.contractReserve().catch(() => 0n);
    if (reserve === 0n) {
      console.error("Contract reserve is 0. Set LOTTERY_EMERGENCY_AMOUNT to a number (e.g. 1000) or ensure contract has reserve.");
      process.exit(1);
    }
    amount = reserve;
    console.log("Withdraw amount (full reserve):", hre.ethers.formatEther(amount), symbol);
  } else {
    amount = hre.ethers.parseEther(amountRaw);
    console.log("Withdraw amount:        ", amountRaw, symbol);
  }

  if (process.env.DRY_RUN === "1") {
    console.log("\nDRY_RUN=1: not sending transactions. Remove DRY_RUN to execute.");
    return;
  }

  try {
    const isPaused = await lottery.paused();
    if (!isPaused) {
      console.log("\nPausing contract...");
      const txPause = await lottery.pause();
      await txPause.wait();
      console.log("  Tx:", txPause.hash);
    } else {
      console.log("\nContract already paused.");
    }
  } catch (e) {
    console.log("\nPause skipped (paused() or pause() not available on this contract).");
  }

  console.log("\nCalling emergencyWithdraw(", amount.toString(), ")...");
  const tx = await lottery.emergencyWithdraw(amount);
  await tx.wait();
  console.log("  Tx:", tx.hash);
  console.log("\nDone. Withdrawn", hre.ethers.formatEther(amount), symbol, "to owner:", owner);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
