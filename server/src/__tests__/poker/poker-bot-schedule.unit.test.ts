import { parseScheduleTimes, upcomingSlots, zonedToUtc, pickBots, readBotScheduleConfig } from '../../services/poker-bot-schedule.service';

describe('poker bot schedule helpers', () => {
  it('parses default and custom times', () => {
    expect(parseScheduleTimes(undefined).map((t) => t.label)).toEqual(['13:00', '17:00', '21:00']);
    expect(parseScheduleTimes('9:30, 22:15,bad,25:00').map((t) => t.label)).toEqual(['09:30', '22:15']);
  });

  it('converts New York wall time to UTC across DST', () => {
    // Nov 11 2026 is EST (UTC-5)
    expect(zonedToUtc(2026, 11, 11, 21, 0, 'America/New_York').toISOString()).toBe('2026-11-12T02:00:00.000Z');
    // Jul 1 2026 is EDT (UTC-4)
    expect(zonedToUtc(2026, 7, 1, 13, 0, 'America/New_York').toISOString()).toBe('2026-07-01T17:00:00.000Z');
  });

  it('lists only slots inside the horizon, with stable keys', () => {
    const cfg = { times: parseScheduleTimes('13:00,17:00,21:00'), timeZone: 'America/New_York' };
    const now = Date.parse('2026-11-11T21:40:00Z'); // 4:40 PM EST
    const slots = upcomingSlots(now, cfg, 30 * 60_000);
    expect(slots.map((s) => s.slotKey)).toEqual(['2026-11-11 17:00 America/New_York']);
    expect(slots[0].at.toISOString()).toBe('2026-11-11T22:00:00.000Z');
    // 24h horizon from 4:40 PM → 5 PM, 9 PM today, 1 PM tomorrow
    expect(upcomingSlots(now, cfg, 24 * 3600_000).length).toBe(3);
  });

  it('picks distinct bots', () => {
    const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const p = pickBots(all, 7);
    expect(new Set(p).size).toBe(7);
    expect(pickBots(all, 3).length).toBe(3);
  });

  it('reads config defaults: 10 seats, 7 bots, 500 buy-in, disabled', () => {
    const keys = Object.keys(process.env).filter((k) => k.startsWith('POKER_BOT_SCHEDULE_'));
    const saved: Record<string, string | undefined> = {};
    for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
    try {
      const cfg = readBotScheduleConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.seats).toBe(10);
      expect(cfg.bots).toBe(7);
      expect(cfg.buyIn).toBe(500n);
      expect(cfg.timeZone).toBe('America/New_York');
    } finally {
      for (const k of keys) process.env[k] = saved[k];
    }
  });
});

describe('early registration lead', () => {
  const cfg = { times: parseScheduleTimes('13:00,17:00,21:00'), timeZone: 'America/New_York' };
  it('allows up to 24h lead and a 900-min lead opens the whole day plus next 1 PM the night before', () => {
    const prev = process.env.POKER_BOT_SCHEDULE_LEAD_MINUTES;
    process.env.POKER_BOT_SCHEDULE_LEAD_MINUTES = '900';
    expect(readBotScheduleConfig().leadMinutes).toBe(900);
    process.env.POKER_BOT_SCHEDULE_LEAD_MINUTES = '5000';
    expect(readBotScheduleConfig().leadMinutes).toBe(1440);
    if (prev === undefined) delete process.env.POKER_BOT_SCHEDULE_LEAD_MINUTES;
    else process.env.POKER_BOT_SCHEDULE_LEAD_MINUTES = prev;
    // 11:50 ET on 2026-11-12: 1, 5 and 9 PM today are all inside a 900-min window.
    const now = zonedToUtc(2026, 11, 12, 11, 50, 'America/New_York').getTime();
    expect(upcomingSlots(now, cfg, 900 * 60_000).map((s) => s.slotKey.split(' ')[1])).toEqual(['13:00', '17:00', '21:00']);
    // 22:05 ET: tomorrow's 1 PM opens (14h55m ahead).
    const night = zonedToUtc(2026, 11, 12, 22, 5, 'America/New_York').getTime();
    expect(upcomingSlots(night, cfg, 900 * 60_000).map((s) => s.slotKey)).toEqual(['2026-11-13 13:00 America/New_York']);
  });
});
