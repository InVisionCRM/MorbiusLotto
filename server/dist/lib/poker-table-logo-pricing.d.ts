/**
 * Next cost (whole MORBIUS / poker chips) to change the table logo.
 * - No active sponsorship: flat 50.
 * - Active sponsorship: linear from 10,000 (full 10m remaining) down to 50 (at expiry).
 * Integer math; remaining time uses floor of ms in the ratio for stability.
 */
export declare function computeTableLogoChangePriceMorbiusChips(args: {
    sponsoredActive: boolean;
    /** Milliseconds until sponsorship ends; ignored if not sponsoredActive. */
    remainingMs: number;
}): bigint;
//# sourceMappingURL=poker-table-logo-pricing.d.ts.map