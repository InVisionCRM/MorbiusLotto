import hre from "hardhat";

async function main() {
  console.log("Configuring Blackjack contract...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Contract address (update this with your deployed address)
  const CONTRACT_ADDRESS = process.env.BLACKJACK_ADDRESS || "0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080";

  // Get contract instance
  const blackjack = await hre.ethers.getContractAt("Blackjack", CONTRACT_ADDRESS);

  // Server configuration
  const AUTHORIZED_SERVER = process.env.AUTHORIZED_SERVER || "YOUR_SERVER_ADDRESS_HERE";
  const EMERGENCY_ADMIN = process.env.EMERGENCY_ADMIN || deployer.address;

  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Authorized Server:", AUTHORIZED_SERVER);
  console.log("Emergency Admin:", EMERGENCY_ADMIN);

  // Set authorized server for settlements
  console.log("\nSetting authorized server...");
  const tx1 = await blackjack.setAuthorizedServer(AUTHORIZED_SERVER);
  await tx1.wait();
  console.log("✅ Authorized server set:", tx1.hash);

  // Set emergency admin (optional)
  if (EMERGENCY_ADMIN !== deployer.address) {
    console.log("\nSetting emergency admin...");
    const tx2 = await blackjack.setEmergencyAdmin(EMERGENCY_ADMIN);
    await tx2.wait();
    console.log("✅ Emergency admin set:", tx2.hash);
  }

  // Verify configuration
  console.log("\nVerifying configuration...");
  const owner = await blackjack.owner();
  const server = await blackjack.authorizedServer();
  const admin = await blackjack.emergencyAdmin();

  console.log("Owner:", owner);
  console.log("Authorized Server:", server);
  console.log("Emergency Admin:", admin);

  console.log("\n✅ Contract configuration complete!");
}

// To run this script:
// 1. Set your environment variables:
//    AUTHORIZED_SERVER=your_server_address
//    EMERGENCY_ADMIN=your_admin_address (optional)
//
// 2. Run: npx hardhat run scripts/configure-blackjack.js --network pulsechain

main().catch((err) => {
  console.error(err);
  process.exit(1);
});