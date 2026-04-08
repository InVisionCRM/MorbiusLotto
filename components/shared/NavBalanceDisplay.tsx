'use client'

import Image from 'next/image';

const WEI_PER_MORBIUS = BigInt('1000000000000000000');

export function formatWholeMorbius(wei: bigint): string {
  return Math.round(Number(wei / WEI_PER_MORBIUS)).toLocaleString();
}

interface NavBalanceDisplayProps {
  reserve?: bigint;
  inWallet?: bigint;
  /** 'sidebar' = desktop sidebar header; 'mobile-bar' = top mobile strip; 'mobile-drawer' = open drawer header */
  variant: 'sidebar' | 'mobile-bar' | 'mobile-drawer';
}

export function NavBalanceDisplay({ reserve, inWallet, variant }: NavBalanceDisplayProps) {
  if (reserve === undefined && inWallet === undefined) return null;

  if (variant === 'mobile-bar') {
    return (
      <div
        className="flex flex-col gap-0.5 shrink-0 text-white/90 leading-tight max-w-[6.5rem]"
        title={[
          reserve !== undefined ? `Balance ${formatWholeMorbius(reserve)} MORBIUS` : null,
          inWallet !== undefined ? `In-wallet ${formatWholeMorbius(inWallet)} MORBIUS` : null,
        ].filter(Boolean).join(' · ') || undefined}
      >
        {reserve !== undefined && (
          <span className="text-[9px]">
            <span className="text-white/55">Balance </span>
            <span className="font-semibold tabular-nums text-white/95">{formatWholeMorbius(reserve)}</span>
          </span>
        )}
        {inWallet !== undefined && (
          <span className="text-[9px]">
            <span className="text-white/55">In-wallet </span>
            <span className="font-semibold tabular-nums text-white/95">{formatWholeMorbius(inWallet)}</span>
          </span>
        )}
      </div>
    );
  }

  if (variant === 'mobile-drawer') {
    return (
      <div className="flex flex-col gap-2 pl-[2.25rem] pr-1 pb-1">
        {reserve !== undefined && (
          <div className="space-y-0.5">
            <div className="text-[9px] text-white/55 uppercase tracking-wide">Balance</div>
            <div className="flex items-center gap-1.5">
              <span className="text-white text-xs font-semibold tabular-nums">{formatWholeMorbius(reserve)}</span>
              <Image src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" width={12} height={12} className="object-contain opacity-80" />
            </div>
          </div>
        )}
        {inWallet !== undefined && (
          <div className={`space-y-0.5 ${reserve !== undefined ? 'pt-1 border-t border-white/10' : ''}`}>
            <div className="text-[9px] text-white/55 uppercase tracking-wide">In-wallet</div>
            <div className="flex items-center gap-1.5">
              <span className="text-white text-xs font-semibold tabular-nums">{formatWholeMorbius(inWallet)}</span>
              <Image src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" width={12} height={12} className="object-contain opacity-80" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // sidebar
  return (
    <div className="px-2 pt-1.5 flex flex-col gap-2 w-full min-w-0">
      {reserve !== undefined && (
        <div className="sidebar-label !block w-full min-w-0 space-y-1">
          <div className="text-[10px] text-white/55 uppercase tracking-wide leading-none">Balance</div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-white text-sm font-semibold tabular-nums truncate">{formatWholeMorbius(reserve)}</span>
            <Image src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" width={14} height={14} className="object-contain opacity-80 shrink-0" />
          </div>
        </div>
      )}
      {inWallet !== undefined && (
        <div className={`sidebar-label !block w-full min-w-0 space-y-1 ${reserve !== undefined ? 'pt-2 border-t border-white/10' : ''}`}>
          <div className="text-[10px] text-white/55 uppercase tracking-wide leading-none">In-wallet</div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-white text-sm font-semibold tabular-nums truncate">{formatWholeMorbius(inWallet)}</span>
            <Image src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" width={14} height={14} className="object-contain opacity-80 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
