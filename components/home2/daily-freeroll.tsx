'use client';

/**
 * DailyFreeroll — the homepage hero: "#PulseChain Poker FreeRoll".
 *
 * Port of the option-11 Chronograph hero (`section.fr`): the free-roll art set
 * in a slowly turning steel bezel, a large chrome "FreeRoll" (Liquid Chrome
 * touch), the six daily start times, a starts-in / prize pool / seats strip and
 * the steel "Play free" CTA with the rotating arrow. The whole card links to
 * the poker lobby (/poker).
 *
 * Six free games a day at 1am, 4am, 9am, 1pm, 5pm and 9pm Eastern. The next
 * game, its pool, seats and registration state come from the public lobby feed
 * (/api/poker/public-games, polled every 60s); the fixed schedule and the
 * 10,010 MORBIUS default pool are the fallback, so the hero never goes blank.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PublicGamesResponse, PublicTournament } from '@/app/api/poker/public-games/route';

const TZ = 'America/New_York';
/** ET start hours, in day order. */
export const FREEROLL_SLOTS = [1, 4, 9, 13, 17, 21];
const DEFAULT_POOL = 10010;
const REFRESH_MS = 60_000;

/** "21" -> "9pm", "13:30" -> "1:30pm", "0" -> "12am" — the viewer-facing time format. */
export function formatDailyGameTime(hour: number, minute = 0): string {
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute ? `${h12}:${String(minute).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

/** "#PulseChain Poker FreeRoll at 9pm EST" */
export const dailyGameName = (hour: number, minute = 0) => `#PulseChain Poker FreeRoll at ${formatDailyGameTime(hour, minute)} EST`;

const etParts = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(ms);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute') };
};

/** Next scheduled slot (UTC ms) strictly after `now`, from the fixed six-a-day ET schedule. */
function nextSlotMs(now: number): number {
  for (let day = 0; day < 3; day++) {
    for (const h of FREEROLL_SLOTS) {
      // Find the UTC instant whose ET wall clock is <date + day> h:00.
      const base = new Date(now + day * 86_400_000);
      const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
      const guess = Date.parse(`${ymd}T${String(h).padStart(2, '0')}:00:00Z`);
      const etHour = etParts(guess).h;
      const at = guess + (((h - etHour + 24 + 12) % 24) - 12) * 3_600_000;
      if (at > now) return at;
    }
  }
  return now + 86_400_000;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Live names from older rows may carry retired product names — never show those. */
const RETIRED_NAME = /beat the bots|morbius daily freeroll/i;

export function DailyFreeroll() {
  const [now, setNow] = useState<number | null>(null);
  const [feed, setFeed] = useState<PublicTournament[] | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch('/api/poker/public-games', { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<PublicGamesResponse>) : null))
        .then((j) => {
          if (!dead && j) setFeed(j.tournaments ?? []);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  const next = useMemo(() => {
    if (now == null) return null;
    const live = (feed ?? []).find(
      (t) => t.freeEntry && (Date.parse(t.startsAt) > now || (t.status === 'active' && t.lateRegEndsAt && Date.parse(t.lateRegEndsAt) > now)),
    );
    const at = live ? Date.parse(live.startsAt) : nextSlotMs(now);
    const { h, m } = etParts(at);
    const name = live?.name && !RETIRED_NAME.test(live.name) ? live.name : dailyGameName(h, m);
    return {
      at,
      hour: h,
      name,
      started: at <= now,
      regOpen: Boolean(live),
      seatsOpen: live?.seatsOpen ?? null,
      pool: live?.prizePool ? Number(live.prizePool) : DEFAULT_POOL,
    };
  }, [now, feed]);

  const pool = (next?.pool ?? DEFAULT_POOL).toLocaleString('en-US');
  const timesLabel = FREEROLL_SLOTS.map((h) => formatDailyGameTime(h)).join(', ');
  const fullName = next?.name ?? dailyGameName(21);

  return (
    <section className="fr" aria-label="#PulseChain Poker FreeRoll">
      <i className="fr-blob" aria-hidden="true" />
      <i className="fr-bezel" aria-hidden="true" />
      <img className="frart" src="/home2/freeroll-art.webp" alt="" width={432} height={328} draggable={false} />
      <i className="fr-glass" aria-hidden="true" />
      <i className="spark s1" aria-hidden="true" />
      <i className="spark s2" aria-hidden="true" />
      <i className="spark s3" aria-hidden="true" />

      <span className="kick">Calibre 01 · Free entry · Six a day · Winner takes all</span>
      <h1>
        <small>#PulseChain Poker</small>
        <span className="chrome-word">FreeRoll</span>
      </h1>

      <div className="slots" role="list" aria-label={`Free games daily at ${timesLabel} Eastern`}>
        {FREEROLL_SLOTS.map((h) => (
          <span key={h} role="listitem" className={next?.hour === h ? 'on' : undefined} aria-current={next?.hour === h ? 'true' : undefined}>
            {formatDailyGameTime(h)}
          </span>
        ))}
        <i>EST</i>
      </div>

      <p className="fr-next" suppressHydrationWarning>
        <span>{next?.started ? 'Running now' : 'Next game'}</span> {fullName}
      </p>

      <div className="meta">
        <div>
          <label>{next?.started ? 'Late reg' : 'Starts in'}</label>
          <b suppressHydrationWarning>{next && now != null ? (next.started ? 'Live' : clock(next.at - now)) : '--:--:--'}</b>
        </div>
        <div>
          <label>Prize pool</label>
          <b className="g">{pool}</b>
        </div>
        <div>
          <label>Seats</label>
          <b>{next?.seatsOpen != null ? `${next.seatsOpen} left` : next?.regOpen ? 'Open' : 'Free'}</b>
        </div>
      </div>

      <Link href="/poker" className="cta" aria-label={`Play free — ${fullName}, ${pool} MORBIUS prize pool`}>
        <span>Play free</span>
        <i>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </i>
      </Link>
    </section>
  );
}
