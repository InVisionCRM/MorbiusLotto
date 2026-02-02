"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicClient = getPublicClient;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
let publicClient = null;
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
//# sourceMappingURL=chain-client.js.map