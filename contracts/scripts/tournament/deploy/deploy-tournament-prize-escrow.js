import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploy TournamentPrizeEscrow.
 * Constructor: _authorizedServer = wallet that will send payout txs (server key).
 *
 * Before running:
 * 1. Set _authorizedServer: the address of the wallet whose private key the server
 *    will use (TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY).
 * 2. Set PRIVATE_KEY in .env to the deployer key (needs PLS for gas).
 *
 * AUTHORIZED_SERVER can be in contracts/.env or server/.env (this script loads both).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-tournament-prize-escrow.js --network pulsechain
 */
async function main() {
  // Load server/.env if AUTHORIZED_SERVER not already set (Hardhat loads contracts/.env only)
  if (!process.env.AUTHORIZED_SERVER && !process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) {
    dotenv.config({ path: path.resolve(__dirname, "../../server/.env") });
  }

  console.log("Deploying TournamentPrizeEscrow to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  let AUTHORIZED_SERVER = process.env.AUTHORIZED_SERVER || process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS;
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    const key = process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY;
    if (key && key.startsWith("0x")) {
      const w = new hre.ethers.Wallet(key.trim());
      AUTHORIZED_SERVER = w.address;
      console.log("Derived authorized server address from TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY / SETTLEMENT_PRIVATE_KEY");
    }
  }
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    throw new Error("Set AUTHORIZED_SERVER, TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS, or TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY (to derive address) in contracts/.env");
  }
  console.log("Authorized server (payout signer):", AUTHORIZED_SERVER);

  const TournamentPrizeEscrow = await hre.ethers.getContractFactory("TournamentPrizeEscrow");
  const escrow = await TournamentPrizeEscrow.deploy(AUTHORIZED_SERVER);
  const deploymentTx = escrow.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  await deploymentTx.wait();
  const addr = await escrow.getAddress();
  console.log("\n✅ TournamentPrizeEscrow deployed at:", addr);

  console.log("\n⚠️  After deploy:");
  console.log("1. Server .env: TOURNAMENT_PRIZE_ESCROW_ADDRESS=" + addr);
  console.log("2. Server .env: TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY=<private key for " + AUTHORIZED_SERVER + ">");
  console.log("3. Frontend .env: NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS=" + addr);
  console.log("4. (Optional) Server .env: ESCROW_REMAINDER_WALLET=0x... or PLATFORM_FEE_WALLET so remainder is auto-reclaimed after each tournament.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
