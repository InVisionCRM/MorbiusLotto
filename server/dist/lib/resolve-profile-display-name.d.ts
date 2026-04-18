import type { DatabaseService } from '../services/database.service';
/** Match websocket profile rules: letters, numbers, spaces, hyphens, underscores. */
export declare function sanitizeDisplayNameCandidate(raw: string): string;
/**
 * When the client sends a short/empty display name (e.g. avatar-only save from the builder),
 * keep the existing stored name if it is valid; otherwise assign a short guest-style default.
 */
export declare function resolveDisplayNameForProfileUpsert(db: DatabaseService, walletAddress: string, rawIncoming: string | undefined | null): Promise<string>;
//# sourceMappingURL=resolve-profile-display-name.d.ts.map