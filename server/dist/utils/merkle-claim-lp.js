"use strict";
/**
 * merkle-claim-lp.ts
 *
 * On-chain utilities for the MerkleClaimLP contract.
 * Unlike MerkleClaimMorbius, MerkleClaimLP is funded by direct MORBIUS transfers —
 * no approval or depositRewards call required.
 *
 * Also contains helpers for reading LP pair reserves (to calculate MORBIUS-equivalent
 * per LP token) and fetching LP token holders from the PulseChain API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMerkleKeeperConfigured = isMerkleKeeperConfigured;
exports.getContractMorbiusBalance = getContractMorbiusBalance;
exports.checkHasClaimed = checkHasClaimed;
exports.setEpochRootOnChain = setEpochRootOnChain;
exports.getPairReserveInfo = getPairReserveInfo;
exports.calcMorbiusEquivalent = calcMorbiusEquivalent;
exports.fetchLPHolders = fetchLPHolders;
exports.getLatestBlock = getLatestBlock;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const merkle_claim_lp_1 = require("../abi/merkle-claim-lp");
const chain_client_1 = require("./chain-client");
const logger_1 = require("./logger");
// Must match lib/contracts.ts MERKLE_CLAIM_LP_ADDRESS; override via server .env
const MERKLE_CLAIM_LP_ADDRESS = (process.env.MERKLE_CLAIM_LP_ADDRESS || process.env.NEXT_PUBLIC_MERKLE_CLAIM_LP_ADDRESS || '0x64Dd1c933027d757212E43725c99bD4402211A1A');
const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const KEEPER_KEY = (process.env.MERKLE_KEEPER_PRIVATE_KEY || process.env.SETTLEMENT_PRIVATE_KEY);
let walletClient = null;
function getWalletClient() {
    if (!KEEPER_KEY) {
        throw new Error('MERKLE_KEEPER_PRIVATE_KEY or SETTLEMENT_PRIVATE_KEY not set');
    }
    if (!walletClient) {
        const account = (0, accounts_1.privateKeyToAccount)(KEEPER_KEY);
        walletClient = (0, viem_1.createWalletClient)({
            account,
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
    }
    return walletClient;
}
function isMerkleKeeperConfigured() {
    return Boolean(KEEPER_KEY);
}
/**
 * Read the MORBIUS balance held by the MerkleClaimLP contract.
 */
async function getContractMorbiusBalance() {
    const publicClient = (0, chain_client_1.getPublicClient)();
    const balance = await publicClient.readContract({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: (0, viem_1.parseAbi)(['function balanceOf(address) view returns (uint256)']),
        functionName: 'balanceOf',
        args: [MERKLE_CLAIM_LP_ADDRESS],
    });
    return balance;
}
/**
 * Check on-chain whether a wallet has claimed for a given LP epoch.
 */
async function checkHasClaimed(epochNumber, walletAddress) {
    const publicClient = (0, chain_client_1.getPublicClient)();
    const result = await publicClient.readContract({
        address: MERKLE_CLAIM_LP_ADDRESS,
        abi: merkle_claim_lp_1.merkleClaimLpAbi,
        functionName: 'hasClaimed',
        args: [BigInt(epochNumber), walletAddress],
    });
    return result;
}
/**
 * Publish the Merkle root for an epoch on-chain.
 * Tokens must already be in the contract (sent directly via MORBIUS transfer).
 */
