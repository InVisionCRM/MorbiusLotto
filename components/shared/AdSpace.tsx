'use client';

import Link from 'next/link';
import { useAdCreative } from '@/hooks/use-ad-creative';
import { getEffectiveAdUrl, isVideoUrl } from '@/lib/ad-config';

type Slot = 'default' | 'hero' | 'loading';

const PANEL_STYLE = {
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
};

interface AdSpaceProps {
  /** Which URL slot to use (default = games/sidebars, hero = home hero, loading = loading screens). */
  slot?: Slot;
  /** Optional custom class for the container. */
  className?: string;
  /** If true, show the "Advertise Here" link overlay. Default true. */
  showCta?: boolean;
  /** Optional fixed width (e.g. 300 for loading block). */
  width?: number;
  /** Optional fixed height (e.g. 100 for loading block). */
  height?: number;
}

export function AdSpace({ slot = 'default', className = '', showCta = true, width, height }: AdSpaceProps) {
  const { config } = useAdCreative();
  const url = getEffectiveAdUrl(config ?? undefined, slot);
  const isVideo = isVideoUrl(url);

  const sizeStyle =
    width !== undefined || height !== undefined
      ? { width: width ?? undefined, height: height ?? undefined, minHeight: height ?? undefined }
      : undefined;

  return (
    <div
      className={`rounded-xl flex flex-col items-center justify-center gap-3 border border-cyan-500/20 shrink-0 overflow-hidden relative ${width === undefined ? 'w-full h-[200px] md:h-[280px]' : ''} ${className}`.trim()}
      style={{ ...PANEL_STYLE, ...sizeStyle }}
    >
      {isVideo ? (
        <video
          src={url}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${url})` }}
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      {showCta && (
        <Link
          href="/marketing"
          className="relative z-10 px-6 py-2.5 rounded-xl font-semibold text-white transition-all duration-300 hover:scale-105 hover:border-cyan-400/80 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
          style={{
            background: 'rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)',
          }}
        >
          <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Advertise Here</span>
        </Link>
      )}
    </div>
  );
}
