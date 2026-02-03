import hre from "hardhat";

/**
 * Deploy TournamentPrizeEscrow.
 * Constructor: _authorizedServer = wallet that will send payout txs (server key).
 *
 * Before running:
 * 1. Set _authorizedServer: the address of the wallet whose private key the server
 *    will use (TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY).
 * 2. Set PRIVATE_KEY in .env to the deployer key (needs PLS for gas).
 *
 * Usage:
 *   AUTHORIZED_SERVER=0xYourServerWallet npx hardhat run scripts/deploy-tournament-prize-escrow.js --network pulsechain
 */
async function main() {
  console.log("Deploying TournamentPrizeEscrow to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  const AUTHORIZED_SERVER = process.env.AUTHORIZED_SERVER || process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS;
  if (!AUTHORIZED_SERVER || AUTHORIZED_SERVER === "0x0000000000000000000000000000000000000000") {
    throw new Error("Set AUTHORIZED_SERVER (or TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_ADDRESS) to the server payout wallet address");
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
