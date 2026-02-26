/**
 * cancel-stuck-txs.js
 *
 * Sends 0-value self-transfers at stuck nonces to unblock the TX queue.
 * Run this BEFORE redeploying when transactions are stuck due to low gas.
 *
 * Usage:
 *   npx hardhat run scripts/cancel-stuck-txs.js --network pulsechain
 */

import hre from "hardhat";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei")) * 2n;

  const confirmedNonce = await hre.ethers.provider.getTransactionCount(signer.address, "latest");
  const pendingNonce = await hre.ethers.provider.getTransactionCount(signer.address, "pending");

  console.log("Wallet          :", signer.address);
  console.log("GasPrice        :", hre.ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Confirmed nonce :", confirmedNonce);
  console.log("Pending nonce   :", pendingNonce);
  console.log("─".repeat(50));

  if (confirmedNonce >= pendingNonce) {
    console.log("✅ No stuck transactions — queue is clear.");
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
