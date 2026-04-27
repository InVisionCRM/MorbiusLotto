'use client';

import React from 'react';
import { Theme } from '@/lib/theme';
import { TableProfile } from '@/components/BLACKJACK/TableProfile';
import type { TableProfileData, TableThemeInfo } from '@/hooks/use-blackjack-tables';

export interface TableTokenProfileCardProps {
  /** Current theme kind (image | video) */
  themeKind: 'image' | 'video';
  /** Current table id (imageSource or videoSource) */
  themeId: string;
  /** Resolve theme to label/src */
  getThemeInfo: (theme: { kind: 'image' | 'video'; id: string }) => TableThemeInfo;
  /** Get table profile (description, token, logo, ticker) for the current table */
  getTableProfile: (kind: 'image' | 'video', id: string) => TableProfileData | null;
  /** When provided, "Change Table" opens the theme selector (e.g. setThemeModalOpen(true)) */
  onChangeTableClick?: () => void;
  /** Shorter min-height for sidebars (e.g. multiplayer table page) */
  compact?: boolean;
  /**
   * When true, TableProfile does not use fillHeight (fixed min iframe / natural stack height).
   * Use when the card sits in a layout where lg:h-full + flex-1 would collapse (e.g. some grid/flex parents).
   */
  naturalProfileHeight?: boolean;
  /**
   * When true, the card grows to fill leftover height in a flex column (e.g. under the blackjack table).
   * The iframe uses flexible height (min ~220px, grows) instead of a fixed min-h-[600px] content block.
   */
  fillColumn?: boolean;
}

/** Matches poker lobby hero card shell (`app/poker/page.tsx`). */
const POKER_HERO_CARD_SHELL_STYLE = {
  background: 'linear-gradient(170deg, #0c1929 0%, #0a0f1a 40%, #0d1117 100%)',
  boxShadow:
    '0 0 80px rgba(34,211,238,0.07), 0 2px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(34,211,238,0.1)',
} as const;

/**
 * Displays the token profile for the table currently in use.
 * Uses admin table data (token, description, logo, ticker) when available; otherwise defaults to MORBIUS.
 */
export function TableTokenProfileCard({
  themeKind,
  themeId,
  getThemeInfo,
  getTableProfile,
  onChangeTableClick,
  compact = false,
  naturalProfileHeight = false,
  fillColumn = false,
}: TableTokenProfileCardProps) {
  const profile = getTableProfile(themeKind, themeId);

  const stretchProfile = !compact && (fillColumn || !naturalProfileHeight);

  return (
    <div
      className={`relative rounded-xl min-w-0 flex flex-col overflow-hidden border border-cyan-400/10 ${
        fillColumn
          ? 'flex-1 h-full min-h-[max(38dvh,560px)]'
          : compact
            ? 'min-h-[280px] md:min-h-[300px]'
            : naturalProfileHeight
              ? 'min-h-[320px]'
              : 'min-h-[320px] lg:h-full lg:min-h-0'
      }`}
      style={POKER_HERO_CARD_SHELL_STYLE}
    >
      <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(34,211,238,0.18),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_20%_100%,rgba(59,130,246,0.08),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_80%_100%,rgba(99,102,241,0.06),transparent_60%)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative z-[1] flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
          <h3 className={`${Theme.cyan.text.primary} font-semibold text-sm`}>
            About This Table
          </h3>
          {onChangeTableClick ? (
            <button
              type="button"
              onClick={onChangeTableClick}
              className="text-cyan-300/80 hover:text-cyan-300 text-xs font-medium shrink-0 transition-colors"
            >
              Change Table
            </button>
          ) : (
            <span className="text-slate-400 text-xs shrink-0">Change Table</span>
          )}
        </div>
        <div
          className={
            stretchProfile
              ? 'relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden p-2'
              : naturalProfileHeight
                ? 'relative z-[1] flex flex-col overflow-auto p-2'
                : 'relative z-[1] min-h-0 flex-1 overflow-auto p-2'
          }
        >
          <TableProfile
            name={profile?.name ?? undefined}
            tokenAddress={profile?.token_contract_address ?? undefined}
            description={profile?.description ?? undefined}
            logoUrl={profile?.logo_url ?? undefined}
            ticker={profile?.ticker ?? undefined}
            websiteUrl={profile?.website_url ?? undefined}
            iframeUrl={profile?.iframe_url ?? undefined}
            fillHeight={stretchProfile}
          />
        </div>
      </div>
    </div>
  );
}
