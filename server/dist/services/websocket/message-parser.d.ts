export interface IncomingWebSocketMessage {
    type: string;
    payload: unknown;
    requestId?: string;
}
export declare function parseIncomingWebSocketMessage(data: Buffer): IncomingWebSocketMessage;
export declare function extractRequestIdFromRawMessage(data: Buffer): string | undefined;
//# sourceMappingURL=message-parser.d.ts.map