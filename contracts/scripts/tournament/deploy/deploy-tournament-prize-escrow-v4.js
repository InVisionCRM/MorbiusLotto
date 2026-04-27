import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploy TournamentPrizeEscrowV4.
 *
 * Differences from V2:
 *  - 6-field `getPool` (drops phantom `active` flag)
 *  - `payoutMultiple` takes raw amounts (not %)
 *  - `setUnclaimedShares` + `claim` for the pull-backup path
 *
 * Constructor: _authorizedServer = address of the server's payout wallet.
 *
 * Usage:
 *   npx hardhat run scripts/tournament/deploy/deploy-tournament-prize-escrow-v4.js --network pulsechain
 *
 * Before running:
 *   1. PRIVATE_KEY in contracts/.env = deployer (becomes contract owner; needs PLS for gas).
 *   2. AUTHORIZED_SERVER or TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS in env (or
 *      TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY / SETTLEMENT_PRIVATE_KEY for auto-derive).
 *
 * After running, paste the printed `TOURNAMENT_PRIZE_ESCROW_V4_ADDRESS` into
 * `lib/contracts.ts` AND `server/src/abi/...` consumers.
 */
async function main() {
  // Hardhat loads contracts/.env only; pull from server/.env if missing.
  if (!process.env.AUTHORIZED_SERVER && !process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) {
    dotenv.config({ path: path.resolve(__dirname, "../../../../server/.env") });
  }

  console.log("Deploying TournamentPrizeEscrowV4 to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer (will own the contract):", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

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

  const Escrow = await hre.ethers.getContractFactory("TournamentPrizeEscrowV4");
  const escrow = await Escrow.deploy(AUTHORIZED_SERVER);
  const deployTx = escrow.deploymentTransaction();
  console.log("Deploy tx hash:", deployTx?.hash);
  await deployTx.wait();
  const addr = await escrow.getAddress();

  console.log("\n✅ TournamentPrizeEscrowV4 deployed at:", addr);

  // Sanity-check the on-chain state to catch deploy-time misconfig before code changes.
  const onChainOwner = await escrow.owner();
  const onChainServer = await escrow.authorizedServer();
  console.log("Verified on-chain owner:           ", onChainOwner);
  console.log("Verified on-chain authorizedServer:", onChainServer);
  if (onChainOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.warn("⚠️  Owner mismatch — deployer is not the on-chain owner!");
  }
  if (onChainServer.toLowerCase() !== AUTHORIZED_SERVER.toLowerCase()) {
    console.warn("⚠️  Authorized server mismatch on-chain.");
  }

  console.log("\n⚠️  After deploy, update:");
  console.log("  lib/contracts.ts → TOURNAMENT_PRIZE_ESCROW_ADDRESS = '" + addr + "'");
  console.log("  abi/tournament-prize-escrow-v2.ts → replace with V4 ABI");
  console.log("  server/src/abi/tournament-prize-escrow-v2.ts → replace with V4 ABI");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
