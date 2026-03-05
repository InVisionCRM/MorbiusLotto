/**
 * Set the operator on an existing InstantLottery6of55 (for provably-fair server play).
 * Only the contract owner can call setOperator.
 *
 * Usage:
 *   cd contracts && npx hardhat run scripts/lottery/set-operator-instant-lottery.js --network pulsechain
 *
 * Env:
 *   INSTANT_LOTTERY_INSTANT_ADDRESS  - contract address (default from lib/contracts.ts current)
 *   LOTTERY_OPERATOR_ADDRESS - operator wallet (e.g. server LOTTERY_OPERATOR_PRIVATE_KEY address)
 */
const hre = require("hardhat");

const DEFAULT_CONTRACT = "0x884843787be5c0387F38722d9e4F2ab1E93c25D8";

async function main() {
  const contractAddress = (process.env.INSTANT_LOTTERY_INSTANT_ADDRESS || DEFAULT_CONTRACT).trim();
  const operatorAddress = (process.env.LOTTERY_OPERATOR_ADDRESS || "").trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    throw new Error("Set INSTANT_LOTTERY_INSTANT_ADDRESS to a valid 0x+40 hex address");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(operatorAddress)) {
    throw new Error("Set LOTTERY_OPERATOR_ADDRESS to the operator wallet (0x + 40 hex)");
  }

  console.log("InstantLottery6of55 at:", contractAddress);
  console.log("Setting operator to:", operatorAddress);

  const lottery = await hre.ethers.getContractAt("InstantLottery6of55", contractAddress);
  const current = await lottery.operator();
  if (current.toLowerCase() === operatorAddress.toLowerCase()) {
    console.log("Operator already set to this address. No tx.");
    return;
  }

  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice ?? hre.ethers.parseUnits("1500000", "gwei")) * 13n / 10n;
  const tx = await lottery.setOperator(operatorAddress, { gasLimit: 100000, gasPrice });
  await tx.wait();
  console.log("Tx hash:", tx.hash);

  const after = await lottery.operator();
  if (after.toLowerCase() !== operatorAddress.toLowerCase()) {
    throw new Error("Operator mismatch after setOperator");
  }
  console.log("Operator set successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
