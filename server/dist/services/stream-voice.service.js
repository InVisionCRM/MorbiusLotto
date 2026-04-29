"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStreamVoiceApiKey = getStreamVoiceApiKey;
exports.generateStreamVoiceToken = generateStreamVoiceToken;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../utils/logger");
const TOKEN_TTL_SECONDS = 60 * 60; // 1h — refresh well before expiry on the client
function getStreamVoiceApiKey() {
    return process.env.STREAM_API_KEY || null;
}
function base64url(input) {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
/**
 * Stream Video uses HS256 JWTs signed with the app's API secret. The `user_id`
 * claim must match the userId passed to `client.connectUser()`.
 * Reference: https://getstream.io/video/docs/api/#generating-tokens
 */
function generateStreamVoiceToken(walletAddress) {
    const apiKey = getStreamVoiceApiKey();
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
        logger_1.logger.warn('Stream voice token requested but STREAM_API_KEY/SECRET not configured');
        return null;
    }
    const userId = walletAddress.toLowerCase();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + TOKEN_TTL_SECONDS;
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ user_id: userId, iat: now, exp }));
    const signingInput = `${header}.${payload}`;
    const signature = base64url(crypto_1.default.createHmac('sha256', apiSecret).update(signingInput).digest());
    return {
        apiKey,
        token: `${signingInput}.${signature}`,
        userId,
        expiresAt: exp * 1000,
    };
}
//# sourceMappingURL=stream-voice.service.js.map