/**
 * Deploy BlackjackVault — the stateless deposit router that replaces the V7 reserve contract.
 *
 * The vault forwards every deposit straight to a treasury/hot wallet and emits the same
 * DepositMORBIUS / Deposit events the server already watches. It holds no balance and has no
 * per-player reserve accounting, so funds can never be trapped again (and rescueTokens/rescuePLS
 * guarantee anything force-sent can always be recovered).
 *
 * Usage (from contracts/, with PRIVATE_KEY = owner/deployer in .env):
 *   VAULT_MORBIUS_TREASURY=0x... npx hardhat run scripts/blackjack/deploy/deploy-blackjack-vault.js --network pulsechain
 *
 * Required env:
 *   VAULT_MORBIUS_TREASURY   where MORBIUS deposits are forwarded (usually the hot wallet that funds payouts)
 *
 * Optional env (sensible PulseChain defaults from the V7 deployment):
 *   VAULT_INITIAL_OWNER      default: deployer
 *   VAULT_MORBIUS_TOKEN      default: 0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1
 *   VAULT_WPLS_TOKEN         default: 0xA1077a294dDE1B09bB078844df40758a5D0f9a27
 *   VAULT_ROUTER             default: 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02  (PulseX router, price quotes for PLS deposits)
 *   VAULT_PLS_TREASURY       default: 0x41682815b05fe6b54a6c0f8813bb99423ee0309d  (V7 plsTreasury)
 */

import hre from "hardhat";

async function main() {
  console.log("Deploying BlackjackVault to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  const INITIAL_OWNER = process.env.VAULT_INITIAL_OWNER || deployer.address;
  const MORBIUS_TOKEN = process.env.VAULT_MORBIUS_TOKEN || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_TOKEN = process.env.VAULT_WPLS_TOKEN || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const PULSEX_ROUTER = process.env.VAULT_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  const MORBIUS_TREASURY = process.env.VAULT_MORBIUS_TREASURY;
  const PLS_TREASURY = process.env.VAULT_PLS_TREASURY || "0x41682815b05fe6b54a6c0f8813bb99423ee0309d";

  if (!MORBIUS_TREASURY) {
    throw new Error(
      "VAULT_MORBIUS_TREASURY is not set — set it to the wallet that should receive forwarded MORBIUS deposits (typically the hot wallet that funds payouts)."
    );
  }

  console.log("\nConfig:");
  console.log("INITIAL_OWNER      :", INITIAL_OWNER);
  console.log("MORBIUS_TOKEN      :", MORBIUS_TOKEN);
  console.log("WPLS_TOKEN         :", WPLS_TOKEN);
  console.log("PULSEX_ROUTER      :", PULSEX_ROUTER, "(price quotes only, no swap)");
  console.log("MORBIUS_TREASURY   :", MORBIUS_TREASURY, "(receives forwarded MORBIUS deposits)");
  console.log("PLS_TREASURY       :", PLS_TREASURY, "(receives forwarded PLS deposits)");

  const Vault = await hre.ethers.getContractFactory("BlackjackVault");
  console.log("\nDeploying…");
  const vault = await Vault.deploy(
    INITIAL_OWNER,
    MORBIUS_TOKEN,
    WPLS_TOKEN,
    PULSEX_ROUTER,
    MORBIUS_TREASURY,
    PLS_TREASURY
  );

  const deployTx = vault.deploymentTransaction();
  console.log("Deploy tx hash:", deployTx?.hash);
  await deployTx.wait();
  const addr = await vault.getAddress();

  console.log("\n✅ BlackjackVault deployed at:", addr);
  console.log("\nNext steps:");
  console.log("  1. Verify: npx hardhat verify --network", hre.network.name, addr,
    INITIAL_OWNER, MORBIUS_TOKEN, WPLS_TOKEN, PULSEX_ROUTER, MORBIUS_TREASURY, PLS_TREASURY);
  console.log("  2. Point the app at it: set BLACKJACK deposit address to", addr, "in lib/contracts.ts");
  console.log("  3. Point the server deposit watcher (money.service.ts / chain-analytics) at", addr);
  console.log("  4. Keep the V7 reserve contract paused; do NOT route new deposits there.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
