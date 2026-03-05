/**
 * cancel-stuck-txs.js
 *
 * Sends 0-value self-transfers at stuck nonces to unblock the TX queue.
 * Run this BEFORE redeploying when transactions are stuck due to low gas.
 *
 * Usage:
 *   npx hardhat run scripts/utils/debug/cancel-stuck-txs.js --network pulsechain
 *
 * Uses BACKUP_PRIVATE_KEY from .env when set; otherwise uses default signer (PRIVATE_KEY).
 *
 * If RPC reports no pending but you know there is a stuck tx, use:
 *   FORCE_REPLACE_NEXT=1 npx hardhat run scripts/utils/debug/cancel-stuck-txs.js --network pulsechain
 * Optional: GAS_PRICE_GWEI=2000000 to set replacement gas (default: 2x chain base, or 1.5M gwei floor).
 */

import hre from "hardhat";

async function main() {
  let signer;
  if (process.env.BACKUP_PRIVATE_KEY) {
    signer = new hre.ethers.Wallet(process.env.BACKUP_PRIVATE_KEY.trim(), hre.ethers.provider);
    console.log("Using signer from BACKUP_PRIVATE_KEY");
  } else {
    [signer] = await hre.ethers.getSigners();
  }
  const feeData = await hre.ethers.provider.getFeeData();
  const baseGas = feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei");
  const gasPrice = process.env.GAS_PRICE_GWEI
    ? hre.ethers.parseUnits(process.env.GAS_PRICE_GWEI, "gwei")
    : (baseGas * 2n > hre.ethers.parseUnits("1500000", "gwei") ? baseGas * 2n : hre.ethers.parseUnits("1500000", "gwei"));

  const confirmedNonce = await hre.ethers.provider.getTransactionCount(signer.address, "latest");
  let pendingNonce = await hre.ethers.provider.getTransactionCount(signer.address, "pending");
  const forceReplace = process.env.FORCE_REPLACE_NEXT === "1" || process.env.FORCE_REPLACE_NEXT === "true";

  console.log("Wallet          :", signer.address);
  console.log("GasPrice        :", hre.ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Confirmed nonce :", confirmedNonce);
  console.log("Pending nonce   :", pendingNonce);
  if (forceReplace && confirmedNonce >= pendingNonce) {
    pendingNonce = confirmedNonce + 1;
    console.log("FORCE_REPLACE_NEXT=1: will try to replace nonce", confirmedNonce);
  }
  console.log("─".repeat(50));

  if (confirmedNonce >= pendingNonce && !forceReplace) {
    console.log("✅ No stuck transactions — queue is clear.");
    console.log("   (If you still see pending on explorer, run with FORCE_REPLACE_NEXT=1)");
    return;
  }

  for (let nonce = confirmedNonce; nonce < pendingNonce; nonce++) {
    console.log(`\nCancelling nonce ${nonce}…`);
    const tx = await signer.sendTransaction({
      to: signer.address,
      value: 0n,
      nonce,
      gasLimit: 21000,
      gasPrice,
    });
    console.log(`  TX hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  ✅ Confirmed at block ${receipt.blockNumber}`);
  }

  console.log("\n✅ All stuck nonces cancelled. You can now redeploy.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
