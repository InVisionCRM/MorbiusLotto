import hre from "hardhat";

async function main() {
  console.log("Deploying Blackjack to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config (env overrides)
  const INITIAL_OWNER = process.env.BLACKJACK_INITIAL_OWNER || deployer.address;
  const MORBIUS_TOKEN = process.env.BLACKJACK_MORBIUS_TOKEN || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_TOKEN = process.env.BLACKJACK_WPLS_TOKEN || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const PULSEX_ROUTER = process.env.BLACKJACK_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";

  // Contract parameters
  const DEPLOYER_WALLET = process.env.BLACKJACK_DEPLOYER_WALLET || deployer.address;
  const AUTHORIZED_SERVER = process.env.BLACKJACK_AUTHORIZED_SERVER || "0x0000000000000000000000000000000000000000"; // Server address
  const EMERGENCY_ADMIN = process.env.BLACKJACK_EMERGENCY_ADMIN || deployer.address;

  console.log("\nConfig:");
  console.log("INITIAL_OWNER      :", INITIAL_OWNER);
  console.log("MORBIUS_TOKEN      :", MORBIUS_TOKEN);
  console.log("WPLS_TOKEN         :", WPLS_TOKEN);
  console.log("PULSEX_ROUTER      :", PULSEX_ROUTER);
  console.log("DEPLOYER_WALLET    :", DEPLOYER_WALLET);
  console.log("AUTHORIZED_SERVER  :", AUTHORIZED_SERVER);
  console.log("EMERGENCY_ADMIN    :", EMERGENCY_ADMIN);

  const Blackjack = await hre.ethers.getContractFactory("Blackjack");
  console.log("\nDeploying…");
  const blackjack = await Blackjack.deploy(
    INITIAL_OWNER,
    MORBIUS_TOKEN,
    WPLS_TOKEN,
    PULSEX_ROUTER,
    AUTHORIZED_SERVER,
    EMERGENCY_ADMIN
  );

  const deploymentTx = blackjack.deploymentTransaction();
  console.log("Deploy tx hash:", deploymentTx?.hash);
  const receipt = await blackjack.deploymentTransaction().wait();
  const addr = await blackjack.getAddress();
  console.log("\n✅ Blackjack deployed at:", addr);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  // Verify contract configuration
  console.log("\n📊 Configuration:");
  console.log("- Multi-hand blackjack with splitting support");
  console.log("- Reserve System: Player deposits/withdrawals");
  console.log("- PLS Auto-Swap: Deposits converted to MORBIUS");
  console.log("- MORBIUS Only: Withdrawals in MORBIUS only");
  console.log("- Min Deposit: 1 MORBIUS");
  console.log("- Min Withdrawal: 1 MORBIUS");
  console.log("- Max Daily Withdrawal: 10,000 MORBIUS");
  console.log("- House Edge: 10% on winnings");
  console.log("- Provably fair with HMAC-SHA256");
  console.log("- Emergency pause functionality");

  console.log("\n💰 ECONOMICS:");
  console.log("- Players deposit PLS → auto-swapped to MORBIUS");
  console.log("- Games played from MORBIUS reserve balance");
  console.log("- Withdrawals only in MORBIUS (no PLS conversion)");
  console.log("- No MORBIUS burning");
  console.log("- Multi-hand betting with splitting");

  console.log("\n🎮 GAME FEATURES:");
  console.log("- Standard blackjack rules (dealer hits soft 17)");
  console.log("- Hit/Stand/Double Down actions");
  console.log("- Card splitting (pairs only)");
  console.log("- 3:2 natural blackjack payout");
  console.log("- Multi-hand gameplay support");
  console.log("- Real-time game state updates");

  console.log("\n⚠️  IMPORTANT - Set up the contract:");
  console.log("1. Set AUTHORIZED_SERVER environment variable for game settlements");
  console.log("2. Set EMERGENCY_ADMIN if different from deployer");
  console.log("3. Update BLACKJACK_ADDRESS in lib/contracts.ts:");
  console.log(`   export const BLACKJACK_ADDRESS = '${addr}' as const`);
  console.log("4. Generate and update ABI in abi/blackjack.ts and abi/blackjack.json");
  console.log("5. Verify contract:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${addr} "${INITIAL_OWNER}" "${MORBIUS_TOKEN}" "${WPLS_TOKEN}" "${PULSEX_ROUTER}" "${AUTHORIZED_SERVER}" "${EMERGENCY_ADMIN}"`);

  console.log("\n🎰 TESTING:");
  console.log("Test with small bets first to ensure proper payouts.");
  console.log("Verify provably fair shuffling works correctly.");
  console.log("Test both MORBIUS and PLS payments.");
  console.log("Confirm 3:2 blackjack payouts and proper fee distribution.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});