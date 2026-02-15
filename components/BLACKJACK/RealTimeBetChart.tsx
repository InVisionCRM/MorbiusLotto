"use client";

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { formatEther } from "viem";

interface BlackjackBetDataPoint {
  gameNumber: number;
  gameId?: string;
  betAmount: number; // MORBIUS (display units)
  payout: number; // MORBIUS (display units)
  profit: number; // payout - bet
  timestamp: number;
  result?: string;
}

export interface BlackjackRealTimeBetChartRef {
  addGameResult: (betAmountWei: bigint, payoutWei: bigint, meta?: { gameId?: string; result?: string }) => void;
  clear: () => void;
}

interface BlackjackRealTimeBetChartProps {
  sessionStartTime?: number;
}

function toFloatMorbius(valueWei: bigint): number {
  // For charting only (visual), float is OK.
  // Keep on-chain logic in bigint elsewhere.
  const s = formatEther(valueWei);
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const BlackjackRealTimeBetChart = React.forwardRef<BlackjackRealTimeBetChartRef, BlackjackRealTimeBetChartProps>(
  ({ sessionStartTime = Date.now() }, ref) => {
    const [history, setHistory] = useState<BlackjackBetDataPoint[]>([]);

    const addGameResult = useCallback(
      (betAmountWei: bigint, payoutWei: bigint, meta?: { gameId?: string; result?: string }) => {
        const betAmount = toFloatMorbius(betAmountWei);
        const payout = toFloatMorbius(payoutWei);
        const profit = payout - betAmount;

        setHistory((prev) => {
          const nextGameNumber = prev.length + 1;
          const next: BlackjackBetDataPoint = {
            gameNumber: nextGameNumber,
            gameId: meta?.gameId,
            betAmount,
            payout,
            profit,
            timestamp: Date.now(),
            result: meta?.result,
          };
          return [...prev, next];
        });
      },
      []
    );

    const clear = useCallback(() => {
      setHistory([]);
    }, []);

    useImperativeHandle(ref, () => ({ addGameResult, clear }), [addGameResult, clear]);

    // Reset when sessionStartTime changes (same behavior as Plinko chart)
    useEffect(() => {
      setHistory([]);
    }, [sessionStartTime]);

    const pnlData = useMemo(() => {
      let cumulativePnL = 0;
      return history.map((p, idx) => {
        cumulativePnL += p.profit;
        return {
          ...p,
          gameNumber: idx + 1,
          cumulativePnL,
        };
      });
    }, [history]);

    const totalBets = history.reduce((acc, p) => acc + p.betAmount, 0);
    const totalWon = history.reduce((acc, p) => acc + p.payout, 0);
    const netPnL = totalWon - totalBets;
    const roi = totalBets > 0 ? ((netPnL / totalBets) * 100).toFixed(1) : "0.0";

    const getYAxisDomain = () => {
      if (pnlData.length === 0) return [-100, 100];
      const values = pnlData.map((d) => d.cumulativePnL);
      const min = Math.min(...values, 0);
      const max = Math.max(...values, 0);
      const padding = Math.max(Math.abs(max - min) * 0.1, 50);
      return [Math.floor(min - padding), Math.ceil(max + padding)];
    };

    return (
      <div className="w-full h-full min-h-[280px] min-w-0 rounded-lg flex flex-col overflow-hidden bg-slate-800/40 border border-white/10">
        {/* Compact header — full width */}
        <div className="w-full shrink-0 grid grid-cols-3 items-center text-center gap-1 py-1 px-0">
          <div className="min-w-0">
            <div className="text-cyan-500/80 text-[10px] font-semibold uppercase tracking-wider">Games</div>
            <div className="text-white text-sm tabular-nums">{history.length}</div>
          </div>
          <div className="min-w-0">
            <div className="text-cyan-500/80 text-[10px] font-semibold uppercase tracking-wider">Net P&amp;L</div>
            <div
              className={`font-bold text-sm flex justify-center items-center gap-0.5 ${
                netPnL >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {netPnL >= 0 ? "+" : ""}
              {Math.round(netPnL)}
              <img src="/morbius/MorbiusLogo (3).png" alt="Morbius" className="w-5 h-5 object-contain shrink-0" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-cyan-500/80 text-[10px] font-semibold uppercase tracking-wider">ROI</div>
            <div className={`text-sm font-bold ${Number.parseFloat(roi) >= 0 ? "text-green-400" : "text-red-400"}`}>
              {Number.parseFloat(roi) >= 0 ? "+" : ""}
              {roi}%
            </div>
          </div>
        </div>

        {/* Chart — fills remaining space; same width/height as container */}
        <div className="flex-1 min-h-[200px] min-w-0 w-full overflow-hidden">
          {history.length === 0 ? (
            <div className="w-full h-full min-h-[160px] flex items-center justify-center">
              <p className="text-xs text-white/60">P&amp;L chart after first game</p>
            </div>
          ) : (
            <div className="w-full h-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%" minHeight={200} minWidth={0}>
                <AreaChart data={pnlData} margin={{ top: 10, right: 8, left: 0, bottom: 5 }}>
                <defs>
                  {/* Cyan gradient for positive values */}
                  <linearGradient id="positiveGradient-bj" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0891b2" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#0891b2" stopOpacity={0.05} />
                  </linearGradient>
                  {/* Blue gradient for negative values */}
                  <linearGradient id="negativeGradient-bj" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />

                <XAxis
                  dataKey="gameNumber"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={10}
                  tick={{ fill: "rgba(255,255,255,0.5)", fontFamily: "Poppins", fontWeight: 600 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.15)" }}
                />

                <YAxis
                  width={36}
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={10}
                  tick={{ fill: "rgba(255,255,255,0.5)", fontFamily: "Poppins", fontWeight: 600 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  domain={getYAxisDomain()}
                  tickFormatter={(value) => (value >= 1000 || value <= -1000 ? `${(value / 1000).toFixed(0)}k` : value)}
                />

                {/* Zero reference line - break even */}
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.4)" strokeDasharray="4 4" strokeWidth={1} />

                {/* Positive */}
                <Area
                  type="monotone"
                  dataKey="cumulativePnL"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#positiveGradient-bj)"
                  fillOpacity={1}
                  baseValue={0}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                />

                {/* Negative overlay (same trick as Plinko) */}
                <Area
                  type="monotone"
                  dataKey="cumulativePnL"
                  stroke="#EF4444"
                  strokeWidth={2}
                  fill="url(#negativeGradient-bj)"
                  fillOpacity={1}
                  baseValue={0}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="w-full shrink-0 flex justify-end py-0.5 px-0">
            <button
              type="button"
              onClick={clear}
              className="px-2 py-0.5 text-[10px] bg-cyan-500/10 hover:bg-cyan-600/20 border border-cyan-500/20 rounded text-cyan-300/80"
              title="Clear chart"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }
);

BlackjackRealTimeBetChart.displayName = "BlackjackRealTimeBetChart";

export { BlackjackRealTimeBetChart };
export default BlackjackRealTimeBetChart;

