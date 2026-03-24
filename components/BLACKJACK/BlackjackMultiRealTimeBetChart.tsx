'use client';

import React from 'react';
import BlackjackRealTimeBetChart, {
  type BlackjackRealTimeBetChartRef,
} from '@/components/BLACKJACK/RealTimeBetChart';

export type BlackjackMultiRealTimeBetChartRef = BlackjackRealTimeBetChartRef;

type BlackjackMultiRealTimeBetChartProps = {
  sessionStartTime?: number;
};

/**
 * Multiplayer-specific chart wrapper.
 * Keeps multiplayer wiring isolated without changing shared blackjack chart internals.
 */
const BlackjackMultiRealTimeBetChart = React.forwardRef<
  BlackjackMultiRealTimeBetChartRef,
  BlackjackMultiRealTimeBetChartProps
>(({ sessionStartTime }, ref) => {
  return <BlackjackRealTimeBetChart ref={ref} sessionStartTime={sessionStartTime} />;
});

BlackjackMultiRealTimeBetChart.displayName = 'BlackjackMultiRealTimeBetChart';

export default BlackjackMultiRealTimeBetChart;
