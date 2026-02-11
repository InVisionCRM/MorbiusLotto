/**
 * List all tournament prize pools (reserves) in the TournamentPrizeEscrow contract.
 * Discovers tournament IDs from PrizePoolDeposited events, then calls getPool for each.
 *
 * Usage (from contracts folder):
 *   npx hardhat run scripts/list-escrow-reserves.js --network pulsechain
 *
 * Set in .env: TOURNAMENT_PRIZE_ESCROW_ADDRESS (or NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS).
 *
 * Optional: OUT_CSV=escrow-reserves.csv to write results to a file.
 */

import hre from "hardhat";

const PRIZE_POOL_DEPOSITED_TOPIC = hre.ethers.id("PrizePoolDeposited(bytes32,address,uint256,address)");
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const escrowAddress =
    process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS ||
    process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS ||
    null;
  if (!escrowAddress || !escrowAddress.startsWith("0x")) {
    console.error("Set TOURNAMENT_PRIZE_ESCROW_ADDRESS (or NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS) in .env");
    process.exit(1);
  }

  const provider = hre.ethers.provider;
  const outCsv = process.env.OUT_CSV || null;

  const escrowAbi = [
    "function getPool(bytes32 tournamentId) view returns (address token, uint256 totalDeposited, uint256 amountPaidOut)",
  ];
  const escrow = await hre.ethers.getContractAt(escrowAbi, escrowAddress);

  console.log("Escrow contract:", escrowAddress);
  console.log("Fetching PrizePoolDeposited events...");

  const logs = await provider.getLogs({
    address: escrowAddress,
    fromBlock: 0,
    toBlock: "latest",
    topics: [PRIZE_POOL_DEPOSITED_TOPIC],
  });

  const tournamentIds = new Set();
  for (const log of logs) {
    if (log.topics[1]) tournamentIds.add(log.topics[1]);
  }
  console.log("Unique tournament pools:", tournamentIds.size);

  const rows = [["tournament_id_hex", "token_address", "token_symbol", "total_deposited", "amount_paid_out", "remaining", "decimals"]];
  const pools = [];

  for (const tournamentId of tournamentIds) {
    const [token, totalDeposited, amountPaidOut] = await escrow.getPool(tournamentId);
    if (token === hre.ethers.ZeroAddress || totalDeposited === 0n) continue;

    let symbol = token;
    let decimals = 18;
    try {
      const tokenContract = await hre.ethers.getContractAt(ERC20_ABI, token);
      symbol = await tokenContract.symbol();
      decimals = Number(await tokenContract.decimals());
    } catch (_) {
      // use address if symbol() fails
    }
    const remaining = totalDeposited - amountPaidOut;
    const fmt = (v) => hre.ethers.formatUnits(v, decimals);
    pools.push({
      tournamentId,
      token,
      symbol,
      totalDeposited,
      amountPaidOut,
      remaining,
      decimals,
    });
    console.log("\n---", tournamentId, "---");
    console.log("  Token:", token, "(" + symbol + ")");
    console.log("  Total deposited:", fmt(totalDeposited));
    console.log("  Paid out:", fmt(amountPaidOut));
    console.log("  Remaining:", fmt(remaining));
    rows.push([
      tournamentId,
      token,
      symbol,
      totalDeposited.toString(),
      amountPaidOut.toString(),
      remaining.toString(),
      String(decimals),
    ]);
  }

  if (pools.length === 0) {
    console.log("\nNo funded pools found.");
  } else {
    const totalRemaining = pools.reduce((s, p) => s + p.remaining, 0n);
    console.log("\n--- Summary ---");
    console.log("Pools with balance:", pools.length);
    console.log("(Total remaining is per-token; see above for per-pool remaining.)");
  }

  if (outCsv && rows.length > 1) {
    const fs = await import("fs");
    const quote = (v) => (String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = rows.map((row) => row.map(quote).join(",")).join("\n");
    fs.writeFileSync(outCsv, csv, "utf8");
    console.log("\nWrote", outCsv);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
