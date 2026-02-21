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
}

const PANEL_STYLE = {
  background: Theme.panel.sidebar.background,
  boxShadow: Theme.panel.sidebar.boxShadow,
  border: Theme.panel.sidebar.border,
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
}: TableTokenProfileCardProps) {
  const profile = getTableProfile(themeKind, themeId);
  const themeInfo = getThemeInfo({ kind: themeKind, id: themeId });

  return (
    <div
      className="min-h-[280px] lg:min-h-[340px] rounded-xl overflow-hidden flex flex-col min-w-0"
      style={PANEL_STYLE}
    >
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className={`${Theme.cyan.text.primary} font-semibold text-sm`}>
          Table token
        </h3>
        <span className="text-slate-400 text-xs truncate max-w-[140px]" title={themeInfo.label}>
          {themeInfo.label}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2">
        <TableProfile
          tokenAddress={profile?.token_contract_address ?? undefined}
          description={profile?.description ?? undefined}
          logoUrl={profile?.logo_url ?? undefined}
          ticker={profile?.ticker ?? undefined}
          websiteUrl={profile?.website_url ?? undefined}
        />
      </div>
    </div>
  );
}
