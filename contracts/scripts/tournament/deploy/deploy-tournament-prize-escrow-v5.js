import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploy TournamentPrizeEscrowV5 (V4 + addToPrizePool for PRC-20 buy-in tournaments).
 *
 * Usage:
 *   npx hardhat run scripts/tournament/deploy/deploy-tournament-prize-escrow-v5.js --network pulsechain
 *
 * After deploy, set server `TOURNAMENT_PRIZE_ESCROW_ADDRESS` and frontend
 * `NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS`, and update `lib/contracts.ts` default if desired.
 */
async function main() {
  if (!process.env.AUTHORIZED_SERVER && !process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) {
    dotenv.config({ path: path.resolve(__dirname, "../../../../server/.env") });
  }

  console.log("Deploying TournamentPrizeEscrowV5 to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer (will own the contract):", deployer.address);

  let AUTHORIZED_SERVER =
    process.env.AUTHORIZED_SERVER || process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS;
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    const key = process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY;
    if (key && key.startsWith("0x")) {
      const w = new hre.ethers.Wallet(key.trim());
      AUTHORIZED_SERVER = w.address;
      console.log("Derived authorized server address from server private key.");
    }
  }
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "Set AUTHORIZED_SERVER, TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS, or " +
      "TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY (to derive) in contracts/.env or server/.env",
    );
  }
  console.log("Authorized server (payout signer):", AUTHORIZED_SERVER);

  const Escrow = await hre.ethers.getContractFactory("TournamentPrizeEscrowV5");
  const escrow = await Escrow.deploy(AUTHORIZED_SERVER);
  const deployTx = escrow.deploymentTransaction();
  console.log("Deploy tx hash:", deployTx?.hash);
  await deployTx.wait();
  const addr = await escrow.getAddress();

  console.log("\n✅ TournamentPrizeEscrowV5 deployed at:", addr);
  console.log("\nAfter deploy, set:");
  console.log("  TOURNAMENT_PRIZE_ESCROW_ADDRESS=" + addr);
  console.log("  NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS=" + addr);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
