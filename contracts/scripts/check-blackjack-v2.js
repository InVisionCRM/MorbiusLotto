import hre from "hardhat";

async function main() {
  const ownerKey = process.env.BACKUP_PRIVATE_KEY;
  const owner = new hre.ethers.Wallet(ownerKey, hre.ethers.provider);
  const balance = await hre.ethers.provider.getBalance(owner.address);
  console.log("Owner:", owner.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  const bj = await hre.ethers.getContractAt("BlackjackV2", "0x69771cE8C2eC5a78Cf87b0a21ad801E74a3EED09");
  console.log("Contract owner:", await bj.owner());
  console.log("Paused:", await bj.paused());
  console.log("Emergency paused:", await bj.emergencyPaused());
  console.log("betFeeBps:", (await bj.betFeeBps()).toString());
  console.log("feeRecipient:", await bj.feeRecipient());
}

main().catch((err) => { console.error(err); process.exit(1); });
