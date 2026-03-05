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
  const DISTRIBUTION_RECIPIENT = process.env.MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS || "0x011eE5F4658c5183FB9f8cd72e264ca5DBd404ab";
  const BURN_ADDRESS = process.env.BURN_ADDRESS || "0x000000000000000000000000000000000000dEaD";
  const PLATFORM_FEE_RECIPIENT = process.env.PLATFORM_FEE_WALLET || deployer.address;
  const LP_DISTRIBUTION_RECIPIENT = process.env.LP_DISTRIBUTION_RECIPIENT;
  const PLS_TREASURY = process.env.PLS_TREASURY || deployer.address;

  if (!LP_DISTRIBUTION_RECIPIENT) {
    throw new Error("LP_DISTRIBUTION_RECIPIENT is not set in .env — set it to the contract/wallet that receives the 1.5% LP holder distribution fee on withdrawals");
  }

  console.log("\nConfig:");
  console.log("INITIAL_OWNER             :", INITIAL_OWNER);
  console.log("MORBIUS_TOKEN             :", MORBIUS_TOKEN);
  console.log("WPLS_TOKEN                :", WPLS_TOKEN);
  console.log("PULSEX_ROUTER             :", PULSEX_ROUTER);
  console.log("AUTHORIZED_SERVER         :", AUTHORIZED_SERVER);
  console.log("EMERGENCY_ADMIN           :", EMERGENCY_ADMIN);
  console.log("DISTRIBUTION_RECIPIENT    :", DISTRIBUTION_RECIPIENT, "(1.25% MORBIUS holders fee)");
  console.log("BURN_ADDRESS              :", BURN_ADDRESS, "(0.5% burn fee)");
  console.log("PLATFORM_FEE_RECIPIENT    :", PLATFORM_FEE_RECIPIENT, "(1.75% platform fee)");
  console.log("LP_DISTRIBUTION_RECIPIENT :", LP_DISTRIBUTION_RECIPIENT, "(1.5% LP holders fee)");
  console.log("PLS_TREASURY              :", PLS_TREASURY, "(receives PLS from PLS deposits)");

  const BlackjackV2 = await hre.ethers.getContractFactory("BlackjackV2");
  console.log("\nDeploying BlackjackV2…");
  const blackjack = await BlackjackV2.deploy(
    INITIAL_OWNER,
    MORBIUS_TOKEN,
    WPLS_TOKEN,
    PULSEX_ROUTER,
    AUTHORIZED_SERVER,
    EMERGENCY_ADMIN,
    DISTRIBUTION_RECIPIENT,
    BURN_ADDRESS,
    PLATFORM_FEE_RECIPIENT,
    LP_DISTRIBUTION_RECIPIENT,
    PLS_TREASURY
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
  console.log("4. Fees are set in constructor (2.5% distribution, 2.5% platform, 1.5% PLS deposit).");
  console.log("   To reconfigure: npx hardhat run scripts/configure-blackjack-v2-fees.js --network " + hre.network.name);
  console.log("5. If this deploy replaces a previous contract, set legacy so users can withdraw from old contract:");
  console.log("   NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_3=<previous_blackjack_address>");
  console.log("6. Verify contract:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${addr} "${INITIAL_OWNER}" "${MORBIUS_TOKEN}" "${WPLS_TOKEN}" "${PULSEX_ROUTER}" "${AUTHORIZED_SERVER}" "${EMERGENCY_ADMIN}" "${DISTRIBUTION_RECIPIENT}" "${BURN_ADDRESS}" "${PLATFORM_FEE_RECIPIENT}" "${LP_DISTRIBUTION_RECIPIENT}" "${PLS_TREASURY}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
