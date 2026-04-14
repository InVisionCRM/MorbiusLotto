/**
 * Fund Roulette contract with MORBIUS.
 * Usage: cd contracts && npx hardhat run scripts/roulette/fund/fund-roulette.js --network pulsechain
 * Optional: FUNDING_AMOUNT=100000 (default 100000 MORBIUS)
 */
const hre = require("hardhat");

async function main() {
  console.log("Funding Roulette contract with MORBIUS…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const ROULETTE_ADDRESS = process.env.ROULETTE_ADDRESS || "0x5e51EcFa38C4254dD100e565620Ac6E511723d27";
  const MORBIUS_TOKEN    = process.env.ROULETTE_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";
  const FUNDING_AMOUNT   = hre.ethers.parseEther(process.env.FUNDING_AMOUNT || "100000");

  console.log("\nConfig:");
  console.log("ROULETTE_ADDRESS:", ROULETTE_ADDRESS);
  console.log("FUNDING_AMOUNT  :", hre.ethers.formatEther(FUNDING_AMOUNT), "MORBIUS");

  const MORBIUS = await hre.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    MORBIUS_TOKEN
  );

  const balance = await MORBIUS.balanceOf(deployer.address);
  console.log("Deployer MORBIUS balance:", hre.ethers.formatEther(balance));
  if (balance < FUNDING_AMOUNT) {
    console.error("Insufficient MORBIUS. Have:", hre.ethers.formatEther(balance));
    process.exit(1);
  }

  const feeData = await hre.ethers.provider.getFeeData();
  const gasOverrides = {
    maxFeePerGas: ((feeData.gasPrice ?? 0n) * 12n) / 10n,
    maxPriorityFeePerGas: hre.ethers.parseUnits("100000", "gwei"),
  };

  console.log("\nApproving MORBIUS…");
  await (await MORBIUS.approve(ROULETTE_ADDRESS, FUNDING_AMOUNT, gasOverrides)).wait();
  console.log("Approved.");

  const Roulette = await hre.ethers.getContractAt(
    [{ name: "fund", type: "function", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
     { name: "contractReserve", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }],
    ROULETTE_ADDRESS
  );

  console.log("Funding contract…");
  await (await Roulette.fund(FUNDING_AMOUNT, gasOverrides)).wait();

  const reserve = await Roulette.contractReserve();
  console.log("\n✅ Funded. Contract reserve:", hre.ethers.formatEther(reserve), "MORBIUS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
