'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Parks a table-background <video> on the frame matching the viewer's clock.
 *
 * The whole clip is spread across one day of the viewer's LOCAL time: at
 * midnight it sits on the first frame, at noon it is halfway through, and it
 * arrives at the last frame just before midnight. The clips are compressed
 * day/night cycles, so this makes the table's lighting track the player's
 * actual time of day — two players in different timezones each see their own
 * evening.
 *
 * The clip is seeked, never played. A few seconds of footage stretched over
 * 86,400s needs a playback rate around 0.0001, which browsers clamp (and treat
 * 0 as invalid) — so we park the video on the right frame and nudge it forward
 * on a timer. The tick is deliberately coarse: at this ratio a frame lasts
 * minutes of wall clock, so polling faster would re-seek to the same frame.
 *
 * With `syncToClock` false, `position` (0-100) parks it at a fixed percentage
 * and no timer runs.
 *
 * Used by the solo felt (BlackjackTable) and the multiplayer table page —
 * changing the mapping here changes both, which is the point.
 */
export function useClockSyncedVideo(
  ref: RefObject<HTMLVideoElement | null>,
  opts: { enabled: boolean; src: string; syncToClock?: boolean; position?: number },
): void {
  const { enabled, src, syncToClock = true, position = 50 } = opts;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const seek = () => {
      const duration = el.duration;
      if (!Number.isFinite(duration) || duration <= 0) return; // metadata not in yet
      let fraction: number;
      if (syncToClock) {
        const now = new Date();
        const secondsIntoDay =
          now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
        fraction = secondsIntoDay / 86400;
      } else {
        fraction = Math.min(Math.max(position, 0), 100) / 100;
      }
      // Stay a hair inside the end: seeking exactly to duration can park some
      // browsers on a blank frame or fire `ended`.
      const target = Math.min(fraction * duration, Math.max(duration - 0.05, 0));
      if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
    };

    el.pause();
    if (el.readyState >= 1) seek();
    el.addEventListener('loadedmetadata', seek);

    const timer = syncToClock ? window.setInterval(seek, 15000) : null;
    return () => {
      el.removeEventListener('loadedmetadata', seek);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [ref, enabled, src, syncToClock, position]);
}
