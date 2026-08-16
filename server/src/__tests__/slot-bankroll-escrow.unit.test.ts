/**
 * SlotBankrollEscrow wiring — the server side of the slots-only bankroll vault.
 *
 * The Solidity itself is covered by contracts/test/SlotBankrollEscrow.test.js.
 * What is tested here is everything that could silently point real money at the
 * wrong place: which address we resolve, what we do before the contract exists,
 * that we decode the right event, and that the hand-rolled selector the browser
 * ships still matches the compiled ABI.
 */

import { encodeEventTopics, encodeFunctionData, getFunctionSelector } from 'viem';
import { slotBankrollEscrowAbi } from '../abi/slot-bankroll-escrow';

const ADDR = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const FUNDER = '0x3333333333333333333333333333333333333333';

/**
 * Run `fn` against the address helper with a specific env in place.
 *
 * The env has to stay applied for the DURATION of the call: the helper reads
 * process.env when invoked rather than caching at module load, which is what
 * lets an operator set the address without a redeploy.
 */
function withAddressEnv<T>(env: Record<string, string | undefined>, fn: (mod: any) => T): T {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  jest.resetModules();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return fn(require('../utils/slot-escrow-address'));
  } finally {
    process.env = prev;
  }
}

describe('slot escrow address resolution', () => {
  it('is null until the contract is deployed', () => {
    withAddressEnv(
      { SLOT_BANKROLL_ESCROW_ADDRESS: undefined, NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS: undefined },
      (m) => {
        expect(m.getSlotBankrollEscrowAddress()).toBeNull();
        expect(m.isSlotEscrowConfigured()).toBe(false);
      },
    );
  });

  it('never falls back to the tournament escrow address', () => {
    withAddressEnv(
      {
        SLOT_BANKROLL_ESCROW_ADDRESS: undefined,
        NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS: undefined,
        TOURNAMENT_PRIZE_ESCROW_ADDRESS: '0xa54da628c54d2c9885a537f18dc9c22856510edf',
      },
      // Pointing slot bankrolls at the tournament vault is the exact mistake this
      // whole change exists to undo — a fallback must never resurrect it.
      (m) => expect(m.getSlotBankrollEscrowAddress()).toBeNull(),
    );
  });

  it('reads and normalizes a configured address', () => {
    withAddressEnv({ SLOT_BANKROLL_ESCROW_ADDRESS: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01' }, (m) => {
      expect(m.getSlotBankrollEscrowAddress()).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
      expect(m.isSlotEscrowConfigured()).toBe(true);
    });
  });

  it('accepts the NEXT_PUBLIC_ variant as a fallback', () => {
    withAddressEnv(
      {
        SLOT_BANKROLL_ESCROW_ADDRESS: undefined,
        NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS: '0x00000000000000000000000000000000000000ab',
      },
      (m) => expect(m.getSlotBankrollEscrowAddress()).toBe('0x00000000000000000000000000000000000000ab'),
    );
  });

  it('rejects malformed addresses rather than passing them through', () => {
    for (const bad of ['0x123', 'not-an-address', '0xZZZZef0123456789abcdef0123456789abcdef01', '']) {
      withAddressEnv(
        { SLOT_BANKROLL_ESCROW_ADDRESS: bad, NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS: undefined },
        (m) => expect(m.getSlotBankrollEscrowAddress()).toBeNull(),
      );
    }
  });
});

describe('deposit verification while undeployed', () => {
  it('refuses to verify instead of throwing or crediting', async () => {
    const prev = { ...process.env };
    delete process.env.SLOT_BANKROLL_ESCROW_ADDRESS;
    delete process.env.NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { realSlotBankrollChain } = require('../lib/community-slot-bankroll');

    const out = await realSlotBankrollChain.verifyBankrollDeposit({
      machineId: '11111111-1111-1111-1111-111111111111',
      txHash: '0x' + 'ab'.repeat(32),
      contributor: FUNDER,
      tokenAddress: TOKEN,
    });

    process.env = prev;
    expect(out.ok).toBe(false);
    expect(out.amount).toBeUndefined();
    expect(String(out.error)).toMatch(/not deployed yet/i);
  });
});

describe('ABI surface', () => {
  it('exposes the funding event the verifier decodes', () => {
    const ev = slotBankrollEscrowAbi.find((x: any) => x.type === 'event' && x.name === 'BankrollFunded') as any;
    expect(ev).toBeTruthy();
    // The verifier matches on these names — a rename would silently stop crediting.
    expect(ev.inputs.map((i: any) => i.name)).toEqual(['machineId', 'token', 'amount', 'funder']);
    // machineId/token/funder indexed means we can filter logs by them on-chain.
    expect(ev.inputs.filter((i: any) => i.indexed).map((i: any) => i.name)).toEqual([
      'machineId',
      'token',
      'funder',
    ]);
  });

  it('produces decodable BankrollFunded topics', () => {
    const topics = encodeEventTopics({
      abi: slotBankrollEscrowAbi,
      eventName: 'BankrollFunded',
      args: { machineId: ('0x' + '11'.repeat(32)) as `0x${string}`, token: TOKEN, funder: FUNDER },
    });
    expect(topics).toHaveLength(4); // signature + three indexed
  });

  it('keeps the browser selector in sync with the compiled ABI', () => {
    // public/slots/cabinet-wallet.js hand-encodes calldata rather than shipping a
    // full ABI encoder. If the signature ever changes, that constant silently
    // starts calling the wrong function — so pin it here.
    const fromAbi = getFunctionSelector('fundBankroll(bytes32,address,uint256)');
    expect(fromAbi).toBe('0x50427000');

    // And confirm the argument ORDER the client assumes really is (id, token, amount).
    const encoded = encodeFunctionData({
      abi: slotBankrollEscrowAbi,
      functionName: 'fundBankroll',
      args: [('0x' + '11'.repeat(32)) as `0x${string}`, TOKEN as `0x${string}`, 1000n],
    });
    expect(encoded.slice(0, 10)).toBe('0x50427000');
    expect(encoded.slice(10, 74)).toBe('11'.repeat(32));           // machineId
    expect(encoded.slice(74, 138).endsWith(TOKEN.slice(2))).toBe(true); // token
  });

  it('has no owner-reachable path into pooled funds', () => {
    const fnNames = slotBankrollEscrowAbi
      .filter((x: any) => x.type === 'function')
      .map((x: any) => String(x.name));
    expect(fnNames).toContain('payout');
    expect(fnNames.some((n) => /emergency|drain|rescue|withdrawAll/i.test(n))).toBe(false);
  });
});

describe('payout helper', () => {
  it('reports the missing deployment rather than attempting a send', async () => {
    const prev = { ...process.env };
    delete process.env.SLOT_BANKROLL_ESCROW_ADDRESS;
    delete process.env.NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendSlotBankrollPayout } = require('../utils/slot-escrow-payout');

    const out = await sendSlotBankrollPayout('11111111-1111-1111-1111-111111111111', ADDR, 5n);
    process.env = prev;

    expect(out.success).toBe(false);
    expect(out.txHash).toBeUndefined();
    expect(String(out.error)).toMatch(/SLOT_BANKROLL_ESCROW_ADDRESS/);
  });

  it('treats a zero payout as a no-op success', async () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendSlotBankrollPayout } = require('../utils/slot-escrow-payout');
    await expect(sendSlotBankrollPayout('x', ADDR, 0n)).resolves.toEqual({ success: true });
  });
});
