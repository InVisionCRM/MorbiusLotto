import hre from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploy SlotBankrollEscrow — the vault holding community slot machine bankrolls.
 *
 * This is deliberately SEPARATE from TournamentPrizeEscrow. Creator bankrolls and
 * tournament prize money are different concerns; one contract holding both would
 * mean a single authorized key, a single pool-id namespace, and one contract bug
 * reaching both piles of money.
 *
 * Usage:
 *   npx hardhat run scripts/slots/deploy/deploy-slot-bankroll-escrow.js --network pulsechain
 *
 * The authorized server address is taken from, in order:
 *   SLOT_ESCROW_AUTHORIZED_ADDRESS  — explicit address
 *   SLOT_ESCROW_AUTHORIZED_KEY      — derived from the dedicated slots key (preferred)
 *   SETTLEMENT_PRIVATE_KEY          — derived; works, but shares a signer with tournaments
 *
 * After deploy, set on the SERVER:
 *   SLOT_BANKROLL_ESCROW_ADDRESS=<deployed address>
 *   SLOT_ESCROW_AUTHORIZED_KEY=<the key whose address is authorizedServer>
 * and for the browser build:
 *   NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS=<deployed address>
 *
 * Until SLOT_BANKROLL_ESCROW_ADDRESS is set, real-money slot features stay gated
 * off and free play is unaffected — deploying and configuring is what turns them on.
 */
async function main() {
  if (!process.env.SLOT_ESCROW_AUTHORIZED_ADDRESS && !process.env.SLOT_ESCROW_AUTHORIZED_KEY) {
    dotenv.config({ path: path.resolve(__dirname, "../../../../server/.env") });
  }

  console.log("Deploying SlotBankrollEscrow to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer (will own the contract):", deployer.address);

  let AUTHORIZED_SERVER = process.env.SLOT_ESCROW_AUTHORIZED_ADDRESS;
  if (!AUTHORIZED_SERVER) {
    const key = process.env.SLOT_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY;
    if (key && key.trim().startsWith("0x")) {
      AUTHORIZED_SERVER = new hre.ethers.Wallet(key.trim()).address;
      console.log(
        process.env.SLOT_ESCROW_AUTHORIZED_KEY
          ? "Derived authorized server from SLOT_ESCROW_AUTHORIZED_KEY."
          : "Derived authorized server from SETTLEMENT_PRIVATE_KEY — consider a dedicated slots key."
      );
    }
  }
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === hre.ethers.ZeroAddress) {
    throw new Error(
      "No authorized server. Set SLOT_ESCROW_AUTHORIZED_ADDRESS, SLOT_ESCROW_AUTHORIZED_KEY, or SETTLEMENT_PRIVATE_KEY."
    );
  }
  console.log("Authorized server (signs payouts):", AUTHORIZED_SERVER);

  const Escrow = await hre.ethers.getContractFactory("SlotBankrollEscrow");
  const escrow = await Escrow.deploy(AUTHORIZED_SERVER);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  console.log("\nSlotBankrollEscrow deployed:", address);
  console.log("\nSet these and restart the backend:");
  console.log("  SLOT_BANKROLL_ESCROW_ADDRESS=" + address);
  console.log("  NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS=" + address);
  console.log("\nVerify:");
  console.log(`  npx hardhat verify --network ${hre.network.name} ${address} ${AUTHORIZED_SERVER}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
