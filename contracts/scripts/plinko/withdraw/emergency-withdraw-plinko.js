/**
 * Emergency pause + withdraw all funds from legacy Plinko contracts.
 *
 * Usage:
 *   cd contracts && npx hardhat run scripts/emergency-withdraw-plinko.js --network pulsechain
 */
import hre from "hardhat";

const MORBIUS_TOKEN = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

const LEGACY_PLINKO_ADDRESSES = [
  "0x212cb1Ea69F59E1F48e9C344053696c4adEbb845",
  "0x328F7Afefb8F561B5A832954257c01B3723054Fb",
  "0x37B1db8F06870BFFeFed862C06535BEFc4383ff8",
  "0xa6585d334bb737d64eCE7abCA5acC087dd46E99e",
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Owner address:", deployer.address);

  for (const address of LEGACY_PLINKO_ADDRESSES) {
    console.log(`\n========================================`);
    console.log(`Processing Plinko: ${address}`);
    console.log(`========================================`);

    try {
      const Plinko = await hre.ethers.getContractAt("Plinko", address);

      const owner = await Plinko.owner();
      if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`SKIPPING — owner is ${owner}, not you.`);
        continue;
      }

      // Pause if not already paused
      const isPaused = await Plinko.paused();
      if (!isPaused) {
        console.log("Pausing...");
        const pauseTx = await Plinko.pause();
        await pauseTx.wait();
        console.log("Paused. Tx:", pauseTx.hash);
      } else {
        console.log("Already paused.");
      }

      // Use actual token balance (not contractReserve which may be inflated)
      const token = await hre.ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        MORBIUS_TOKEN
      );
      const actualBalance = await token.balanceOf(address);
      const reserve = await Plinko.getContractReserve();
      console.log("contractReserve:", hre.ethers.formatEther(reserve), "MORBIUS");
      console.log("Actual balance: ", hre.ethers.formatEther(actualBalance), "MORBIUS");

      if (actualBalance === 0n) {
        console.log("Nothing to withdraw.");
        continue;
      }

      // Withdraw the actual balance (reserve may exceed real balance)
      const withdrawAmount = actualBalance < reserve ? actualBalance : reserve;
      console.log("Emergency withdrawing", hre.ethers.formatEther(withdrawAmount), "MORBIUS...");
      const withdrawTx = await Plinko.emergencyWithdraw(withdrawAmount);
      const receipt = await withdrawTx.wait();
      console.log("Withdrawn! Tx:", withdrawTx.hash);
      console.log("Block:", receipt.blockNumber);
    } catch (err) {
      console.log("ERROR on", address, ":", err.message);
    }
  }

  console.log("\nDone. All legacy Plinko contracts processed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
