/**
 * Approve the Instant Lottery contract to spend MORBIUS from the PLS treasury.
 * Required for playLotteryWithPLS to work: contract pulls fees/payout from treasury.
 *
 * Usage (from contracts folder):
 *   npx hardhat run scripts/lottery/configure/approve-instant-lottery-treasury.js --network pulsechain
 *
 * Required in .env:
 *   TREASURY_PRIVATE_KEY  — private key of the wallet set as plsTreasury on InstantLottery6of55
 *   LOTTERY_INSTANT_ADDRESS — e.g. 0x6CCecFd3165f4d911BA8D196eb5202cc80fEF8a8
 */

import hre from "hardhat";

const MORBIUS_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const LOTTERY_INSTANT = process.env.LOTTERY_INSTANT_ADDRESS || "0x6CCecFd3165f4d911BA8D196eb5202cc80fEF8a8";
const MORBIUS_ADDRESS = process.env.MORBIUS_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

async function main() {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    throw new Error(
      "TREASURY_PRIVATE_KEY not set in .env (must be the plsTreasury wallet for Instant Lottery)"
    );
  }

  const treasury = new hre.ethers.Wallet(treasuryKey.trim(), hre.ethers.provider);
  const morbius = new hre.ethers.Contract(MORBIUS_ADDRESS, MORBIUS_ABI, treasury);

  console.log("Treasury (plsTreasury):", treasury.address);
  console.log("Instant Lottery:       ", LOTTERY_INSTANT);
  const balance = await morbius.balanceOf(treasury.address);
  console.log("Treasury MORBIUS:      ", hre.ethers.formatEther(balance));
  const current = await morbius.allowance(treasury.address, LOTTERY_INSTANT);
  console.log("Current allowance:    ", hre.ethers.formatEther(current));

  if (current === hre.ethers.MaxUint256) {
    console.log("Already max approval. No tx needed.");
    return;
  }

  console.log("Sending approve(LOTTERY_INSTANT, MaxUint256)...");
  const tx = await morbius.approve(LOTTERY_INSTANT, hre.ethers.MaxUint256);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Done. PLS plays can now pull MORBIUS from treasury.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
