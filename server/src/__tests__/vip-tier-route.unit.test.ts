/**
 * Unit tests for GET /api/vip/tier/:address status codes.
 *
 * No DB required: registers the real VIP routes on a throwaway Express app
 * with a fake VipService and calls them over HTTP. A malformed address is the
 * caller's fault (400, service never called); a failure inside the lookup is
 * the server's (500), not a bad address.
 *
 * Run: cd server && npm test -- --selectProjects unit --testPathPattern vip-tier-route
 */

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { AuthService } from '../services/auth.service';
import type { VipPublicTier, VipService } from '../services/vip.service';
import { registerVipRoutes } from '../routes/vip.routes';

const ADDR = '0x00000000000000000000000000000000000000a1';
const TIER: VipPublicTier = {
  address: ADDR,
  tierLevel: 3,
  tierName: 'Gold',
  color: '#f5c542',
  rakebackBps: 1200,
  lifetimeWagerChips: '600000',
};

let server: Server;
let baseUrl: string;
let lookup: jest.Mock<Promise<VipPublicTier>, [string]>;

beforeAll(async () => {
  lookup = jest.fn<Promise<VipPublicTier>, [string]>();
  const app = express();
  registerVipRoutes({
    app,
    vipService: { getTierForAddress: lookup } as unknown as VipService,
    authService: {} as AuthService,
  });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => lookup.mockReset());

async function getTier(address: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/api/vip/tier/${encodeURIComponent(address)}`);
  return { status: res.status, body: await res.json() };
}

describe('GET /api/vip/tier/:address', () => {
  it('returns the tier for a valid address', async () => {
    lookup.mockResolvedValue(TIER);
    const { status, body } = await getTier(ADDR);
    expect(status).toBe(200);
    expect(body).toEqual(TIER);
    expect(lookup).toHaveBeenCalledWith(ADDR);
  });

  it('accepts a checksummed (mixed-case) address', async () => {
    lookup.mockResolvedValue(TIER);
    const mixed = '0x00000000000000000000000000000000000000A1';
    expect((await getTier(mixed)).status).toBe(200);
    expect(lookup).toHaveBeenCalledWith(mixed);
  });

  it('rejects a malformed address with 400 without calling the service', async () => {
    for (const bad of ['0x123', 'not-an-address', `${ADDR}00`, '0xzz000000000000000000000000000000000000a1']) {
      const { status, body } = await getTier(bad);
      expect(status).toBe(400);
      expect(body).toEqual({ error: 'Invalid address' });
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports a lookup failure as 500, not as a bad address', async () => {
    lookup.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const { status, body } = await getTier(ADDR);
    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
  });
});
