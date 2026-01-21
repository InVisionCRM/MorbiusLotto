import hre from "hardhat";

async function main() {
  console.log("Configuring Blackjack contract as owner...");

  // Contract address
  const CONTRACT_ADDRESS = process.env.BLACKJACK_ADDRESS || "0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080";

  // Get contract instance
  const blackjack = await hre.ethers.getContractAt("Blackjack", CONTRACT_ADDRESS);

  // Get the current owner from the contract
  const currentOwner = await blackjack.owner();
  console.log("Contract owner:", currentOwner);

  // We need to use the OWNER's private key to authorize the server
  // The owner is 0x2775dD8242C4f589536113475B7C80F42ab4A70A (BACKUP_PRIVATE_KEY)
  const OWNER_PRIVATE_KEY = process.env.BACKUP_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!OWNER_PRIVATE_KEY) {
    throw new Error("BACKUP_PRIVATE_KEY or PRIVATE_KEY must be set in .env (needs to match contract owner)");
  }

  const ownerWallet = new hre.ethers.Wallet(OWNER_PRIVATE_KEY, hre.ethers.provider);
  console.log("Signing wallet:", ownerWallet.address);

  // Verify we're using the owner's key
  if (currentOwner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
    throw new Error(`Owner mismatch: contract owner is ${currentOwner}, but signing wallet is ${ownerWallet.address}. Use the owner's private key.`);
  }

  // Server configuration - derive server address from SETTLEMENT_PRIVATE_KEY
  // This is the server wallet that will call settleGame() - it needs to be authorized
  const SETTLEMENT_PRIVATE_KEY = process.env.SETTLEMENT_PRIVATE_KEY || "0x023800b57a336bc748db9d25f3f3b98e283322cf0bb4650f15f7f39bf4a1a6b8";
  const serverWallet = new hre.ethers.Wallet(SETTLEMENT_PRIVATE_KEY);
  const AUTHORIZED_SERVER = serverWallet.address;
  const EMERGENCY_ADMIN = process.env.BLACKJACK_EMERGENCY_ADMIN || ownerWallet.address;

  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Authorized Server:", AUTHORIZED_SERVER);
  console.log("Emergency Admin:", EMERGENCY_ADMIN);

  // Connect contract to owner wallet
  const blackjackWithOwner = blackjack.connect(ownerWallet);

  // Set authorized server for settlements
  console.log("\nSetting authorized server...");
  const tx1 = await blackjackWithOwner.setAuthorizedServer(AUTHORIZED_SERVER);
  console.log("Transaction sent:", tx1.hash);
  const receipt1 = await tx1.wait();
  console.log("✅ Authorized server set:", receipt1.hash);
  console.log("   Block:", receipt1.blockNumber);

  // Set emergency admin (if different)
  const currentEmergencyAdmin = await blackjack.emergencyAdmin();
  if (currentEmergencyAdmin.toLowerCase() !== EMERGENCY_ADMIN.toLowerCase()) {
    console.log("\nSetting emergency admin...");
    const tx2 = await blackjackWithOwner.setEmergencyAdmin(EMERGENCY_ADMIN);
    console.log("Transaction sent:", tx2.hash);
    const receipt2 = await tx2.wait();
    console.log("✅ Emergency admin set:", receipt2.hash);
    console.log("   Block:", receipt2.blockNumber);
  } else {
    console.log("\nEmergency admin already set correctly");
  }

  // Verify configuration
  console.log("\nVerifying configuration...");
  const owner = await blackjack.owner();
  const server = await blackjack.authorizedServer();
  const admin = await blackjack.emergencyAdmin();

  console.log("Owner:", owner);
  console.log("Authorized Server:", server);
  console.log("Emergency Admin:", admin);

  if (server.toLowerCase() === AUTHORIZED_SERVER.toLowerCase()) {
    console.log("\n✅ Contract configuration complete!");
  } else {
    console.log("\n⚠️  Warning: Authorized server mismatch!");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
