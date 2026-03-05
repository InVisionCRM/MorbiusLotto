import hre from "hardhat";

const BLACKJACK_ADDRESS = "0x1b38626A12085547C35bD80455d054950AD72Cde";
// Address derived from the server's current SETTLEMENT_PRIVATE_KEY
const NEW_AUTHORIZED_SERVER = "0x2775dD8242C4f589536113475B7C80F42ab4A70A";

async function main() {
  const ownerKey = process.env.PRIVATE_KEY;
  if (!ownerKey) throw new Error("PRIVATE_KEY not set in .env");
  const owner = new hre.ethers.Wallet(ownerKey, hre.ethers.provider);
  console.log("Caller (owner):", owner.address);
  console.log("Contract:      ", BLACKJACK_ADDRESS);
  console.log("New server:    ", NEW_AUTHORIZED_SERVER);

  const artifact = await hre.artifacts.readArtifact("BlackjackV2");
  const blackjack = new hre.ethers.Contract(BLACKJACK_ADDRESS, artifact.abi, owner);

  const tx = await blackjack.setAuthorizedServer(NEW_AUTHORIZED_SERVER, { gasLimit: 100000 });
  console.log("Tx submitted:", tx.hash);
  await tx.wait();
  console.log("Done — authorizedServer updated.");
}

main().catch((e) => { console.error(e); process.exit(1); });
