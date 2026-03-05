import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploy MorbiusTournament contract.
 * Uses uint256 tournament IDs. Works with TournamentPrizeEscrowV3 for custom token prizes.
 *
 * Usage:
 *   cd contracts && npx hardhat run scripts/deploy-morbius-tournament.js --network pulsechain
 */
async function main() {
  if (!process.env.AUTHORIZED_SERVER && !process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) {
    dotenv.config({ path: path.resolve(__dirname, "../../server/.env") });
  }

  const MORBIUS_TOKEN = process.env.MORBIUS_TOKEN_ADDRESS || process.env.BLACKJACK_MORBIUS_TOKEN || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  let AUTHORIZED_SERVER = process.env.AUTHORIZED_SERVER || process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS;
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    const key = process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY;
    if (key && key.startsWith("0x")) {
      const w = new hre.ethers.Wallet(key.trim());
      AUTHORIZED_SERVER = w.address;
    }
  }
  const PLATFORM_FEE_WALLET = process.env.PLATFORM_FEE_WALLET || process.env.BLACKJACK_FEE_WALLET || AUTHORIZED_SERVER;

  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    throw new Error("Set AUTHORIZED_SERVER or TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY in .env");
  }

  console.log("Deploying MorbiusTournament to", hre.network.name, "…");
  console.log("  MORBIUS_TOKEN     :", MORBIUS_TOKEN);
  console.log("  AUTHORIZED_SERVER :", AUTHORIZED_SERVER);
  console.log("  PLATFORM_FEE_WALLET:", PLATFORM_FEE_WALLET);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const MorbiusTournament = await hre.ethers.getContractFactory("MorbiusTournament");
  const tournament = await MorbiusTournament.deploy(MORBIUS_TOKEN, AUTHORIZED_SERVER, PLATFORM_FEE_WALLET);
  const tx = tournament.deploymentTransaction();
  console.log("Deploy tx:", tx?.hash);
  await tx.wait();

  const addr = await tournament.getAddress();
  console.log("\n✅ MorbiusTournament deployed at:", addr);

  console.log("\n📋 Verification:");
  console.log(`  npx hardhat run scripts/verify-morbius-tournament.js --network pulsechain`);
  console.log(`  # Or manual: npx hardhat verify --network pulsechain ${addr} "${MORBIUS_TOKEN}" "${AUTHORIZED_SERVER}" "${PLATFORM_FEE_WALLET}"`);

  console.log("\n⚠️  Update .env:");
  console.log("  MORBIUS_TOURNAMENT_ADDRESS=" + addr);
  console.log("  NEXT_PUBLIC_MORBIUS_TOURNAMENT_ADDRESS=" + addr);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
