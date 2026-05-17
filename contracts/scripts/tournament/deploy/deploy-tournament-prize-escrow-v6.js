import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploy TournamentPrizeEscrowV6 (gas-optimized successor to V5).
 *
 * Same external API + event topics as V5. Improvements:
 *   - Packed Pool struct (6 slots → 3 slots)
 *   - No tournamentIds[] array (saves ~27k per first-time deposit)
 *   - Optional `*WithPermit` variants (EIP-2612 — one-tx flow instead of approve+deposit)
 *
 * Usage:
 *   npx hardhat run scripts/tournament/deploy/deploy-tournament-prize-escrow-v6.js --network pulsechain
 *
 * After deploy:
 *   1. Set `NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_V6_ADDRESS` (frontend, for explicit V6 references) and
 *      `TOURNAMENT_PRIZE_ESCROW_ADDRESS=<v6 addr>` (server) + `NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS=<v6 addr>` (frontend)
 *      to route ALL tournament traffic through V6.
 *   2. Old V5 pools remain queryable via the V5 contract — they don't migrate automatically.
 */
async function main() {
  if (!process.env.AUTHORIZED_SERVER && !process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) {
    dotenv.config({ path: path.resolve(__dirname, "../../../../server/.env") });
  }

  console.log("Deploying TournamentPrizeEscrowV6 to", hre.network.name, "…");

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

  const Escrow = await hre.ethers.getContractFactory("TournamentPrizeEscrowV6");
  const escrow = await Escrow.deploy(AUTHORIZED_SERVER);
  const deployTx = escrow.deploymentTransaction();
  console.log("Deploy tx hash:", deployTx?.hash);
  await deployTx.wait();
  const addr = await escrow.getAddress();

  console.log("\n✅ TournamentPrizeEscrowV6 deployed at:", addr);
  console.log("\nAfter deploy, set in server/.env (and your hosting env):");
  console.log("  TOURNAMENT_PRIZE_ESCROW_ADDRESS=" + addr);
  console.log("\nAnd in frontend .env (Next.js build env):");
  console.log("  NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS=" + addr);
  console.log("  NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_V6_ADDRESS=" + addr);
  console.log("\nThen update the V5 ABI imports across the codebase to use");
  console.log("  @/abi/tournament-prize-escrow-v6  (frontend)");
  console.log("  ../abi/tournament-prize-escrow-v6 (server)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
