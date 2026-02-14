import hre from "hardhat";

async function main() {
  const CONTRACT_ADDRESS = process.env.BLACKJACK_ADDRESS || "0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8";
  const ownerKey = process.env.BACKUP_PRIVATE_KEY;
  const owner = new hre.ethers.Wallet(ownerKey, hre.ethers.provider);

  const artifact = await hre.artifacts.readArtifact("BlackjackV2");
  const blackjack = new hre.ethers.Contract(CONTRACT_ADDRESS, artifact.abi, owner);

  // Try static call to get revert reason
  try {
    await blackjack.setBetFee.staticCall(200);
    console.log("Static call succeeded - should work");
  } catch (e) {
    console.log("Static call failed:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }

  // Try raw call to get revert data
  try {
    const iface = new hre.ethers.Interface(artifact.abi);
    const data = iface.encodeFunctionData("setBetFee", [200]);
    console.log("\nEncoded calldata:", data);

    const result = await hre.ethers.provider.call({
      to: CONTRACT_ADDRESS,
      from: owner.address,
      data: data
    });
    console.log("Raw call result:", result);
  } catch (e) {
    console.log("Raw call error:", e.message);
    if (e.data) console.log("Revert data:", e.data);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
