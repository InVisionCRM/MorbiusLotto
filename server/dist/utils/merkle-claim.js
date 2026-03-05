"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMerkleKeeperConfigured = isMerkleKeeperConfigured;
exports.getMerkleKeeperAddress = getMerkleKeeperAddress;
exports.getContractMorbiusBalance = getContractMorbiusBalance;
exports.checkHasClaimed = checkHasClaimed;
exports.ensureMorbiusAllowance = ensureMorbiusAllowance;
exports.depositMorbiusRewards = depositMorbiusRewards;
exports.setEpochRootOnChain = setEpochRootOnChain;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const merkle_claim_morbius_1 = require("../abi/merkle-claim-morbius");
const erc20_1 = require("../abi/erc20");
const logger_1 = require("./logger");
const chain_client_1 = require("./chain-client");
// Must match lib/contracts.ts MERKLE_CLAIM_MORBIUS_ADDRESS; override via server .env
const MERKLE_CLAIM_ADDRESS = (process.env.MERKLE_CLAIM_MORBIUS_ADDRESS || '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2');
const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
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
/** Returns true if a keeper private key is configured. */
function isMerkleKeeperConfigured() {
    return Boolean(KEEPER_KEY);
}
/** Returns the keeper wallet address, or null if not configured. */
function getMerkleKeeperAddress() {
    if (!KEEPER_KEY)
        return null;
    try {
        const account = (0, accounts_1.privateKeyToAccount)(KEEPER_KEY);
        return account.address;
    }
    catch {
        return null;
    }
}
/**
 * Read the MORBIUS token balance held by the MerkleClaim contract on-chain.
 */
async function getContractMorbiusBalance() {
    const publicClient = (0, chain_client_1.getPublicClient)();
    const balance = (await publicClient.readContract({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: erc20_1.erc20Abi,
        functionName: 'balanceOf',
        args: [MERKLE_CLAIM_ADDRESS],
    }));
    return balance;
}
/**
 * Check on-chain whether a wallet has claimed for a given epoch.
 */
async function checkHasClaimed(epochNumber, walletAddress) {
    const publicClient = (0, chain_client_1.getPublicClient)();
    const result = (await publicClient.readContract({
        address: MERKLE_CLAIM_ADDRESS,
        abi: merkle_claim_morbius_1.merkleClaimMorbiusAbi,
        functionName: 'hasClaimed',
        args: [BigInt(epochNumber), walletAddress],
    }));
    return result;
}
/**
 * Ensure the keeper wallet has approved the MerkleClaim contract to spend MORBIUS.
 * Does a max approval if current allowance is below the required amount.
 */
async function ensureMorbiusAllowance(requiredAmount) {
    const maxRetries = 2;
    try {
        const client = getWalletClient();
        const publicClient = (0, chain_client_1.getPublicClient)();
        const account = client.account;
        const currentAllowance = (await publicClient.readContract({
            address: MORBIUS_TOKEN_ADDRESS,
            abi: erc20_1.erc20Abi,
            functionName: 'allowance',
            args: [account.address, MERKLE_CLAIM_ADDRESS],
        }));
        if (currentAllowance >= requiredAmount) {
            logger_1.logger.info('[MerkleClaim] Allowance sufficient', {
                current: currentAllowance.toString(),
                required: requiredAmount.toString(),
            });
            return { success: true };
        }
        logger_1.logger.info('[MerkleClaim] Approving MORBIUS for MerkleClaim contract (max uint256)');
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const hash = await client.writeContract({
                    account,
                    chain: chains_1.pulsechain,
                    address: MORBIUS_TOKEN_ADDRESS,
                    abi: erc20_1.erc20Abi,
                    functionName: 'approve',
                    args: [MERKLE_CLAIM_ADDRESS, MAX_UINT256],
                });
                logger_1.logger.info('[MerkleClaim] Approve tx sent', { txHash: hash });
                await publicClient.waitForTransactionReceipt({ hash });
                return { success: true, txHash: hash };
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logger_1.logger.error('[MerkleClaim] Approve failed', { attempt, error: msg });
                if (attempt === maxRetries)
                    return { success: false, error: msg };
            }
        }
        return { success: false, error: 'Max retries exceeded' };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
    }
}
/**
 * Deposit MORBIUS rewards into the MerkleClaim contract.
 */
async function depositMorbiusRewards(amount) {
    if (amount === 0n) {
        logger_1.logger.info('[MerkleClaim] Skipping deposit — amount is zero (all rolled up)');
        return { success: true };
    }
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const client = getWalletClient();
            const publicClient = (0, chain_client_1.getPublicClient)();
            const hash = await client.writeContract({
                account: client.account,
                chain: chains_1.pulsechain,
                address: MERKLE_CLAIM_ADDRESS,
                abi: merkle_claim_morbius_1.merkleClaimMorbiusAbi,
                functionName: 'depositRewards',
                args: [amount],
            });
            logger_1.logger.info('[MerkleClaim] depositRewards tx sent', {
                amount: amount.toString(),
                txHash: hash,
            });
            await publicClient.waitForTransactionReceipt({ hash });
            return { success: true, txHash: hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error('[MerkleClaim] depositRewards failed', { attempt, error: msg });
            if (attempt === maxRetries)
                return { success: false, error: msg };
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
/**
 * Set the Merkle root for an epoch on-chain.
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
                address: MERKLE_CLAIM_ADDRESS,
                abi: merkle_claim_morbius_1.merkleClaimMorbiusAbi,
                functionName: 'setEpochRoot',
                args: [BigInt(epochNumber), merkleRoot, totalAmount],
            });
            logger_1.logger.info('[MerkleClaim] setEpochRoot tx sent', {
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
            logger_1.logger.error('[MerkleClaim] setEpochRoot failed', { attempt, error: msg });
            if (attempt === maxRetries)
                return { success: false, error: msg };
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}
//# sourceMappingURL=merkle-claim.js.map