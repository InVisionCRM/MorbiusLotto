/**
 * Add BlackjackV2 to the OLD MorbiusHolderDistributor's ownerExcluded list.
 * This fixes getCirculating() so BlackjackV2's reserve balance is excluded.
 * Run: npx hardhat run scripts/add-blackjackv2-to-distributor-excluded.js --network pulsechain
 */
import hre from "hardhat";

const OLD_DISTRIBUTOR = "0x011eE5F4658c5183FB9f8cd72e264ca5DBd404ab";
const BLACKJACK_V2 = "0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8";

async function main() {
  const ownerKey = process.env.BACKUP_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!ownerKey) throw new Error("BACKUP_PRIVATE_KEY or PRIVATE_KEY required");
  const signer = new hre.ethers.Wallet(ownerKey, hre.ethers.provider);

  const abi = [
    "function addExcludedAddress(address addr)",
    "function getOwnerExcluded() view returns (address[])",
  ];
  const distributor = new hre.ethers.Contract(OLD_DISTRIBUTOR, abi, signer);

  const excluded = await distributor.getOwnerExcluded();
  if (excluded.includes(BLACKJACK_V2)) {
    console.log("BlackjackV2 already in excluded list");
    return;
  }

  console.log("Adding BlackjackV2 to excluded list...");
  const tx = await distributor.addExcludedAddress(BLACKJACK_V2, { gasLimit: 150000 });
  await tx.wait();
  console.log("✅ addExcludedAddress tx:", tx.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
