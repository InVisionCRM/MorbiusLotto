import hre from "hardhat";

async function main() {
  console.log("Deploying BlackjackV2 to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  // Config (env overrides)
  const INITIAL_OWNER = process.env.BLACKJACK_INITIAL_OWNER || deployer.address;
  const MORBIUS_TOKEN = process.env.BLACKJACK_MORBIUS_TOKEN || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_TOKEN = process.env.BLACKJACK_WPLS_TOKEN || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const PULSEX_ROUTER = process.env.BLACKJACK_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  const AUTHORIZED_SERVER = process.env.BLACKJACK_AUTHORIZED_SERVER || deployer.address;
  const EMERGENCY_ADMIN = process.env.BLACKJACK_EMERGENCY_ADMIN || deployer.address;

  console.log("\nConfig:");
  console.log("INITIAL_OWNER      :", INITIAL_OWNER);
  console.log("MORBIUS_TOKEN      :", MORBIUS_TOKEN);
  console.log("WPLS_TOKEN         :", WPLS_TOKEN);
  console.log("PULSEX_ROUTER      :", PULSEX_ROUTER);
  console.log("AUTHORIZED_SERVER  :", AUTHORIZED_SERVER);
  console.log("EMERGENCY_ADMIN    :", EMERGENCY_ADMIN);

  const BlackjackV2 = await hre.ethers.getContractFactory("BlackjackV2");
  console.log("\nDeploying BlackjackV2…");
  const blackjack = await BlackjackV2.deploy(
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
  console.log("\n✅ BlackjackV2 deployed at:", addr);
  console.log("Tx hash:", deploymentTx?.hash);
  console.log("Block number:", receipt?.blockNumber?.toString?.() ?? "unknown");

  console.log("\n⚠️  POST-DEPLOYMENT STEPS:");
  console.log("1. Update BLACKJACK_ADDRESS in .env and lib/contracts.ts:");
  console.log(`   BLACKJACK_ADDRESS=${addr}`);
  console.log("2. Copy ABI: node -e \"const a=require('./contracts/artifacts/contracts/BlackjackV2.sol/BlackjackV2.json').abi; require('fs').writeFileSync('abi/blackjack.json', JSON.stringify(a,null,2)); require('fs').writeFileSync('contracts/abi/blackjack-v2.json', JSON.stringify({contractName:'BlackjackV2',abi:a},null,2)); require('fs').writeFileSync('server/src/abi/blackjack-v2.json', JSON.stringify(a,null,2));\"");
  console.log("3. Fund the contract with MORBIUS for payouts");
  console.log("4. Configure withdrawal fees (optional; defaults: 1% distribution, 1% burn):");
  console.log("   npx hardhat run scripts/configure-blackjack-v2-fees.js --network " + hre.network.name);
  console.log("5. If this deploy replaces a previous contract, set legacy so users can withdraw from old contract:");
  console.log("   NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_3=<previous_blackjack_address>");
  console.log("6. Verify contract:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${addr} "${INITIAL_OWNER}" "${MORBIUS_TOKEN}" "${WPLS_TOKEN}" "${PULSEX_ROUTER}" "${AUTHORIZED_SERVER}" "${EMERGENCY_ADMIN}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
