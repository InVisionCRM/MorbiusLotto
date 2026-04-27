import { toBigIntSafe } from '../../utils/safe-bigint';

describe('toBigIntSafe', () => {
  it('parses PostgreSQL NUMERIC-style strings with trailing zeros after the decimal', () => {
    expect(toBigIntSafe('4750.0000000000')).toBe(4750n);
    expect(toBigIntSafe('0.0000000000')).toBe(0n);
  });

  it('preserves existing integer string and scientific-notation behavior', () => {
    expect(toBigIntSafe('100')).toBe(100n);
    expect(toBigIntSafe('1.11e+3')).toBe(1110n);
  });
});
