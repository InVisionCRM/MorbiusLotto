"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicClient = getPublicClient;
exports.createPulsechainWalletClient = createPulsechainWalletClient;
exports.readUsedWithdrawalNonce = readUsedWithdrawalNonce;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
let publicClient = null;
const USED_NONCES_ABI = [
    {
        inputs: [{ name: '', type: 'uint256' }],
        name: 'usedNonces',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
];
/**
 * Shared viem public client for PulseChain (used by chain-analytics and optionally websocket).
 */
function getPublicClient() {
    if (!publicClient) {
        publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
    }
    return publicClient;
}
/**
 * Shared helper for creating a PulseChain wallet client from a private key.
 * Returns null for missing/invalid key format.
 */
function createPulsechainWalletClient(privateKey) {
    if (!privateKey || !privateKey.startsWith('0x'))
        return null;
    const account = (0, accounts_1.privateKeyToAccount)(privateKey);
    return (0, viem_1.createWalletClient)({
        account,
        chain: chains_1.pulsechain,
        transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
}
/**
 * Shared helper for checking whether a withdrawal nonce has already been consumed on-chain.
 */
async function readUsedWithdrawalNonce(contractAddress, nonce, client = getPublicClient()) {
    return client.readContract({
        address: contractAddress,
        abi: USED_NONCES_ABI,
        functionName: 'usedNonces',
        args: [nonce],
    });
}
//# sourceMappingURL=chain-client.js.map