"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEscrowSummary = getEscrowSummary;
exports.getAllTournamentIds = getAllTournamentIds;
exports.getPoolsByDepositor = getPoolsByDepositor;
exports.getActivePools = getActivePools;
exports.getPoolDetails = getPoolDetails;
exports.getTotalValueLocked = getTotalValueLocked;
const chain_client_1 = require("./chain-client");
const tournament_prize_escrow_v6_1 = require("../abi/tournament-prize-escrow-v6");
const tournament_id_bytes32_1 = require("./tournament-id-bytes32");
const tournament_escrow_address_1 = require("./tournament-escrow-address");
function escrowBytes32Address() {
    return (0, tournament_escrow_address_1.getTournamentPrizeEscrowAddress)();
}
/**
 * Stubbed: V6 removed `getAllTournamentIds`. Always returns []. Touch chain only via
 * `getPoolDetails(uuid)` until the DB-backed enumeration lands (see TODO at top of file).
 * Unused-import suppression — `getPublicClient` is still used by `getPoolDetails` below.
 */
async function readAllPools() {
    return [];
}
// Reference the client import so tsc's `noUnusedLocals` doesn't flip it red in future
// builds. `getPoolDetails` already consumes it; this is a no-op at runtime.
void chain_client_1.getPublicClient;
/** Aggregate over all pools in JS — replaces the contract's removed `getEscrowSummary`. */
async function getEscrowSummary() {
    try {
        const pools = await readAllPools();
        let active = 0;
        let cancelled = 0;
        let tvl = 0n;
        for (const p of pools) {
            if (p.token === '0x0000000000000000000000000000000000000000')
                continue;
            if (p.cancelled) {
                cancelled++;
            }
            else if (p.amountPaidOut < p.totalDeposited) {
                // V4 has no `active` flag; "active" = funded and not yet fully paid.
                active++;
                tvl += p.totalDeposited - p.amountPaidOut;
            }
        }
        return {
            totalTournaments: pools.length,
            activeTournaments: active,
            cancelledTournaments: cancelled,
            totalValueLocked: tvl,
        };
    }
    catch {
        return null;
    }
}
/** Returns bytes32 IDs as strings — the original UUIDs aren't recoverable from the hash. */
async function getAllTournamentIds() {
    try {
        const pools = await readAllPools();
        return pools.map((p) => p.id);
    }
    catch {
        return [];
    }
}
function poolToDetails(p, tournamentId) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const ageSeconds = p.depositedAt > 0n ? now - p.depositedAt : 0n;
    const ageDays = Number(ageSeconds) / 86400;
    return {
        tournamentId: tournamentId ?? p.id,
        token: p.token,
        depositor: p.depositor,
        totalDeposited: p.totalDeposited,
        amountPaidOut: p.amountPaidOut,
        remainingBalance: p.totalDeposited - p.amountPaidOut,
        depositedAt: p.depositedAt,
        cancelled: p.cancelled,
        ageDays: Math.round(ageDays * 100) / 100,
    };
}
/** Pools belonging to a given depositor — JS filter over `readAllPools`. */
async function getPoolsByDepositor(depositor) {
    try {
        const pools = await readAllPools();
        const lower = depositor.toLowerCase();
        return pools
            .filter((p) => p.depositor.toLowerCase() === lower)
            .map((p) => poolToDetails(p));
    }
    catch {
        return [];
    }
}
/** Pools that are funded, not cancelled, and have remaining balance. */
async function getActivePools() {
    try {
        const pools = await readAllPools();
        return pools
            .filter((p) => p.token !== '0x0000000000000000000000000000000000000000' &&
            !p.cancelled &&
            p.amountPaidOut < p.totalDeposited)
            .map((p) => ({ tournamentId: p.id, balance: p.totalDeposited - p.amountPaidOut }));
    }
    catch {
        return [];
    }
}
/**
 * Per-tournament details. Caller passes the off-chain UUID; we hash it server-side.
 * Returns the friendly UUID in the response so admin UIs don't have to track both.
 */
async function getPoolDetails(tournamentId) {
    try {
        const client = (0, chain_client_1.getPublicClient)();
        const idBytes32 = (0, tournament_id_bytes32_1.tournamentIdToBytes32)(tournamentId);
        const r = (await client.readContract({
            address: escrowBytes32Address(),
            abi: tournament_prize_escrow_v6_1.tournamentPrizeEscrowV6Abi,
            functionName: 'getPool',
            args: [idBytes32],
        }));
        const raw = {
            id: idBytes32,
            token: r[0],
            depositor: r[1],
            totalDeposited: r[2],
            amountPaidOut: r[3],
            depositedAt: r[4],
            cancelled: r[5],
        };
        return poolToDetails(raw, tournamentId);
    }
    catch {
        return null;
    }
}
/** TVL for a specific token across all funded, non-cancelled pools. */
async function getTotalValueLocked(token) {
    try {
        const pools = await readAllPools();
        const lower = token.toLowerCase();
        let total = 0n;
        for (const p of pools) {
            if (p.token.toLowerCase() !== lower)
                continue;
            if (p.cancelled)
                continue;
            if (p.amountPaidOut >= p.totalDeposited)
                continue;
            total += p.totalDeposited - p.amountPaidOut;
        }
        return total;
    }
    catch {
        return 0n;
    }
}
//# sourceMappingURL=escrow-oversight.js.map