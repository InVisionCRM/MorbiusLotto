/**
 * Reclaim unclaimed (remaining) prize tokens for a tournament from the escrow to an address.
 * Callable by the escrow OWNER only. Use for one-off recovery (e.g. old pool before auto-reclaim existed).
 *
 * The escrow contract must be deployed with reclaimUnclaimed (TournamentPrizeEscrow with the reclaim functions).
 * If your current deployment was before that change, redeploy the escrow and point env to the new address;
 * funds already stuck in the old contract cannot be recovered.
 *
 * Usage (from contracts folder):
 *   TOURNAMENT_ID=<uuid> RECLAIM_TO=0xYourWallet npx hardhat run scripts/reclaim-escrow-remainder.js --network pulsechain
 *
 * Optional: TOURNAMENT_PRIZE_ESCROW_ADDRESS=0x... (default from .env)
 * Uses PRIVATE_KEY or BACKUP_PRIVATE_KEY as owner key.
 */

import hre from "hardhat";

async function main() {
  const tournamentId = process.env.TOURNAMENT_ID;
  const tournamentIdBytes32Env = process.env.TOURNAMENT_ID_BYTES32;
  const reclaimTo = process.env.RECLAIM_TO;
  const escrowAddress =
    process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS ||
    process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS;

  if (!reclaimTo || !reclaimTo.startsWith("0x")) {
    console.error("Set RECLAIM_TO (address).");
    process.exit(1);
  }
  const tournamentIdBytes32 = tournamentIdBytes32Env?.startsWith("0x")
    ? tournamentIdBytes32Env
    : tournamentId
      ? hre.ethers.keccak256(hre.ethers.toUtf8Bytes(tournamentId))
      : null;
  if (!tournamentIdBytes32) {
    console.error("Set TOURNAMENT_ID (UUID) or TOURNAMENT_ID_BYTES32 (0x... from list-escrow-reserves). Example:");
    console.error("  TOURNAMENT_ID=550e8400-e29b-41d4-a716-446655440000 RECLAIM_TO=0xYourWallet npx hardhat run scripts/reclaim-escrow-remainder.js --network pulsechain");
    process.exit(1);
  }
  if (!escrowAddress || !escrowAddress.startsWith("0x")) {
    console.error("Set TOURNAMENT_PRIZE_ESCROW_ADDRESS in .env");
    process.exit(1);
  }
  let signer;
  if (process.env.BACKUP_PRIVATE_KEY) {
    signer = new hre.ethers.Wallet(process.env.BACKUP_PRIVATE_KEY.trim(), hre.ethers.provider);
  } else {
    const [s] = await hre.ethers.getSigners();
    signer = s;
  }
  console.log("Escrow:", escrowAddress);
  console.log("Tournament ID (bytes32):", tournamentIdBytes32);
  console.log("Reclaim to:", reclaimTo);
  console.log("Signer (owner):", signer.address);

  const escrow = await hre.ethers.getContractAt(
    [
      "function getPool(bytes32) view returns (address token, uint256 totalDeposited, uint256 amountPaidOut)",
      "function reclaimUnclaimed(bytes32 tournamentId, address to)",
    ],
    escrowAddress,
    signer
  );
  const [token, totalDeposited, amountPaidOut] = await escrow.getPool(tournamentIdBytes32);
  const remaining = totalDeposited - amountPaidOut;
  if (token === hre.ethers.ZeroAddress || remaining === 0n) {
    console.error("No pool or no remainder for this tournament.");
    process.exit(1);
  }
  console.log("Remaining:", hre.ethers.formatEther(remaining), "(assuming 18 decimals)");
  const tx = await escrow.reclaimUnclaimed(tournamentIdBytes32, reclaimTo);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Done. Tokens sent to", reclaimTo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
