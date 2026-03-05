/**
 * Deploy InstantLottery6of55 (includes operator + resolvePlay for provably-fair server play).
 *
 * Usage: cd contracts && npx hardhat run scripts/lottery/deploy/deploy-instant-lottery.js --network pulsechain
 *
 * Required .env: PLS_TREASURY, DISTRIBUTION_RECIPIENT, PLATFORM_FEE_RECIPIENT, LP_DISTRIBUTION_RECIPIENT
 * Optional: INSTANT_LOTTERY_MORBIUS_TOKEN, INSTANT_LOTTERY_WPLS_TOKEN, INSTANT_LOTTERY_ROUTER,
 *           INSTANT_LOTTERY_MIN_WAGER, INSTANT_LOTTERY_MAX_WAGER, BURN_ADDRESS,
 *           LOTTERY_OPERATOR_ADDRESS (set to server operator wallet for provably-fair API),
 *           DEPLOY_NONCE
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying InstantLottery6of55 to", hre.network.name, "…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "PLS");

  const MORBIUS_TOKEN = process.env.INSTANT_LOTTERY_MORBIUS_TOKEN || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_TOKEN = process.env.INSTANT_LOTTERY_WPLS_TOKEN || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const PULSEX_ROUTER = process.env.INSTANT_LOTTERY_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  const MIN_WAGER = process.env.INSTANT_LOTTERY_MIN_WAGER || hre.ethers.parseEther("1");
  const MAX_WAGER = process.env.INSTANT_LOTTERY_MAX_WAGER || hre.ethers.parseEther("1000");
  const PLS_TREASURY = process.env.PLS_TREASURY;
  const DISTRIBUTION_RECIPIENT = process.env.DISTRIBUTION_RECIPIENT;
  const BURN_ADDRESS = process.env.BURN_ADDRESS || "0x000000000000000000000000000000000000dEaD";
  const PLATFORM_FEE_RECIPIENT = process.env.PLATFORM_FEE_RECIPIENT;
  const LP_DISTRIBUTION_RECIPIENT = process.env.LP_DISTRIBUTION_RECIPIENT;

  if (!PLS_TREASURY || !DISTRIBUTION_RECIPIENT || !PLATFORM_FEE_RECIPIENT || !LP_DISTRIBUTION_RECIPIENT) {
    throw new Error("Set PLS_TREASURY, DISTRIBUTION_RECIPIENT, PLATFORM_FEE_RECIPIENT, LP_DISTRIBUTION_RECIPIENT in .env");
  }

  console.log("\nConfig:");
  console.log("MORBIUS_TOKEN    :", MORBIUS_TOKEN);
  console.log("WPLS_TOKEN       :", WPLS_TOKEN);
  console.log("PULSEX_ROUTER    :", PULSEX_ROUTER);
  console.log("MIN_WAGER        :", hre.ethers.formatEther(MIN_WAGER), "MORBIUS");
  console.log("MAX_WAGER        :", hre.ethers.formatEther(MAX_WAGER), "MORBIUS");
  console.log("PLS_TREASURY     :", PLS_TREASURY);
  console.log("DISTRIBUTION_RECIPIENT :", DISTRIBUTION_RECIPIENT);
  console.log("BURN_ADDRESS     :", BURN_ADDRESS);
  console.log("PLATFORM_FEE_RECIPIENT :", PLATFORM_FEE_RECIPIENT);
  console.log("LP_DISTRIBUTION_RECIPIENT :", LP_DISTRIBUTION_RECIPIENT);

  const InstantLottery = await hre.ethers.getContractFactory("InstantLottery6of55");
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei")) * 13n / 10n;
  const overrides = { gasLimit: 3000000, gasPrice };
  if (process.env.DEPLOY_NONCE) {
    overrides.nonce = parseInt(process.env.DEPLOY_NONCE, 10);
  }

  const lottery = await InstantLottery.deploy(
    MORBIUS_TOKEN,
    WPLS_TOKEN,
    PULSEX_ROUTER,
    MIN_WAGER,
    MAX_WAGER,
    PLS_TREASURY,
    DISTRIBUTION_RECIPIENT,
    BURN_ADDRESS,
    PLATFORM_FEE_RECIPIENT,
    LP_DISTRIBUTION_RECIPIENT,
    overrides
  );

  const tx = lottery.deploymentTransaction();
  await tx.wait();
  const addr = await lottery.getAddress();
  console.log("\n✅ InstantLottery6of55 deployed at:", addr);
  console.log("Tx hash:", tx.hash);

  const operatorAddress = (process.env.LOTTERY_OPERATOR_ADDRESS || "").trim();
  if (operatorAddress && /^0x[a-fA-F0-9]{40}$/.test(operatorAddress)) {
    console.log("\nSetting operator to", operatorAddress, "…");
    const setOpTx = await lottery.setOperator(operatorAddress, overrides);
    await setOpTx.wait();
    console.log("  Operator set. Tx:", setOpTx.hash);
    const current = await lottery.operator();
    if (current.toLowerCase() !== operatorAddress.toLowerCase()) {
      throw new Error("Operator mismatch after setOperator");
    }
  } else if (operatorAddress) {
    console.warn("\n⚠️  LOTTERY_OPERATOR_ADDRESS is set but invalid (need 0x + 40 hex). Skipping setOperator.");
  } else {
    console.log("\n⚠️  LOTTERY_OPERATOR_ADDRESS not set. Set it and call setOperator(operator) for provably-fair server play.");
  }

  // ABI: use compiled artifact (contracts/artifacts/...) or existing contracts/abi copy
  const artifactsDir = path.join(__dirname, "..", "..", "..", "artifacts");
  const abiDir = path.join(__dirname, "..", "..", "..", "abi");
  const artifactPathBuild = path.join(artifactsDir, "contracts", "InstantLottery6of55.sol", "InstantLottery6of55.json");
  const destPath = path.join(abiDir, "instant-lottery-6of55.json");
  if (fs.existsSync(artifactPathBuild)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPathBuild, "utf8"));
    const outAbi = artifact.abi ?? artifact;
    fs.writeFileSync(destPath, JSON.stringify({ contractName: "InstantLottery6of55", abi: outAbi }, null, 2));
    console.log("ABI written to", path.resolve(destPath));
  } else {
    console.log("(Skip ABI write: artifact not found at", artifactPathBuild, ")");
  }

  console.log("\n⚠️  Fund the contract reserve (MORBIUS) so it can pay winners:");
  console.log("  fundContract(amount) or run a fund script.");
  console.log("\nUpdate lib/contracts.ts (and server .env):");
  console.log("  LOTTERY_INSTANT_ADDRESS / NEXT_PUBLIC_LOTTERY_INSTANT_ADDRESS = '" + addr + "'");
  console.log("\nVerify on PulseScan:");
  console.log("  INSTANT_LOTTERY_INSTANT_ADDRESS=" + addr + " npx hardhat run scripts/lottery/verify/verify-instant-lottery.js --network pulsechain");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