async function setEpochRootOnChain(epochNumber, merkleRoot, totalAmount) {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const publicClient = (0, chain_client_1.getPublicClient)();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: MERKLE_CLAIM_LP_ADDRESS,
                abi: merkle_claim_lp_1.merkleClaimLpAbi,
                functionName: 'setEpochRoot',
                args: [BigInt(epochNumber), merkleRoot, totalAmount],
            });
            logger_1.logger.info('[MerkleClaimLP] setEpochRoot tx sent', {
                epochNumber,
                merkleRoot,
                totalAmount: totalAmount.toString(),
                txHash: hash,
            });
            await publicClient.waitForTransactionReceipt({ hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('[MerkleClaimLP] setEpochRoot failed', { attempt, error: msg });
            if (attempt === maxRetries)
                return { success: false, error: msg };
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
// ─────────────────────────────────────────────────────────────────────────────
// LP pair reserve helpers
// ─────────────────────────────────────────────────────────────────────────────
const PAIR_ABI = (0, viem_1.parseAbi)([
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() view returns (uint256)',
]);
/**
 * Read a UniswapV2-style pair's reserves and determine the MORBIUS-per-LP-token ratio.
 * Returns hasLiquidity=false if the pair is empty or totalSupply is zero.
 */
async function getPairReserveInfo(pairAddress) {
    const publicClient = (0, chain_client_1.getPublicClient)();
    const [token0, reservesResult, totalSupply] = await Promise.all([
        publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'token0' }),
        publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'getReserves' }),
        publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'totalSupply' }),
    ]);
    const [reserve0, reserve1] = reservesResult;
    const totalLP = totalSupply;
    const isMorbiusToken0 = token0.toLowerCase() === MORBIUS_TOKEN_ADDRESS.toLowerCase();
    const morbiusReserve = isMorbiusToken0 ? reserve0 : reserve1;
    if (totalLP === 0n || morbiusReserve === 0n) {
        return { morbiusReserve: 0n, totalLPSupply: totalLP, morbiusPerLP: 0n, hasLiquidity: false };
    }
    const SCALE = 10n ** 18n;
    const morbiusPerLP = (morbiusReserve * SCALE) / totalLP;
    return { morbiusReserve, totalLPSupply: totalLP, morbiusPerLP, hasLiquidity: true };
}
/**
 * Given a holder's LP balance and pair reserve info, calculate the MORBIUS-equivalent.
 */
function calcMorbiusEquivalent(lpBalance, reserveInfo) {
    if (!reserveInfo.hasLiquidity || reserveInfo.morbiusPerLP === 0n)
        return 0n;
    const SCALE = 10n ** 18n;
    return (lpBalance * reserveInfo.morbiusPerLP) / SCALE;
}
// ─────────────────────────────────────────────────────────────────────────────
// LP token holder fetch (PulseChain blockscout API)
// ─────────────────────────────────────────────────────────────────────────────
const PULSECHAIN_API = 'https://api.scan.pulsechain.com/api/v2';
const HOLDERS_PAGE_SIZE = 50;
/**
 * Fetch all holders of an LP token from the PulseChain blockscout API.
 * Returns raw LP balances — MORBIUS-equivalent must be calculated separately.
 */
async function fetchLPHolders(pairAddress) {
    const holders = [];
    let nextPage = `${PULSECHAIN_API}/tokens/${pairAddress}/holders?page_size=${HOLDERS_PAGE_SIZE}`;
    while (nextPage) {
        let resp;
        try {
            resp = await fetch(nextPage);
        }
        catch (err) {
            logger_1.logger.error('[MerkleClaimLP] PulseChain API fetch error', err);
            break;
        }
        if (!resp.ok) {
            logger_1.logger.error(`[MerkleClaimLP] PulseChain API ${resp.status} for ${nextPage}`);
            break;
        }
        const data = await resp.json();
        for (const item of data.items ?? []) {
            const addr = item.address?.hash?.toLowerCase();
            const balance = BigInt(item.value ?? '0');
            if (addr && balance > 0n) {
                holders.push({ address: addr, balance });
            }
        }
        if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
            const params = new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)]));
            nextPage = `${PULSECHAIN_API}/tokens/${pairAddress}/holders?page_size=${HOLDERS_PAGE_SIZE}&${params}`;
        }
        else {
            nextPage = null;
        }
        await new Promise((r) => setTimeout(r, 150));
    }
    return holders;
}
/**
 * Get the latest block number from PulseChain API.
 */
async function getLatestBlock() {
    try {
        const resp = await fetch(`${PULSECHAIN_API}/blocks?type=block&page_size=1`);
        if (resp.ok) {
            const data = await resp.json();
            return data.items?.[0]?.height ?? null;
        }
    }
    catch {
        // non-critical
    }
    return null;
}
//# sourceMappingURL=merkle-claim-lp.js.map