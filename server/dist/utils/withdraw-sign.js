"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOT_WITHDRAW_QUEUE_INTERVAL_MS_DEFAULT = exports.PENDING_DEPOSIT_CONFIRM_WORKER_INTERVAL_MS = exports.HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS = exports.HOT_WITHDRAW_CONFIRMATION_TIMEOUT_MS = exports.MIN_WITHDRAWAL_WEI = void 0;
exports.resolveDepositConfirmationsRequired = resolveDepositConfirmationsRequired;
exports.resolveHotWithdrawQueueIntervalMs = resolveHotWithdrawQueueIntervalMs;
exports.signWithdrawApproval = signWithdrawApproval;
const accounts_1 = require("viem/accounts");
const viem_1 = require("viem");
exports.MIN_WITHDRAWAL_WEI = BigInt('1000000000000000000'); // 1 MORBIUS
exports.HOT_WITHDRAW_CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;
exports.HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS = 30_000;
exports.PENDING_DEPOSIT_CONFIRM_WORKER_INTERVAL_MS = 10_000;
exports.HOT_WITHDRAW_QUEUE_INTERVAL_MS_DEFAULT = 3000;
// Must match contract: keccak256("WithdrawApproval(address player,uint256 amount,uint256 nonce,uint256 expiryTimestamp)")
const WITHDRAW_APPROVAL_TYPE_STRING = 'WithdrawApproval(address player,uint256 amount,uint256 nonce,uint256 expiryTimestamp)';
function resolveDepositConfirmationsRequired(rawValue) {
    const parsed = Number(rawValue ?? '');
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 3;
    return Math.floor(parsed);
}
function resolveHotWithdrawQueueIntervalMs(rawValue) {
    const parsed = Number(rawValue ?? '');
    if (!Number.isFinite(parsed) || parsed <= 0)
        return exports.HOT_WITHDRAW_QUEUE_INTERVAL_MS_DEFAULT;
    return Math.floor(parsed);
}
/**
 * Build EIP-712 digest exactly as BlackjackV2 contract does, then sign it.
 * When domainSeparatorHex is provided (read from contract), the signature is guaranteed
 * to verify on-chain. Use this when signTypedData produces a different encoding.
 */
async function signWithdrawApproval(player, amount, nonce, expiryTimestamp, contractAddress, chainId, privateKey, domainSeparatorHex) {
    const account = (0, accounts_1.privateKeyToAccount)(privateKey);
    const expiryBig = BigInt(expiryTimestamp);
    // Normalize player to lowercase 0x + 40 hex (contract uses msg.sender, same 20 bytes)
    const playerNorm = player.toLowerCase().startsWith('0x') ? player.toLowerCase() : `0x${player.toLowerCase()}`;
    let digest;
    if (domainSeparatorHex) {
        // Build digest exactly as contract: digest = keccak256("\x19\x01" || domainSeparator || structHash)
        // Ensure 32-byte domain separator (RPC may return shortened hex)
        const domainSep32 = (0, viem_1.padHex)(domainSeparatorHex, { size: 32, dir: 'left' });
        const typeHash = (0, viem_1.keccak256)((0, viem_1.stringToHex)(WITHDRAW_APPROVAL_TYPE_STRING));
        const encodedStruct = (0, viem_1.encodeAbiParameters)([
            { type: 'bytes32' },
            { type: 'address' },
            { type: 'uint256' },
            { type: 'uint256' },
            { type: 'uint256' },
        ], [typeHash, playerNorm, amount, nonce, expiryBig]);
        const structHash = (0, viem_1.keccak256)(encodedStruct);
        const prefix = '0x1901';
        digest = (0, viem_1.keccak256)((0, viem_1.concat)([prefix, domainSep32, structHash]));
    }
    else {
        // Fallback: use signTypedData (may differ from contract if viem encoding differs)
        const domain = {
            name: 'Blackjack',
            version: '1',
            chainId,
            verifyingContract: (contractAddress.slice(0, 2) + contractAddress.slice(2).toLowerCase()),
        };
        const types = {
            WithdrawApproval: [
                { name: 'player', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expiryTimestamp', type: 'uint256' },
            ],
        };
        const message = { player: playerNorm, amount, nonce, expiryTimestamp: expiryBig };
        digest = (await Promise.resolve().then(() => __importStar(require('viem')))).hashTypedData({
            domain,
            types,
            primaryType: 'WithdrawApproval',
            message,
        });
    }
    const signature = await (0, accounts_1.sign)({
        hash: digest,
        privateKey,
    });
    const r = signature.r;
    const s = signature.s;
    // ecrecover expects v = 27 or 28; some signers return recovery id 0/1
    let v = Number(signature.v);
    if (v < 27)
        v += 27;
    return {
        amount: amount.toString(),
        nonce: nonce.toString(),
        expiryTimestamp: String(expiryTimestamp),
        v,
        r,
        s,
    };
}
//# sourceMappingURL=withdraw-sign.js.map