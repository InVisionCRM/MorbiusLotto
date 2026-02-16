import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploy TournamentPrizeEscrowV3.
 * Uses uint256 tournament IDs (from MorbiusTournament). Same authorized server as V2.
 *
 * Usage:
 *   cd contracts && npx hardhat run scripts/deploy-tournament-prize-escrow-v3.js --network pulsechain
 */
async function main() {
  if (!process.env.AUTHORIZED_SERVER && !process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) {
    dotenv.config({ path: path.resolve(__dirname, "../../server/.env") });
  }

  let AUTHORIZED_SERVER = process.env.AUTHORIZED_SERVER || process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS;
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    const key = process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY;
    if (key && key.startsWith("0x")) {
      const w = new hre.ethers.Wallet(key.trim());
      AUTHORIZED_SERVER = w.address;
    }
  }
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    throw new Error("Set AUTHORIZED_SERVER or TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY in .env");
  }

  console.log("Deploying TournamentPrizeEscrowV3 to", hre.network.name, "…");
  console.log("  Authorized server:", AUTHORIZED_SERVER);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const TournamentPrizeEscrowV3 = await hre.ethers.getContractFactory("TournamentPrizeEscrowV3");
  const escrow = await TournamentPrizeEscrowV3.deploy(AUTHORIZED_SERVER);
  const tx = escrow.deploymentTransaction();
  console.log("Deploy tx:", tx?.hash);
  await tx.wait();

  const addr = await escrow.getAddress();
  console.log("\n✅ TournamentPrizeEscrowV3 deployed at:", addr);

  console.log("\n📋 Verification:");
  console.log(`  npx hardhat run scripts/verify-tournament-escrow-v3.js --network pulsechain`);
  console.log(`  # Or manual: npx hardhat verify --network pulsechain ${addr} "${AUTHORIZED_SERVER}"`);

  console.log("\n⚠️  Update .env:");
  console.log("  TOURNAMENT_PRIZE_ESCROW_V3_ADDRESS=" + addr);
  console.log("  (Use with MorbiusTournament for uint256 tournament IDs)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
