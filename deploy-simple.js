import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

async function main() {
  console.log("🚀 Deploying MegaMorbiusLottery to PulseChain...");

  // Connect to PulseChain
  const provider = new ethers.JsonRpcProvider("https://rpc.pulsechain.com");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("📍 Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "PLS");

  if (balance < ethers.parseEther("1")) {
    throw new Error("Insufficient PLS balance for deployment");
  }

  // Contract parameters
  const MORBIUS_TOKEN_ADDRESS = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const WPLS_TOKEN_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
  const PULSEX_ROUTER_ADDRESS = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
  const ROUND_DURATION = 120; // 2 minutes
  const MEGA_MORBIUS_INTERVAL = 20;
  const KEEPER_WALLET = process.env.KEEPER_WALLET || wallet.address;
  const DEPLOYER_WALLET = process.env.DEPLOYER_WALLET || wallet.address;

  console.log("⚙️  Contract Parameters:");
  console.log("   Morbius Token:", MORBIUS_TOKEN_ADDRESS);
  console.log("   WPLS Token:", WPLS_TOKEN_ADDRESS);
  console.log("   PulseX Router:", PULSEX_ROUTER_ADDRESS);
  console.log("   Round Duration:", ROUND_DURATION, "seconds");
  console.log("   MegaMorbius Interval:", MEGA_MORBIUS_INTERVAL, "rounds");
  console.log("   Keeper Wallet:", KEEPER_WALLET);
  console.log("   Deployer Wallet:", DEPLOYER_WALLET);

  try {
    // Since we can't easily compile Solidity in this simple script,
    // let's use a pre-compiled ABI and bytecode approach
    console.log("📄 Loading contract artifacts...");

    // Check if artifacts exist from previous compilation
    const artifactsPath = "contracts/artifacts/contracts/SuperStakeLottery6of55V2.sol/MegaMorbiusLottery.json";

    if (!fs.existsSync(artifactsPath)) {
      throw new Error(`Contract artifacts not found at ${artifactsPath}. Please compile the contract first using Hardhat.`);
    }

    const artifacts = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
    const contractFactory = new ethers.ContractFactory(artifacts.abi, artifacts.bytecode, wallet);

    console.log("🔨 Deploying contract...");

    const contract = await contractFactory.deploy(
      MORBIUS_TOKEN_ADDRESS,
      WPLS_TOKEN_ADDRESS,
      PULSEX_ROUTER_ADDRESS,
      ROUND_DURATION,
      MEGA_MORBIUS_INTERVAL,
      KEEPER_WALLET,
      DEPLOYER_WALLET,
      {
        gasLimit: 8000000,
        gasPrice: ethers.parseUnits("500", "gwei"),
      }
    );

    console.log("⏳ Waiting for deployment confirmation...");
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    console.log("✅ MegaMorbiusLottery deployed successfully!");
    console.log("📍 Contract Address:", contractAddress);

    // Save deployment info
    const deploymentInfo = {
      network: "pulsechain",
      contractAddress: contractAddress,
      deploymentBlock: await provider.getBlockNumber(),
      deployer: wallet.address,
      morbiusToken: MORBIUS_TOKEN_ADDRESS,
      wplsToken: WPLS_TOKEN_ADDRESS,
      pulseXRouter: PULSEX_ROUTER_ADDRESS,
      keeperWallet: KEEPER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      roundDuration: ROUND_DURATION,
      megaMorbiusInterval: MEGA_MORBIUS_INTERVAL,
      timestamp: new Date().toISOString(),
    };

    const deploymentsDir = "contracts/deployments";
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const filename = `pulsechain-${Date.now()}.json`;
    const filepath = `${deploymentsDir}/${filename}`;
    fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

    console.log(`💾 Deployment info saved to: ${filepath}`);

    // Verify initial state
    console.log("🔍 Verifying contract...");
    const currentRound = await contract.getCurrentRoundInfo();
    console.log("   Current Round ID:", currentRound.roundId.toString());
    console.log("   Round Duration:", (await contract.roundDuration()).toString(), "seconds");

    console.log("\n🎉 Deployment complete!");
    console.log("📋 Next steps:");
    console.log("   1. Update lib/contracts.ts with the new contract address");
    console.log("   2. Start the lottery keeper bot");
    console.log("   3. Test the contract functionality");

  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Deployment script failed:", error);
    process.exit(1);
  });