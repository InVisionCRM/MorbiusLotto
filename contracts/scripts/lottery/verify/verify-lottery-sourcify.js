/**
 * Verify both lottery contracts via Sourcify only (skips PulseScan which hangs on viaIR contracts).
 *
 * Usage: cd contracts && npx hardhat run scripts/lottery/verify/verify-lottery-sourcify.js --network pulsechain
 */
const hre = require("hardhat");

const INSTANT_ADDRESS = "0x884843787be5c0387F38722d9e4F2ab1E93c25D8";
const MEGA_ADDRESS = "0xD66b4489fbfF99A8d62f969203899840F2ec69c5";

async function verifyOnSourcify(address, contractFQN, label) {
  console.log(`\nVerifying ${label} at ${address} via Sourcify...`);
  try {
    await hre.run("verify:sourcify", {
      address,
      contract: contractFQN,
    });
    console.log(`✅ ${label} verified on Sourcify: ${address}`);
  } catch (err) {
    if (err.message?.includes("Already Verified") || err.message?.includes("already verified")) {
      console.log(`✅ ${label} is already verified on Sourcify.`);
      return;
    }
    console.error(`❌ ${label} Sourcify verification failed:`, err.message);
    throw err;
  }
}

async function main() {
  // 1) InstantLottery6of55
  await verifyOnSourcify(
    process.env.INSTANT_LOTTERY_INSTANT_ADDRESS || INSTANT_ADDRESS,
    "contracts/InstantLottery6of55.sol:InstantLottery6of55",
    "InstantLottery6of55"
  );

  // 2) MegaMorbiusLottery
  await verifyOnSourcify(
    process.env.MEGA_LOTTERY_INSTANT_ADDRESS || MEGA_ADDRESS,
    "contracts/SuperStakeLottery6of55V2.sol:MegaMorbiusLottery",
    "MegaMorbiusLottery"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
