/**
 * Check MorbiusHolderDistributor on-chain state.
 * Run: npx hardhat run scripts/check-distributor-state.js --network pulsechain
 * Optional: CHECK_ADDRESS=0x... to check earned() for an address
 */
import hre from "hardhat";

const MORBIUS_TOKEN = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
const DISTRIBUTOR = process.env.DISTRIBUTOR_ADDRESS || "0x011eE5F4658c5183FB9f8cd72e264ca5DBd404ab";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const DISTRIBUTOR_ABI = [
  "function lastBalance() view returns (uint256)",
  "function rewardPerTokenStored() view returns (uint256)",
  "function getCirculating() view returns (uint256)",
  "function earned(address) view returns (uint256)",
  "function userRewardPerTokenPaid(address) view returns (uint256)",
];

async function main() {
  const morbius = new hre.ethers.Contract(MORBIUS_TOKEN, ERC20_ABI, hre.ethers.provider);
  const distributor = new hre.ethers.Contract(DISTRIBUTOR, DISTRIBUTOR_ABI, hre.ethers.provider);

  const contractBalance = await morbius.balanceOf(DISTRIBUTOR);
  const lastBalance = await distributor.lastBalance();
  const rewardPerTokenStored = await distributor.rewardPerTokenStored();
  const circulating = await distributor.getCirculating();

  console.log("\nDistributor:", DISTRIBUTOR);
  console.log("MORBIUS balance:", hre.ethers.formatEther(contractBalance));
  console.log("lastBalance:", hre.ethers.formatEther(lastBalance));
  console.log("rewardPerTokenStored:", rewardPerTokenStored.toString());
  console.log("getCirculating():", hre.ethers.formatEther(circulating));
  console.log("Pool in sync?", lastBalance === contractBalance);

  const userAddr = process.env.CHECK_ADDRESS;
  if (userAddr) {
    const userBal = await morbius.balanceOf(userAddr);
    const earned = await distributor.earned(userAddr);
    console.log("\nUser", userAddr, "| MORBIUS balance:", hre.ethers.formatEther(userBal), "| earned:", hre.ethers.formatEther(earned));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
