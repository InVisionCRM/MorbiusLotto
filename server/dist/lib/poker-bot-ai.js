"use strict";
/**
 * Shared simple poker bot policy (tight-aggressive preflop, semi-random postflop).
 * Used by the CLI `poker-bot.ts` WebSocket clients and by in-server tournament bot ticks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pokerAmountToBigInt = pokerAmountToBigInt;
exports.decidePokerBotAction = decidePokerBotAction;
/** Parse poker amounts that may be huge (tournament virtual chips in wei-scale) or scientific strings. */
function pokerAmountToBigInt(v) {
    if (v == null)
        return 0n;
    if (typeof v === 'bigint')
        return v;
    if (typeof v === 'number') {
        if (!Number.isFinite(v))
            return 0n;
        if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER)
            return BigInt(v);
    }
    let s = typeof v === 'number' ? String(v) : String(v).trim();
    if (!s)
        return 0n;
    const sci = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(s);
    if (sci) {
        const neg = sci[1] === '-';
        const intPart = sci[2];
        const frac = sci[3] ?? '';
        const exp = parseInt(sci[4], 10);
        let digits = intPart + frac;
        const adjust = exp - frac.length;
        if (adjust >= 0) {
            digits += '0'.repeat(adjust);
        }
        else {
            const keep = digits.length + adjust;
            if (keep <= 0)
                return 0n;
            digits = digits.slice(0, keep);
        }
        digits = digits.replace(/^0+/, '') || '0';
        return BigInt((neg ? '-' : '') + digits);
    }
    const dot = s.indexOf('.');
    if (dot >= 0)
        s = s.slice(0, dot);
    s = s.replace(/,/g, '').replace(/^([+-]?)\s*/, '$1').replace(/[^0-9+-]/g, '');
    if (!s || s === '-' || s === '+')
        return 0n;
    try {
        return BigInt(s);
    }
    catch {
        return 0n;
    }
}
function preflopStrength(cards) {
    if (!cards || cards.length < 2)
        return 0.3;
    const r1 = cards[0] % 13;
    const r2 = cards[1] % 13;
    const s1 = Math.floor(cards[0] / 13);
    const s2 = Math.floor(cards[1] / 13);
    const suited = s1 === s2;
    const hi = Math.max(r1, r2);
    const lo = Math.min(r1, r2);
    if (r1 === r2) {
        if (r1 === 0)
            return 0.95;
        if (r1 >= 10)
            return 0.88;
        if (r1 >= 7)
            return 0.72;
        return 0.55;
    }
    if (hi === 0 || lo === 0) {
        const kicker = hi === 0 ? lo : hi;
        if (kicker >= 10)
            return suited ? 0.82 : 0.75;
        if (kicker >= 7)
            return suited ? 0.62 : 0.55;
        return suited ? 0.45 : 0.35;
    }
    const gap = Math.abs(r1 - r2);
    let score = 0.25;
    if (hi >= 9 && lo >= 9)
        score += 0.35;
    else if (hi >= 9)
        score += 0.15;
    if (gap <= 1)
        score += 0.15;
    else if (gap <= 2)
        score += 0.08;
    if (suited)
        score += 0.1;
    return Math.min(score, 0.9);
}
/** Pot-odds style ratio in [0,1] without floating huge BigInts (caps denominator). */
function callPriceRatio(toCall, pot) {
    if (toCall <= 0n)
        return 0;
    const denom = pot + toCall;
    if (denom <= 0n)
        return 1;
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (toCall > max || denom > max) {
        if (toCall >= denom)
            return 1;
        return 0.25;
    }
    return Number(toCall) / Number(denom);
}
function decidePokerBotAction(state) {
    const toCall = pokerAmountToBigInt(state.toCall);
    const pot = pokerAmountToBigInt(state.pot);
    const minRaise = pokerAmountToBigInt(state.minRaise);
    const stack = pokerAmountToBigInt(state.myStack);
    const canCheck = toCall === 0n;
    const rand = Math.random();
    if (state.street === 'preflop') {
        const strength = preflopStrength(state.myHoleCards ?? []);
        if (strength >= 0.8) {
            const raiseAmt = minRaise > stack ? stack : minRaise;
            if (raiseAmt > 0n && raiseAmt > toCall) {
                return { action: toCall > 0n ? 'raise' : 'bet', amount: raiseAmt.toString() };
            }
            return canCheck ? { action: 'check' } : { action: 'call' };
        }
        if (strength >= 0.5) {
            if (canCheck)
                return { action: 'check' };
            if (toCall <= pot / 2n || toCall <= stack / 10n) {
                return { action: 'call' };
            }
            return rand < 0.4 ? { action: 'call' } : { action: 'fold' };
        }
        if (canCheck)
            return { action: 'check' };
        if (toCall <= minRaise && rand < 0.2)
            return { action: 'call' };
        return { action: 'fold' };
    }
    if (canCheck) {
        if (rand < 0.3 && stack > 0n && minRaise > 0n) {
            const betSize = pot / 2n;
            const betAmt = betSize < minRaise ? minRaise : betSize > stack ? stack : betSize;
            return { action: 'bet', amount: betAmt.toString() };
        }
        return { action: 'check' };
    }
    const potOdds = callPriceRatio(toCall, pot);
    if (potOdds < 0.2) {
        return { action: 'call' };
    }
    if (rand < 0.15 && stack > minRaise && minRaise > 0n) {
        const raiseAmt = minRaise > stack ? stack : minRaise;
        return { action: 'raise', amount: raiseAmt.toString() };
    }
    if (rand < 0.6) {
        return { action: 'call' };
    }
    return { action: 'fold' };
}
//# sourceMappingURL=poker-bot-ai.js.map