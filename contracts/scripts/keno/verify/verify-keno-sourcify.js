/**
 * Verify CryptoKeno via Sourcify only (skips PulseScan which hangs on viaIR contracts).
 *
 * Usage: cd contracts && npx hardhat run scripts/keno/verify/verify-keno-sourcify.js --network pulsechain
 */
const hre = require("hardhat");

const DEFAULT_ADDRESS = "0xC6E0F71199A7713f5618773627a8478D02444922";

async function main() {
  const address = process.env.KENO_ADDRESS || DEFAULT_ADDRESS;
  console.log("Verifying CryptoKeno at", address, "via Sourcify\n");

  const contractFQN = "contracts/CryptoKeno.sol:CryptoKeno";

  try {
    await hre.run("verify:sourcify", {
      address,
      contract: contractFQN,
    });
    console.log("\n✅ Verified on Sourcify:", address);
  } catch (err) {
    if (err.message?.includes("Already Verified") || err.message?.includes("already verified")) {
      console.log("\n✅ Contract is already verified on Sourcify.");
      return;
    }
    console.error("\nSourcify verification failed:", err.message);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
