'use client';

/**
 * Supplies the active table layout to the blackjack components.
 *
 * Components read the layout with `useBlackjackTableLayout()`, which falls back
 * to the shipped defaults when no provider is present. That keeps every surface
 * that has not been wrapped yet rendering exactly as it did before.
 */

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  DEFAULT_BLACKJACK_TABLE_LAYOUT,
  layoutToCssVars,
  mergeTableLayout,
  type BlackjackTableLayout,
  type DeepPartial,
} from '@/lib/blackjack-table-layout';

const BlackjackTableLayoutContext = createContext<BlackjackTableLayout>(
  DEFAULT_BLACKJACK_TABLE_LAYOUT
);

export function useBlackjackTableLayout(): BlackjackTableLayout {
  return useContext(BlackjackTableLayoutContext);
}

export function BlackjackTableLayoutProvider({
  layout,
  overrides,
  children,
  className,
  style,
}: {
  /** Full layout to use. Defaults to the shipped layout. */
  layout?: BlackjackTableLayout;
  /** Sparse changes applied on top of `layout` — what a saved table theme carries. */
  overrides?: DeepPartial<BlackjackTableLayout> | null;
  children: ReactNode;
  /** Applied to the wrapper that carries the CSS custom properties. */
  className?: string;
  style?: CSSProperties;
}) {
  const resolved = useMemo(
    () => mergeTableLayout(layout ?? DEFAULT_BLACKJACK_TABLE_LAYOUT, overrides),
    [layout, overrides]
  );

  // The custom properties have to land on a real element so the card
  // stylesheet can pick them up; `display: contents` keeps this wrapper out of
  // the layout so adding it cannot shift anything.
  const wrapperStyle = useMemo(
    () => ({ display: 'contents', ...layoutToCssVars(resolved), ...style }) as CSSProperties,
    [resolved, style]
  );

  return (
    <BlackjackTableLayoutContext.Provider value={resolved}>
      <div className={className} style={wrapperStyle}>
        {children}
      </div>
    </BlackjackTableLayoutContext.Provider>
  );
}
