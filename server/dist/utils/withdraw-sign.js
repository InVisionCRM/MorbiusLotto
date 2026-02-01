"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_WITHDRAWAL_WEI = void 0;
exports.signWithdrawApproval = signWithdrawApproval;
const accounts_1 = require("viem/accounts");
const DOMAIN_NAME = 'Blackjack';
const DOMAIN_VERSION = '1';
exports.MIN_WITHDRAWAL_WEI = BigInt('1000000000000000000'); // 1 MORBIUS
/**
 * Sign a withdrawal approval (EIP-712) for the Blackjack contract.
 * Returns amount, nonce, and signature components (v, r, s).
 */
async function signWithdrawApproval(player, amount, nonce, contractAddress, chainId, privateKey) {
    const account = (0, accounts_1.privateKeyToAccount)(privateKey);
    const domain = {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId,
        verifyingContract: contractAddress,
    };
    const types = {
        WithdrawApproval: [
            { name: 'player', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
        ],
    };
    const message = {
        player: player,
        amount,
        nonce,
    };
    const signature = await account.signTypedData({
        domain,
        types,
        primaryType: 'WithdrawApproval',
        message,
    });
    // Signature is 0x + r (32 bytes) + s (32 bytes) + v (1 byte) = 130 hex chars + 0x
    const r = `0x${signature.slice(2, 66)}`;
    const s = `0x${signature.slice(66, 130)}`;
    const v = parseInt(signature.slice(130, 132), 16);
    return {
        amount: amount.toString(),
        nonce: nonce.toString(),
        v,
        r,
        s,
    };
}
//# sourceMappingURL=withdraw-sign.js.map