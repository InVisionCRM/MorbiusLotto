"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIncomingWebSocketMessage = parseIncomingWebSocketMessage;
exports.extractRequestIdFromRawMessage = extractRequestIdFromRawMessage;
function parseIncomingWebSocketMessage(data) {
    const parsed = JSON.parse(data.toString());
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
        throw new Error('Invalid message format');
    }
    return parsed;
}
function extractRequestIdFromRawMessage(data) {
    try {
        const parsed = JSON.parse(data.toString());
        return typeof parsed?.requestId === 'string' ? parsed.requestId : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=message-parser.js.map