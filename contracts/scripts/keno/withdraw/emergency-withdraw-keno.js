/**
 * Emergency pause and withdraw MORBIUS from CryptoKeno contract reserve.
 *
 * Requirements:
 * - Signer must be the contract owner.
 * - amount must be <= contractReserve (contract enforces this).
 *
 * Usage (from contracts folder; .env must have PRIVATE_KEY = owner key):
 *   npx hardhat run scripts/keno/withdraw/emergency-withdraw-keno.js --network pulsechain
 *
 * Withdraw from previous/legacy Keno contract:
 *   KENO_ADDRESS=0xC6E0F71199A7713f5618773627a8478D02444922 npx hardhat run scripts/keno/withdraw/emergency-withdraw-keno.js --network pulsechain
 *
 * Env:
 *   PRIVATE_KEY           — Owner key (required).
 *   KENO_ADDRESS          — CryptoKeno contract (default: 0x734A1460b4131F8cFE4950894Be89d1a852c957A)
 *   KENO_EMERGENCY_AMOUNT — Amount in MORBIUS (e.g. 1000). Omit or set to "all" to withdraw full reserve.
 *   KENO_TOKEN_ADDRESS    — MORBIUS token address if contract.token() reverts (default: 0xB7d4...)
 *   DRY_RUN=1             — Only show amount and recipient, do not send tx.
 */

import hre from "hardhat";

const DEFAULT_KENO_ADDRESS = "0x734A1460b4131F8cFE4950894Be89d1a852c957A";
const PREVIOUS_KENO_ADDRESS = "0xC6E0F71199A7713f5618773627a8478D02444922";
const DEFAULT_MORBIUS = "0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
];

// Minimal ABI for contracts where full artifact doesn't match deployed (e.g. older build).
const KENO_MINIMAL_ABI = [
  "function owner() view returns (address)",
  "function contractReserve() view returns (uint256)",
  "function paused() view returns (bool)",
  "function pause()",
  "function emergencyWithdraw(uint256 amount)",
];

async function main() {
  const kenoAddress = process.env.KENO_ADDRESS || DEFAULT_KENO_ADDRESS;

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("Set PRIVATE_KEY in .env to the owner key.");
    process.exit(1);
  }

  const signer = new hre.ethers.Wallet(privateKey.trim(), hre.ethers.provider);
  console.log("Signer (must be owner):", signer.address);
  console.log("Contract:", kenoAddress);

  const keno = new hre.ethers.Contract(kenoAddress, KENO_MINIMAL_ABI, signer);
  const owner = await keno.owner();
  if (signer.address.toLowerCase() !== owner.toLowerCase()) {
    console.error("Signer is not the owner of this contract. Aborting.");
    process.exit(1);
  }
  console.log("Recipient (owner):      ", owner);

  const tokenAddress =
    process.env.KENO_TOKEN_ADDRESS ||
    DEFAULT_MORBIUS;
  const token = new hre.ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const contractBalance = await token.balanceOf(kenoAddress);
  const symbol = await token.symbol().catch(() => "TOKEN");
  console.log("Contract token balance: ", hre.ethers.formatEther(contractBalance), symbol);

  let amount;
  const amountRaw = process.env.KENO_EMERGENCY_AMOUNT?.trim();
  if (!amountRaw || amountRaw.toLowerCase() === "all") {
    const reserve = await keno.contractReserve().catch(() => 0n);
    if (reserve === 0n) {
      console.error("Contract reserve is 0. Set KENO_EMERGENCY_AMOUNT to a number (e.g. 1000) or ensure contract has reserve.");
      process.exit(1);
    }
    amount = reserve;
    console.log("Withdraw amount (full reserve):", hre.ethers.formatEther(amount), symbol);
  } else {
    amount = hre.ethers.parseEther(amountRaw);
    console.log("Withdraw amount:        ", amountRaw, symbol);
  }

  if (process.env.DRY_RUN === "1") {
    console.log("\nDRY_RUN=1: not sending transactions. Remove DRY_RUN to execute.");
    return;
  }

  try {
    const isPaused = await keno.paused();
    if (!isPaused) {
      console.log("\nPausing contract...");
      const txPause = await keno.pause();
      await txPause.wait();
      console.log("  Tx:", txPause.hash);
    } else {
      console.log("\nContract already paused.");
    }
  } catch (e) {
    console.log("\nPause skipped (paused() or pause() not available on this contract).");
  }

  console.log("\nCalling emergencyWithdraw(", amount.toString(), ")...");
  const tx = await keno.emergencyWithdraw(amount);
  await tx.wait();
  console.log("  Tx:", tx.hash);
  console.log("\nDone. Withdrawn", hre.ethers.formatEther(amount), symbol, "to owner:", owner);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
