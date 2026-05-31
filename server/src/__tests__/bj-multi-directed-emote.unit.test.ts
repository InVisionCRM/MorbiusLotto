import { WebSocketService } from '../services/websocket.service';

/**
 * Unit test for handleBJMultiDirectedEmote (blackjack-multi directed player→player emotes).
 * Players are keyed by wallet address. Builds a bare instance via Object.create so we exercise
 * the real validation + broadcast logic without booting the DB / WS server.
 */

type AnyFn = (...args: unknown[]) => unknown;

function makeService(seats: Array<{ playerAddress: string | null }>) {
  const svc = Object.create(WebSocketService.prototype) as Record<string, unknown> & {
    handleBJMultiDirectedEmote: (ws: unknown, message: unknown) => Promise<void>;
  };
  const sendError = jest.fn();
  const broadcastToRoom = jest.fn();
  svc.bjMultiService = { getTableState: jest.fn(async () => ({ seats })) as AnyFn };
  svc.sendError = sendError as AnyFn;
  svc.broadcastToRoom = broadcastToRoom as AnyFn;
  return { svc, sendError, broadcastToRoom };
}

const A = '0xAAAA000000000000000000000000000000000001';
const B = '0xBBBB000000000000000000000000000000000002';
const C = '0xCCCC000000000000000000000000000000000003';
const SEATS = [{ playerAddress: A }, { playerAddress: B }, { playerAddress: null }];
const sender = { playerAddress: A };
const msg = (payload: unknown) => ({ payload, requestId: 'r1' });

describe('handleBJMultiDirectedEmote', () => {
  it('broadcasts a valid directed emote to the blackjack table room', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handleBJMultiDirectedEmote(sender, msg({ tableId: 't1', toAddress: B, kind: 'haha' }));
    expect(sendError).not.toHaveBeenCalled();
    expect(broadcastToRoom).toHaveBeenCalledWith('blackjack:table:t1', {
      type: 'bj_multi_directed_emote',
      payload: { tableId: 't1', fromAddress: A, toAddress: B, kind: 'haha' },
    });
  });

  it('normalizes kind casing and matches target case-insensitively', async () => {
    const { svc, broadcastToRoom } = makeService(SEATS);
    await svc.handleBJMultiDirectedEmote(sender, msg({ tableId: 't1', toAddress: B.toUpperCase(), kind: 'HAHA' }));
    expect(broadcastToRoom).toHaveBeenCalledWith('blackjack:table:t1', expect.objectContaining({
      payload: expect.objectContaining({ kind: 'haha' }),
    }));
  });

  it('rejects an invalid emote kind', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handleBJMultiDirectedEmote(sender, msg({ tableId: 't1', toAddress: B, kind: 'nope' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'Invalid emote', 'r1');
  });

  it('rejects when the sender is not seated', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handleBJMultiDirectedEmote({ playerAddress: C }, msg({ tableId: 't1', toAddress: B, kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith({ playerAddress: C }, 'Not seated at this table', 'r1');
  });

  it('rejects when the target is not seated', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handleBJMultiDirectedEmote(sender, msg({ tableId: 't1', toAddress: C, kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'Target not seated', 'r1');
  });

  it('rejects targeting yourself', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handleBJMultiDirectedEmote(sender, msg({ tableId: 't1', toAddress: A, kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'Invalid target', 'r1');
  });
});
