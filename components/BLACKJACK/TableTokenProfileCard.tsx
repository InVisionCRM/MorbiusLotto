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

const PANEL_STYLE = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
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
      className={`rounded-xl min-w-0 flex flex-col border border-cyan-500/30 ${
        fillColumn
          ? 'flex-1 h-full min-h-[max(38dvh,560px)] overflow-hidden'
          : compact
            ? 'min-h-[280px] overflow-hidden md:min-h-[300px]'
            : naturalProfileHeight
              ? 'min-h-[320px] overflow-hidden'
              : 'min-h-[320px] overflow-hidden lg:h-full lg:min-h-0'
      }`}
      style={PANEL_STYLE}
    >
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
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
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden p-2'
            : naturalProfileHeight
              ? 'flex flex-col overflow-auto p-2'
              : 'min-h-0 flex-1 overflow-auto p-2'
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
  );
}
