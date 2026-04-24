import { computeTableLogoChangePriceMorbiusChips } from '../../lib/poker-table-logo-pricing';
import { POKER_TABLE_LOGO_SPONSOR_WINDOW_MS } from '../../lib/poker-table-logo-constants';

describe('computeTableLogoChangePriceMorbiusChips', () => {
  it('charges 50 when no active sponsorship', () => {
    expect(computeTableLogoChangePriceMorbiusChips({ sponsoredActive: false, remainingMs: 0 })).toBe(50n);
    expect(computeTableLogoChangePriceMorbiusChips({ sponsoredActive: false, remainingMs: 999999 })).toBe(50n);
  });

  it('charges 10000 at full window remaining', () => {
    expect(
      computeTableLogoChangePriceMorbiusChips({
        sponsoredActive: true,
        remainingMs: POKER_TABLE_LOGO_SPONSOR_WINDOW_MS,
      }),
    ).toBe(10000n);
  });

  it('charges 50 at zero remaining', () => {
    expect(computeTableLogoChangePriceMorbiusChips({ sponsoredActive: true, remainingMs: 0 })).toBe(50n);
  });

  it('is linear at half window', () => {
    const half = POKER_TABLE_LOGO_SPONSOR_WINDOW_MS / 2;
    expect(computeTableLogoChangePriceMorbiusChips({ sponsoredActive: true, remainingMs: half })).toBe(5025n);
  });

  it('clamps remaining above window to max price', () => {
    expect(
      computeTableLogoChangePriceMorbiusChips({
        sponsoredActive: true,
        remainingMs: POKER_TABLE_LOGO_SPONSOR_WINDOW_MS + 60_000,
      }),
    ).toBe(10000n);
  });
});
