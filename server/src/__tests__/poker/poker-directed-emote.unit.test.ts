import { WebSocketService } from '../../services/websocket.service';

/**
 * Unit test for handlePokerDirectedEmote (directed player→player emotes).
 * Builds a bare instance via Object.create so we exercise the real validation +
 * broadcast logic without booting the DB / WS server.
 */

type AnyFn = (...args: unknown[]) => unknown;

function makeService(seats: Array<{ playerAddress: string | null }>) {
  const svc = Object.create(WebSocketService.prototype) as Record<string, unknown> & {
    handlePokerDirectedEmote: (ws: unknown, message: unknown) => Promise<void>;
  };
  const sendError = jest.fn();
  const broadcastToRoom = jest.fn();
  svc.pokerGameService = { getTableState: jest.fn(async () => ({ seats })) as AnyFn };
  svc.sendError = sendError as AnyFn;
  svc.broadcastToRoom = broadcastToRoom as AnyFn;
  return { svc, sendError, broadcastToRoom };
}

const SEATS = [
  { playerAddress: '0xAAAA000000000000000000000000000000000001' }, // seat 0
  { playerAddress: '0xBBBB000000000000000000000000000000000002' }, // seat 1
  { playerAddress: null },                                          // seat 2 (empty)
];
const sender = { playerAddress: '0xAAAA000000000000000000000000000000000001' };
const msg = (payload: unknown) => ({ payload, requestId: 'r1' });

describe('handlePokerDirectedEmote', () => {
  it('broadcasts a valid directed emote with the derived fromSeatIndex', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handlePokerDirectedEmote(sender, msg({ tableId: 't1', toSeatIndex: 1, kind: 'haha' }));
    expect(sendError).not.toHaveBeenCalled();
    expect(broadcastToRoom).toHaveBeenCalledTimes(1);
    expect(broadcastToRoom).toHaveBeenCalledWith('poker:table:t1', {
      type: 'poker_directed_emote',
      payload: { tableId: 't1', fromSeatIndex: 0, toSeatIndex: 1, kind: 'haha' },
    });
  });

  it('normalizes kind casing', async () => {
    const { svc, broadcastToRoom } = makeService(SEATS);
    await svc.handlePokerDirectedEmote(sender, msg({ tableId: 't1', toSeatIndex: 1, kind: 'HAHA' }));
    expect(broadcastToRoom).toHaveBeenCalledWith('poker:table:t1', expect.objectContaining({
      payload: expect.objectContaining({ kind: 'haha' }),
    }));
  });

  it('rejects an invalid emote kind', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handlePokerDirectedEmote(sender, msg({ tableId: 't1', toSeatIndex: 1, kind: 'nope' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'Invalid emote', 'r1');
  });

  it('rejects when the sender is not seated', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    const stranger = { playerAddress: '0xCCCC000000000000000000000000000000000003' };
    await svc.handlePokerDirectedEmote(stranger, msg({ tableId: 't1', toSeatIndex: 1, kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(stranger, 'Not seated at this table', 'r1');
  });

  it('rejects targeting yourself', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handlePokerDirectedEmote(sender, msg({ tableId: 't1', toSeatIndex: 0, kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'Invalid target seat', 'r1');
  });

  it('rejects targeting an empty seat', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handlePokerDirectedEmote(sender, msg({ tableId: 't1', toSeatIndex: 2, kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'Invalid target seat', 'r1');
  });

  it('rejects an out-of-range target seat', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handlePokerDirectedEmote(sender, msg({ tableId: 't1', toSeatIndex: 9, kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'Invalid target seat', 'r1');
  });

  it('rejects a missing toSeatIndex', async () => {
    const { svc, sendError, broadcastToRoom } = makeService(SEATS);
    await svc.handlePokerDirectedEmote(sender, msg({ tableId: 't1', kind: 'haha' }));
    expect(broadcastToRoom).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(sender, 'toSeatIndex required', 'r1');
  });
});
