/**
 * Approve the CryptoKeno contract to spend MORBIUS from the PLS treasury.
 * Required for playKenoWithPLS: contract pulls payouts from plsTreasury.
 *
 * Usage (from contracts folder):
 *   npx hardhat run scripts/keno/configure/approve-keno-treasury.js --network pulsechain
 *
 * Required in .env:
 *   TREASURY_PRIVATE_KEY — private key of the wallet set as plsTreasury on CryptoKeno
 * Optional: KENO_ADDRESS (default: new contract 0x496fCE9733E2102102f448c533b84C7A88856e8a)
 */

import hre from "hardhat";

const MORBIUS_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const KENO_ADDRESS =
  process.env.KENO_ADDRESS ||
  process.env.NEXT_PUBLIC_KENO_ADDRESS ||
  "0x496fCE9733E2102102f448c533b84C7A88856e8a";
const MORBIUS_ADDRESS = process.env.KENO_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

async function main() {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    throw new Error(
      "TREASURY_PRIVATE_KEY not set in .env (must be the plsTreasury wallet for CryptoKeno)"
    );
  }

  const treasury = new hre.ethers.Wallet(treasuryKey.trim(), hre.ethers.provider);
  const morbius = new hre.ethers.Contract(MORBIUS_ADDRESS, MORBIUS_ABI, treasury);

  console.log("Treasury (plsTreasury):", treasury.address);
  console.log("CryptoKeno:           ", KENO_ADDRESS);
  const balance = await morbius.balanceOf(treasury.address);
  console.log("Treasury MORBIUS:     ", hre.ethers.formatEther(balance));
  const current = await morbius.allowance(treasury.address, KENO_ADDRESS);
  console.log("Current allowance:   ", hre.ethers.formatEther(current));

  if (current === hre.ethers.MaxUint256) {
    console.log("Already max approval. No tx needed.");
    return;
  }

  console.log("Sending approve(KENO_ADDRESS, MaxUint256)...");
  const tx = await morbius.approve(KENO_ADDRESS, hre.ethers.MaxUint256);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Done. PLS Keno plays can now pull MORBIUS from treasury.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
