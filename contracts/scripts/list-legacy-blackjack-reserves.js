/**
 * List all addresses that have a reserve balance in one or more Blackjack contracts.
 * Uses BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, and BLACKJACK_ADDRESS from .env
 * so you can see reserves across all Blackjack addresses.
 *
 * The contract does NOT have a function for owner to send reserves to players; each player must call
 * withdraw(amount) themselves (or use the in-app legacy withdraw flow).
 *
 * Usage (from contracts folder):
 *   npx hardhat run scripts/list-legacy-blackjack-reserves.js --network pulsechain
 *
 * Set in .env: BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, BLACKJACK_LEGACY_ADDRESS_3, BLACKJACK_ADDRESS (any subset).
 *
 * Optional: FROM_BLOCK=12345 to start scanning from a specific block (faster).
 * Optional: OUT_CSV=reserves.csv to write results to a file (includes contract_label column).
 */

import hre from "hardhat";

const DEPOSIT_TOPIC = hre.ethers.id("Deposit(address,uint256,uint256)");
const DEPOSIT_MORBIUS_TOPIC = hre.ethers.id("DepositMORBIUS(address,uint256)");

function getBlackjackContracts() {
  const entries = [
    [process.env.BLACKJACK_LEGACY_ADDRESS, "Legacy 1"],
    [process.env.BLACKJACK_LEGACY_ADDRESS_2, "Legacy 2"],
    [process.env.BLACKJACK_LEGACY_ADDRESS_3, "Legacy 3"],
    [process.env.BLACKJACK_ADDRESS, "Current"],
  ];
  return entries.filter(([addr]) => addr && typeof addr === "string" && addr.startsWith("0x"));
}

async function listReservesForContract(contractAddress, label, provider, fromBlock, outCsvRows) {
  const blackjack = await hre.ethers.getContractAt("Blackjack", contractAddress);

  const depositLogs = await provider.getLogs({
    address: contractAddress,
    fromBlock,
    toBlock: "latest",
    topics: [DEPOSIT_TOPIC],
  });
  const depositMorbiusLogs = await provider.getLogs({
    address: contractAddress,
    fromBlock,
    toBlock: "latest",
    topics: [DEPOSIT_MORBIUS_TOPIC],
  });

  const addresses = new Set();
  for (const log of depositLogs) {
    if (log.topics[1]) addresses.add("0x" + log.topics[1].slice(26).toLowerCase());
  }
  for (const log of depositMorbiusLogs) {
    if (log.topics[1]) addresses.add("0x" + log.topics[1].slice(26).toLowerCase());
  }

  const reserves = [];
  for (const addr of addresses) {
    const reserve = await blackjack.getPlayerReserve(addr);
    if (reserve > 0n) {
      reserves.push({ address: addr, reserve });
    }
  }
  reserves.sort((a, b) => (b.reserve > a.reserve ? 1 : -1));

  const total = reserves.reduce((s, r) => s + r.reserve, 0n);
  console.log("\n---", label, "|", contractAddress, "---");
  console.log("Unique depositors with non-zero reserve:", reserves.length);
  console.log("Total MORBIUS:", hre.ethers.formatEther(total));
  for (const r of reserves) {
    const human = hre.ethers.formatEther(r.reserve);
    console.log(" ", r.address, human, "MORBIUS");
    if (outCsvRows) outCsvRows.push([label, contractAddress, r.address, r.reserve.toString(), human]);
  }
  return { label, contractAddress, reserves, total };
}

async function main() {
  const contracts = getBlackjackContracts();
  if (contracts.length === 0) {
    console.error("Set at least one of BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, BLACKJACK_LEGACY_ADDRESS_3, BLACKJACK_ADDRESS in .env");
    process.exit(1);
  }

  const provider = hre.ethers.provider;
  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK, 10) : 0;
  const outCsv = process.env.OUT_CSV || null;
  const outCsvRows = outCsv ? [["contract_label", "contract_address", "player_address", "reserve_wei", "reserve_human"]] : null;

  console.log("Blackjack contracts:", contracts.map(([addr, label]) => `${label}=${addr}`).join(", "));
  console.log("From block:", fromBlock);

  const results = [];
  for (const [contractAddress, label] of contracts) {
    const r = await listReservesForContract(contractAddress, label, provider, fromBlock, outCsvRows);
    results.push(r);
  }

  if (outCsv && outCsvRows.length > 1) {
    const fs = await import("fs");
    const csv = outCsvRows.map((row) => row.join(",")).join("\n");
    fs.writeFileSync(outCsv, csv, "utf8");
    console.log("\nWrote", outCsv);
  }

  const withReserves = results.filter((r) => r.reserves.length > 0);
  if (withReserves.length > 0) {
    console.log("\n→ Tell players with legacy balance to use Blackjack → Reserve → withdraw from 'Previous contract'.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
