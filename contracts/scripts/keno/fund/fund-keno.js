/**
 * Fund CryptoKeno contract with MORBIUS.
 * Usage: cd contracts && npx hardhat run scripts/keno/fund/fund-keno.js --network pulsechain
 * Optional: --amount=50000 or FUNDING_AMOUNT=50000 (default 50000)
 * Set KENO_ADDRESS in .env or use default from lib/contracts.ts.
 */
const hre = require("hardhat");

async function main() {
  console.log("Funding CryptoKeno contract with MORBIUS…");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const args = process.argv.slice(2);
  const amountArg = args.find((a) => a.startsWith("--amount="));
  const amountEnv = process.env.FUNDING_AMOUNT;

  const KENO_ADDRESS =
    process.env.KENO_ADDRESS ||
    process.env.NEXT_PUBLIC_KENO_ADDRESS ||
    "0x496fCE9733E2102102f448c533b84C7A88856e8a";
  const MORBIUS_TOKEN = process.env.KENO_TOKEN_ADDRESS || "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

  const FUNDING_AMOUNT =
    amountArg
      ? hre.ethers.parseEther(amountArg.split("=")[1])
      : amountEnv
        ? hre.ethers.parseEther(String(amountEnv))
        : hre.ethers.parseEther("50000");

  console.log("\nConfig:");
  console.log("KENO_ADDRESS:", KENO_ADDRESS);
  console.log("FUNDING_AMOUNT:", hre.ethers.formatEther(FUNDING_AMOUNT), "MORBIUS");

  const MORBIUS = await hre.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    MORBIUS_TOKEN
  );

  const balance = await MORBIUS.balanceOf(deployer.address);
  if (balance < FUNDING_AMOUNT) {
    console.error("Insufficient MORBIUS. Have:", hre.ethers.formatEther(balance));
    process.exit(1);
  }

  const feeData = await hre.ethers.provider.getFeeData();
  const gasOverrides = {
    maxFeePerGas: (feeData.gasPrice ?? 0n) * 2n,
    maxPriorityFeePerGas: hre.ethers.parseUnits("500000", "gwei"),
  };

  console.log("\nApproving…");
  await (await MORBIUS.approve(KENO_ADDRESS, FUNDING_AMOUNT, gasOverrides)).wait();
  const allowance = await MORBIUS.allowance(deployer.address, KENO_ADDRESS);
  const balanceAfter = await MORBIUS.balanceOf(deployer.address);
  console.log("Allowance:", hre.ethers.formatEther(allowance), "MORBIUS");
  console.log("Deployer balance:", hre.ethers.formatEther(balanceAfter), "MORBIUS");
  if (allowance < FUNDING_AMOUNT) {
    console.error("Allowance too low after approve. Need:", hre.ethers.formatEther(FUNDING_AMOUNT));
    process.exit(1);
  }
  if (balanceAfter < FUNDING_AMOUNT) {
    console.error("Insufficient balance after approve. Have:", hre.ethers.formatEther(balanceAfter));
    process.exit(1);
  }

  console.log("Calling fundContract…");
  const CryptoKeno = await hre.ethers.getContractAt("CryptoKeno", KENO_ADDRESS);

  try {
    const tx = await CryptoKeno.fundContract(FUNDING_AMOUNT, gasOverrides);
    await tx.wait();
    const reserve = await CryptoKeno.contractReserve();
    console.log("✅ Funded. Contract reserve:", hre.ethers.formatEther(reserve), "MORBIUS");
    console.log("Tx hash:", tx.hash);
  } catch (err) {
    const msg = err.reason ?? err.shortMessage ?? err.message;
    let reason = msg;
    if (err.data) {
      try {
        const iface = CryptoKeno.interface;
        const decoded = iface.parseError(err.data);
        if (decoded) reason = `Contract error: ${decoded.name}(${decoded.args.join(", ")})`;
      } catch (_) {
        if (err.data && err.data.length > 10) reason = `${msg} (revert data: ${err.data.slice(0, 66)}…)`;
      }
    }
    console.error("fundContract reverted:", reason);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
