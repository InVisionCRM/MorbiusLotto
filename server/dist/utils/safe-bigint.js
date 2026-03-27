"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBigIntSafe = toBigIntSafe;
/**
 * Convert a numeric value to an integer string without scientific notation.
 * BigInt("1.11e+21") throws; we need "1110000000000000000000".
 */
function toIntegerString(value) {
    if (!Number.isFinite(value))
        return '0';
    const rounded = Math.round(value);
    const s = rounded.toString();
    if (!s.includes('e') && !s.includes('E'))
        return s;
    return rounded.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 });
}
/**
 * Safely convert unknown values (e.g. from DB/JSON) to bigint.
 * Handles: bigint, number (including 1.11e+21), string (including "1.11e+21"), null, undefined.
 */
function toBigIntSafe(value) {
    if (typeof value === 'bigint')
        return value;
    if (value === null || value === undefined)
        return 0n;
    if (typeof value === 'number') {
        return BigInt(toIntegerString(value));
    }
    const s = String(value).trim() || '0';
    if (s.toLowerCase().includes('e')) {
        return BigInt(toIntegerString(Number(s)));
    }
    try {
        return BigInt(s);
    }
    catch {
        return 0n;
    }
}
//# sourceMappingURL=safe-bigint.js.map