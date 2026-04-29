export interface StreamVoiceToken {
    apiKey: string;
    token: string;
    userId: string;
    expiresAt: number;
}
export declare function getStreamVoiceApiKey(): string | null;
/**
 * Stream Video uses HS256 JWTs signed with the app's API secret. The `user_id`
 * claim must match the userId passed to `client.connectUser()`.
 * Reference: https://getstream.io/video/docs/api/#generating-tokens
 */
export declare function generateStreamVoiceToken(walletAddress: string): StreamVoiceToken | null;
//# sourceMappingURL=stream-voice.service.d.ts.map