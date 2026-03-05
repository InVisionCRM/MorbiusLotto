import hre from "hardhat";

async function main() {
  const ownerKey = process.env.BACKUP_PRIVATE_KEY;
  const owner = new hre.ethers.Wallet(ownerKey || "0x0000000000000000000000000000000000000001", hre.ethers.provider);
  const contractAddress = process.env.BLACKJACK_ADDRESS || "0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8";

  const bj = await hre.ethers.getContractAt("BlackjackV2", contractAddress);
  console.log("Contract:", contractAddress);
  console.log("Contract owner:", await bj.owner());
  console.log("Paused:", await bj.paused());
  console.log("Emergency paused:", await bj.emergencyPaused());
  console.log("\nWithdrawal fees:");
  console.log("  distributionFeeBps:", (await bj.distributionFeeBps()).toString());
  console.log("  distributionRecipient:", await bj.distributionRecipient());
  console.log("  burnFeeBps:", (await bj.burnFeeBps()).toString());
  console.log("  burnAddress:", await bj.burnAddress());
  console.log("\nTotals:");
  console.log("  totalDistributionFeesCollected:", (await bj.totalDistributionFeesCollected()).toString());
  console.log("  totalBurned:", (await bj.totalBurned()).toString());
  console.log("  totalReserves:", (await bj.totalReserves()).toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
