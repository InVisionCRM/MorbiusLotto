/**
 * Clear stuck (pending) transactions by replacing them with self-transfers at the same nonce.
 * Use the same PRIVATE_KEY (in .env) as the wallet that sent the stuck tx (e.g. the deploy).
 *
 * After running: the stuck tx is replaced/cancelled. Redeploy or retry your original action.
 *
 * Usage (from repo root or contracts):
 *   cd contracts && npx hardhat run scripts/clear-pending.js --network pulsechain
 *
 * Optional: GAS_PRICE_GWEI=700000 to use 700k gwei (default 600000; must be higher than stuck tx gas).
 */
import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Clearing stuck transactions for:", deployer.address);

  const latestNonce = await hre.ethers.provider.getTransactionCount(deployer.address, "latest");
  const pendingNonce = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");

  console.log("Latest confirmed nonce:", latestNonce);
  console.log("Pending nonce:", pendingNonce);

  if (latestNonce === pendingNonce) {
    console.log("No stuck transactions. You can deploy or send new txs as usual.");
    return;
  }

  const stuckCount = pendingNonce - latestNonce;
  console.log(`\nFound ${stuckCount} stuck transaction(s). These will be REPLACED (cancelled).`);
  console.log("After this script finishes, run your deploy (or other tx) again.\n");

  // Must be HIGHER than the gas price of the stuck tx (deploy often uses 500k gwei from hardhat config)
  const gwei = process.env.GAS_PRICE_GWEI || "600000";
  const gasPrice = hre.ethers.parseUnits(gwei, "gwei");
  console.log("Replacement gas price:", gwei, "gwei (must exceed stuck tx gas to replace)");

  for (let nonce = latestNonce; nonce < pendingNonce; nonce++) {
    console.log(`Replacing nonce ${nonce}...`);

    const tx = await deployer.sendTransaction({
      to: deployer.address,
      value: 0n,
      nonce: nonce,
      gasLimit: 21000,
      gasPrice: gasPrice,
    });

    console.log("  Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("  Confirmed in block:", receipt.blockNumber);
  }

  console.log("\nStuck transactions cleared. You can now run deploy-blackjack-v2.js (or your deploy) again.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
