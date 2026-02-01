import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Clearing stuck transactions for:", deployer.address);

  // Get current nonce state
  const latestNonce = await hre.ethers.provider.getTransactionCount(deployer.address, "latest");
  const pendingNonce = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");

  console.log("Latest confirmed nonce:", latestNonce);
  console.log("Pending nonce:", pendingNonce);

  if (latestNonce === pendingNonce) {
    console.log("No stuck transactions!");
    return;
  }

  const stuckCount = pendingNonce - latestNonce;
  console.log(`Found ${stuckCount} stuck transaction(s). Sending replacements...`);

  // Use 500,000 gwei to beat the stuck 400,000 gwei transactions
  const gasPrice = hre.ethers.parseUnits("500000", "gwei");
  console.log("Using gas price: 500000 gwei (to beat stuck 400k gwei txs)");

  // Send replacement transactions (self-transfer with 0 value, higher gas)
  for (let nonce = latestNonce; nonce < pendingNonce; nonce++) {
    console.log(`\nReplacing nonce ${nonce}...`);

    const tx = await deployer.sendTransaction({
      to: deployer.address,
      value: 0,
      nonce: nonce,
      gasLimit: 21000,
      gasPrice: gasPrice,
    });

    console.log("TX:", tx.hash);
    const receipt = await tx.wait();
    console.log("Confirmed in block:", receipt.blockNumber);
  }

  console.log("\nAll stuck transactions cleared!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
