'use client';

/**
 * CrashHUD — corner stats over the canvas (/crash).
 * Port of the prototype's GameHUD with honest numbers: the fake multiplayer
 * pool is replaced by the player's real session stats.
 */

import { useCrashStore } from './useCrashStore';

export default function CrashHUD() {
  const { sessionRounds, sessionNet } = useCrashStore();

  const netLabel =
    sessionNet > 0 ? `+${sessionNet.toLocaleString()}` : sessionNet.toLocaleString();

  return (
    <>
      <div className="absolute bottom-2 lg:bottom-5 left-3 lg:left-6 text-[9px] lg:text-[11px] text-[#848ca1] uppercase tracking-[1px] pointer-events-none z-10 font-bold">
        Session Rounds: {sessionRounds}
      </div>
      <div className="absolute bottom-2 lg:bottom-5 right-3 lg:right-6 text-[9px] lg:text-[11px] uppercase tracking-[1px] pointer-events-none z-10 font-bold">
        <span className="text-[#848ca1]">Session Net: </span>
        <span className={sessionNet > 0 ? 'text-[#00ffa3]' : sessionNet < 0 ? 'text-[#ff3e3e]' : 'text-[#848ca1]'}>
          {netLabel} MORBIUS
        </span>
      </div>
    </>
  );
}
