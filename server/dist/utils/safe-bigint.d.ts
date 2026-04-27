/**
 * Safely convert unknown values (e.g. from DB/JSON) to bigint.
 * Handles: bigint, number (including 1.11e+21), string (including "1.11e+21"), null, undefined;
 * and plain decimal strings from PostgreSQL NUMERIC.
 */
export declare function toBigIntSafe(value: unknown): bigint;
//# sourceMappingURL=safe-bigint.d.ts.map