/**
 * Diagnose why withdraw() reverts on a legacy Blackjack contract.
 * Checks: paused(), emergencyPaused, player reserve, contract MORBIUS balance, daily limits.
 *
 * Usage (from contracts folder):
 *   PLAYER_ADDRESS=0xYourAddress npx hardhat run scripts/check-legacy-blackjack-withdraw.js --network pulsechain
 *
 * Env:
 *   CONTRACT_ADDRESS - legacy contract to check (default: BLACKJACK_LEGACY_ADDRESS_2)
 *   PLAYER_ADDRESS  - your wallet (optional; if set, shows your reserve and daily usage)
 *
 * Or pass contract explicitly:
 *   CONTRACT_ADDRESS=0x... PLAYER_ADDRESS=0x... npx hardhat run scripts/check-legacy-blackjack-withdraw.js --network pulsechain
 */

import hre from "hardhat";

const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"];

async function main() {
  const contractAddress =
    process.env.CONTRACT_ADDRESS ||
    process.env.BLACKJACK_LEGACY_ADDRESS_2 ||
    null;
  if (!contractAddress || !contractAddress.startsWith("0x")) {
    console.error(
      "Set CONTRACT_ADDRESS or BLACKJACK_LEGACY_ADDRESS_2 to the legacy Blackjack contract (e.g. legacy 2)."
    );
    process.exit(1);
  }

  const playerAddress = process.env.PLAYER_ADDRESS
    ? process.env.PLAYER_ADDRESS.trim().toLowerCase()
    : null;
  if (!playerAddress || !playerAddress.startsWith("0x")) {
    console.warn("Optional: set PLAYER_ADDRESS to see your reserve and daily withdrawal usage.");
  }

  const provider = hre.ethers.provider;
  const blackjack = await hre.ethers.getContractAt("BlackjackV2", contractAddress);

  const block = await provider.getBlock("latest");
  const now = block?.timestamp ?? Math.floor(Date.now() / 1000);
  const today = Math.floor(Number(now) / 86400);

  console.log("\n--- Legacy contract:", contractAddress, "---\n");

  const [paused, emergencyPaused, totalReserves, morbiusTokenAddr] = await Promise.all([
    blackjack.paused(),
    blackjack.emergencyPaused(),
    blackjack.totalReserves(),
    blackjack.MORBIUS_TOKEN(),
  ]);

  const morbius = new hre.ethers.Contract(morbiusTokenAddr, ERC20_ABI, provider);
  const contractBalance = await morbius.balanceOf(contractAddress);

  const minWithdrawal = await blackjack.MIN_WITHDRAWAL();
  const maxDaily = await blackjack.MAX_DAILY_WITHDRAWAL();

  console.log("Pause state:");
  console.log("  paused() (OpenZeppelin):", paused);
  console.log("  emergencyPaused:        ", emergencyPaused);
  if (paused) {
    console.log("  -> Withdraw will revert (Pausable: paused). Owner must call unpause().");
  }
  if (emergencyPaused) {
    console.log("  -> Withdraw will revert (Emergency pause active). EmergencyAdmin must call setEmergencyPause(false).");
  }
  console.log("");
  console.log("Contract balance:");
  console.log("  MORBIUS balance:", hre.ethers.formatEther(contractBalance));
  console.log("  totalReserves: ", hre.ethers.formatEther(totalReserves));
  console.log("  MIN_WITHDRAWAL:", hre.ethers.formatEther(minWithdrawal));
  console.log("  MAX_DAILY_WITHDRAWAL:", hre.ethers.formatEther(maxDaily));
  console.log("");

  let dailyTotal = 0n;
  try {
    dailyTotal = await blackjack.dailyWithdrawalTotals(today);
  } catch (_) {}
  console.log("Global daily withdrawal (day index " + today + "):", hre.ethers.formatEther(dailyTotal));
  console.log("  Limit: ", hre.ethers.formatEther(maxDaily * 10n), "(10x MAX_DAILY_WITHDRAWAL)");
  console.log("");

  if (playerAddress) {
    const reserve = await blackjack.playerReserves(playerAddress);
    let playerDaily = 0n;
    try {
      playerDaily = await blackjack.dailyWithdrawals(playerAddress, today);
    } catch (_) {}
    console.log("Player", playerAddress);
    console.log("  playerReserve:     ", hre.ethers.formatEther(reserve));
    console.log("  withdrawn today:   ", hre.ethers.formatEther(playerDaily));
    console.log("  Limit per user:    ", hre.ethers.formatEther(maxDaily));
    console.log("");
    if (reserve < minWithdrawal) {
      console.log("  -> Withdraw would revert: Insufficient reserve (or below MIN_WITHDRAWAL).");
    }
    if (contractBalance < reserve) {
      console.log("  -> Withdraw would revert: Insufficient contract balance (contract has less MORBIUS than your reserve).");
    }
  }

  console.log("\nPossible revert reasons for withdraw(amount):");
  console.log("  1. Pausable: paused           -> owner must call unpause()");
  console.log("  2. Emergency pause active     -> emergencyAdmin must call setEmergencyPause(false)");
  console.log("  3. Withdrawal too small       -> amount < 1 MORBIUS");
  console.log("  4. Insufficient reserve       -> amount > your playerReserve");
  console.log("  5. Daily withdrawal limit     -> you or global limit exceeded");
  console.log("  6. Insufficient contract balance -> contract MORBIUS balance < amount");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
