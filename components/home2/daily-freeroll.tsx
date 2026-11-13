'use client';

/**
 * DailyFreeroll — "The Morbius Daily Freeroll" feature card, top of the homepage.
 *
 * Same art language as the game tiles (game-tile.tsx): the poker tile art, the
 * purple corner ribbon with the M mark, a painted-style 3D gold title and the
 * banner ribbon. Free entry at 1, 5 & 9 PM ET; the next game, its pool, seats and
 * registration state come from the public lobby feed (/api/poker/public-games),
 * with the fixed daily schedule as the fallback, so the card never goes blank.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PublicGamesResponse, PublicTournament } from '@/app/api/poker/public-games/route';

const TZ = 'America/New_York';
const SLOTS = [13, 17, 21]; // ET hours
const DEFAULT_POOL = 3500;
const REFRESH_MS = 60_000;

/** Next scheduled slot (UTC ms) strictly after `now`, from the fixed 1/5/9 PM ET schedule. */
function nextSlotMs(now: number): number {
  for (let day = 0; day < 3; day++) {
    for (const h of SLOTS) {
      // Find the UTC instant whose ET wall clock is <date + day> h:00.
      const base = new Date(now + day * 86_400_000);
      const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
      const guess = Date.parse(`${ymd}T${String(h).padStart(2, '0')}:00:00Z`);
      const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(guess));
      const at = guess + ((h - etHour + 24 + 12) % 24 - 12) * 3_600_000;
      if (at > now) return at;
    }
  }
  return now + 86_400_000;
}

const etTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const etHour = (ms: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(ms));

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Title layer pair: dark outline/extrusion under a gold gradient fill (matches the painted tile titles). */
function Gold({ text, className }: { text: string; className: string }) {
  return (
    <span className={`dfr-gold ${className}`}>
      <span className="s" aria-hidden="true">{text}</span>
      <span className="g">{text}</span>
    </span>
  );
}

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
        .then((j) => { if (!dead && j) setFeed(j.tournaments ?? []); })
        .catch(() => {});
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { dead = true; clearInterval(t); };
  }, []);

  const next = useMemo(() => {
    if (now == null) return null;
    const live = (feed ?? []).find((t) => t.freeEntry && (Date.parse(t.startsAt) > now || (t.status === 'active' && t.lateRegEndsAt && Date.parse(t.lateRegEndsAt) > now)));
    const at = live ? Date.parse(live.startsAt) : nextSlotMs(now);
    return {
      at,
      started: at <= now,
      regOpen: Boolean(live),
      seatsOpen: live?.seatsOpen ?? null,
      pool: live?.prizePool ? Number(live.prizePool) : DEFAULT_POOL,
    };
  }, [now, feed]);

  const pool = (next?.pool ?? DEFAULT_POOL).toLocaleString('en-US');
  const nextHour = next ? etHour(next.at) : null;

  return (
    <section className="zone dfr-zone" aria-label="The Morbius Daily Freeroll">
      <Link href="/poker" className="dfr" aria-label={`The Morbius Daily Freeroll — free poker tournament at 1, 5 and 9 PM ET, ${pool} prize pool. Play free.`}>
        <div className="dfr-art">
          <img src="/home2/freeroll-art.webp" alt="" width={432} height={328} draggable={false} />
        </div>
        <span className="dfr-badge">
          <img src="/home2/m-mark.png" alt="" />
          Free entry
        </span>

        <div className="dfr-copy">
          <div className="dfr-kick">Poker tournament · every day</div>
          <h3 className="dfr-title">
            <Gold className="l1" text="The Morbius" />
            <Gold className="l2" text="Daily Freeroll" />
          </h3>
          <div className="dfr-meta">
            <div className="dfr-times" aria-label="Daily at 1, 5 and 9 PM Eastern">
              {SLOTS.map((h) => (
                <span key={h} className={'dfr-time' + (nextHour === h ? ' on' : '')}>
                  {h - 12} PM
                </span>
              ))}
              <span className="dfr-tz">ET</span>
            </div>
            <div className="dfr-rib"><span><b>{pool}</b> prize pool</span></div>
          </div>
        </div>

        <div className="dfr-side">
          <div className="dfr-next">
            <div className="dfr-row">
              <span className={'dfr-state' + (next?.regOpen ? ' reg' : '')}>
                {next ? (next.started ? 'Late reg open' : next.regOpen ? 'Reg open' : 'Next freeroll') : 'Next freeroll'}
              </span>
              {next?.seatsOpen != null && <span className="dfr-seats">{next.seatsOpen} seat{next.seatsOpen === 1 ? '' : 's'} left</span>}
            </div>
            <div className="dfr-count">
              <span className="dfr-at">{next ? `${etTime(next.at)} ET` : '1:00 PM ET'}</span>
              <span className="dfr-clock" suppressHydrationWarning>
                {next && now != null ? (next.started ? 'Live now' : clock(next.at - now)) : '–:––:––'}
              </span>
            </div>
          </div>
          <span className="dfr-cta">
            Play free
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
      </Link>
    </section>
  );
}
