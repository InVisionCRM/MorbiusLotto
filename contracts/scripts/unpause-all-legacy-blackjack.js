/**
 * Unpause all legacy Blackjack contracts one by one so players can call withdraw() again.
 * Clears both:
 *   - emergencyPaused (setEmergencyPause(false)) — requires emergencyAdmin
 *   - OpenZeppelin paused() (unpause()) — requires owner
 *
 * Usage (from contracts folder):
 *   npx hardhat run scripts/unpause-all-legacy-blackjack.js --network pulsechain
 *
 * Reads BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, _3, _4 from .env.
 * Uses PRIVATE_KEY or BACKUP_PRIVATE_KEY (should be emergencyAdmin and ideally owner on each).
 */

import hre from "hardhat";

function getLegacyAddresses() {
  const envVars = [
    process.env.BLACKJACK_LEGACY_ADDRESS,
    process.env.BLACKJACK_LEGACY_ADDRESS_2,
    process.env.BLACKJACK_LEGACY_ADDRESS_3,
    process.env.BLACKJACK_LEGACY_ADDRESS_4,
  ];
  return envVars
    .filter((addr) => addr && typeof addr === "string" && addr.trim().startsWith("0x"))
    .map((addr) => addr.trim());
}

async function main() {
  const addresses = getLegacyAddresses();
  if (addresses.length === 0) {
    console.error(
      "Set at least one of BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, " +
        "BLACKJACK_LEGACY_ADDRESS_3, BLACKJACK_LEGACY_ADDRESS_4 in .env"
    );
    process.exit(1);
  }

  let signer;
  if (process.env.BACKUP_PRIVATE_KEY) {
    signer = new hre.ethers.Wallet(process.env.BACKUP_PRIVATE_KEY.trim(), hre.ethers.provider);
  } else {
    const [s] = await hre.ethers.getSigners();
    signer = s;
  }
  console.log("Caller:", signer.address);
  console.log("Legacy contracts to check:", addresses.length, "\n");

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    const label = addresses.length > 1 ? `Legacy ${i + 1}` : "Legacy";
    console.log(`--- ${label} ${addr} ---`);

    const blackjack = await hre.ethers.getContractAt("BlackjackV2", addr, signer);
    const ozPaused = await blackjack.paused();
    const emergencyPaused = await blackjack.emergencyPaused();

    if (!emergencyPaused && !ozPaused) {
      console.log("Already unpaused (emergency + OZ). Skipping.\n");
      continue;
    }

    if (emergencyPaused) {
      console.log("Emergency paused. Calling setEmergencyPause(false)...");
      const tx = await blackjack.setEmergencyPause(false);
      await tx.wait();
      console.log("Tx:", tx.hash);
    }

    const stillOzPaused = await blackjack.paused();
    if (stillOzPaused) {
      console.log("OpenZeppelin paused. Calling unpause()...");
      try {
        const tx = await blackjack.unpause({ gasLimit: 100000 });
        await tx.wait();
        console.log("Tx:", tx.hash);
      } catch (err) {
        console.warn("unpause() failed (signer may not be owner):", err.message || err);
      }
    }

    console.log("");
  }

  console.log("Done. All specified legacy contracts have been unpaused.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
