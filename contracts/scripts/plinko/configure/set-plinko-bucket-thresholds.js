import hre from "hardhat";

/**
 * Set bucket probability thresholds on the Plinko contract.
 *
 * Usage:
 *   npx hardhat run scripts/set-plinko-bucket-thresholds.js --network pulsechain
 *
 * Environment variables:
 *   PLINKO_ADDRESS  — deployed Plinko contract address
 *
 * The thresholds below correspond to a 20-row equivalent Gaussian distribution
 * (sigma ≈ 1.789 vs the original 16-row sigma = 2.0). This makes edge buckets
 * ~2x rarer while keeping the same 17 bucket layout.
 *
 * To revert to original 16-row distribution, use:
 *   [1, 17, 137, 697, 2517, 6885, 14893, 26333, 39203, 50643, 58651, 63019, 64839, 65399, 65519, 65535, 65536]
 */

// 17-row equivalent thresholds (sigma ≈ 2.062, wider than 18-row)
const THRESHOLDS_17_ROW = [
  7, 47, 231, 901, 2832, 7231, 15153, 26428, 39108, 50383, 58305, 62704, 64635, 65305, 65489, 65529, 65536
];

async function main() {
  const CONTRACT_ADDRESS = process.env.PLINKO_ADDRESS || "0xfE8D58174d26cc2C60103120cBceB8F75DfdcDaC";

  const [owner] = await hre.ethers.getSigners();
  console.log("Caller (owner):", owner.address);
  console.log("Contract:", CONTRACT_ADDRESS);

  const artifact = await hre.artifacts.readArtifact("Plinko");
  const plinko = new hre.ethers.Contract(CONTRACT_ADDRESS, artifact.abi, owner);

  // Read current thresholds
  console.log("\nCurrent thresholds:");
  const current = await plinko.getBucketThresholds();
  let prev = 0n;
  for (let i = 0; i < 17; i++) {
    const val = BigInt(current[i]);
    const weight = val - prev;
    const pct = (Number(weight) / 65536 * 100).toFixed(4);
    console.log(`  Bucket ${i.toString().padStart(2)}: cumul=${val.toString().padStart(6)}  weight=${weight.toString().padStart(6)}  prob=${pct}%`);
    prev = val;
  }

  // Set new thresholds
  console.log("\nNew thresholds (17-row equivalent):");
  prev = 0;
  for (let i = 0; i < 17; i++) {
    const weight = THRESHOLDS_17_ROW[i] - prev;
    const pct = (weight / 65536 * 100).toFixed(4);
    console.log(`  Bucket ${i.toString().padStart(2)}: cumul=${THRESHOLDS_17_ROW[i].toString().padStart(6)}  weight=${weight.toString().padStart(6)}  prob=${pct}%`);
    prev = THRESHOLDS_17_ROW[i];
  }

  console.log("\nSending setBucketThresholds transaction...");
  const tx = await plinko.setBucketThresholds(THRESHOLDS_17_ROW, { gasLimit: 500000 });
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("✅ setBucketThresholds confirmed!");

  // Verify
  console.log("\nVerification — reading back thresholds:");
  const updated = await plinko.getBucketThresholds();
  for (let i = 0; i < 17; i++) {
    const expected = THRESHOLDS_17_ROW[i];
    const actual = Number(updated[i]);
    const match = expected === actual ? "✅" : "❌ MISMATCH";
    console.log(`  Bucket ${i.toString().padStart(2)}: ${actual} ${match}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
