/**
 * approve-plinko.js
 *
 * Signs a MaxUint256 MORBIUS approval from the treasury wallet to the Plinko contract.
 * Must be run with the TREASURY_PRIVATE_KEY of the wallet set as PLS_TREASURY.
 *
 * Usage:
 *   npx hardhat run scripts/approve-plinko.js --network pulsechain
 *
 * Required env vars (in contracts/.env):
 *   TREASURY_PRIVATE_KEY  — private key of the PLS_TREASURY wallet (0x41682815...)
 *   PLINKO_ADDRESS        — deployed Plinko contract address
 *   MORBIUS_TOKEN_ADDRESS — MORBIUS ERC20 address (defaults to mainnet address)
 */

import hre from "hardhat";

const MORBIUS_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

async function main() {
  const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
  const PLINKO_ADDRESS       = process.env.PLINKO_ADDRESS;
  const MORBIUS_ADDRESS      = process.env.MORBIUS_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

  if (!TREASURY_PRIVATE_KEY) {
    throw new Error(
      "TREASURY_PRIVATE_KEY not set in .env\n" +
      "This must be the private key for the PLS_TREASURY wallet (0x41682815...)\n" +
      "Add it to contracts/.env as: TREASURY_PRIVATE_KEY=0x..."
    );
  }
  if (!PLINKO_ADDRESS) {
    throw new Error("PLINKO_ADDRESS not set in contracts/.env");
  }

  const treasury = new hre.ethers.Wallet(TREASURY_PRIVATE_KEY, hre.ethers.provider);
  const morbius  = new hre.ethers.Contract(MORBIUS_ADDRESS, MORBIUS_ABI, treasury);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔑  Treasury wallet :", treasury.address);
  console.log("🎰  Plinko contract  :", PLINKO_ADDRESS);
  console.log("🪙  MORBIUS token    :", MORBIUS_ADDRESS);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const balance = await morbius.balanceOf(treasury.address);
  console.log("💰  Treasury MORBIUS balance :", hre.ethers.formatEther(balance), "MORBIUS");

  const existing = await morbius.allowance(treasury.address, PLINKO_ADDRESS);
  console.log("📋  Current allowance        :", hre.ethers.formatEther(existing), "MORBIUS");

  if (existing === hre.ethers.MaxUint256) {
    console.log("\n✅  Already approved for MaxUint256 — nothing to do.");
    return;
  }

  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei")) * 13n / 10n;

  console.log("\n⏳  Sending approve(Plinko, MaxUint256)…");
  const tx = await morbius.approve(PLINKO_ADDRESS, hre.ethers.MaxUint256, { gasPrice });

  console.log("   Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("   ✅  Confirmed at block", receipt.blockNumber);

  const newAllowance = await morbius.allowance(treasury.address, PLINKO_ADDRESS);
  console.log("\n✅  New allowance:", newAllowance === hre.ethers.MaxUint256
    ? "MaxUint256 (unlimited)"
    : hre.ethers.formatEther(newAllowance) + " MORBIUS"
  );

  console.log("\n📋  The treasury wallet can now fund PLS-purchased payouts.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
