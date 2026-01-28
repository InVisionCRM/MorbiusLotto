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
      <div
        className="w-full h-full rounded-lg pt-1 pr-1 pb-1 pl-1 flex flex-col"
        style={{
          background: "linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))",
          boxShadow:
            "inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 1px 2px rgba(0, 0, 0, 0.5)",
          border: "1px inset rgba(60, 60, 60, 0.5)",
        }}
      >
        {/* Header with Stats (matches Plinko layout) */}
        <div className="mb-1">
          <div className="grid grid-cols-3 items-center justify-center text-center">
            <div className="bg-slate-00/50 w-full px-1 py-1 rounded-tl-lg">
              <div className="text-cyan-300/80 text-[16px] uppercase font-bold font-prosto-one tracking-wider">Games</div>
              <div className="text-white font-bold text-2xl text-center">{history.length}</div>
            </div>
            <div className="bg-slate-00/50 w-full px-1 py-1">
              <div className="text-cyan-300/80 text-[16px] uppercase font-bold font-prosto-one tracking-wider">Net P&amp;L</div>
              <div
                className={`font-bold text-2xl flex text-center justify-center items-center gap-0.5 ${
                  netPnL >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {netPnL >= 0 ? "+" : ""}
                {Math.round(netPnL)}
                <img
                  src="/morbius/MorbiusLogo (3).png"
                  alt="Morbius"
                  className="w-16 h-16 object-contain"
                />
              </div>
            </div>
            <div className="bg-slate-000/50 w-full px-1 py-1 rounded-tl-lg">
              <div className="text-cyan-300/80 text-[16px] uppercase font-bold font-prosto-one tracking-wider">ROI</div>
              <div className={`font-bold font-prosto-one text-2xl ${Number.parseFloat(roi) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {Number.parseFloat(roi) >= 0 ? "+" : ""}
                {roi}%
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-full min-h-[300px] w-full flex-1" style={{ minWidth: 0, minHeight: '300px' }}>
          {history.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-purple-500">
                <p className="text-lg font-bold font-prosto-one">P&amp;L chart will appear</p>
                <p className="text-sm font-bold font-prosto-one">after your first game</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
              <AreaChart data={pnlData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
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
                  tick={{ fill: "rgba(255,255,255,0.5)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.15)" }}
                />

                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={10}
                  tick={{ fill: "rgba(255,255,255,0.5)" }}
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
          )}
        </div>

        {/* Minimal footer controls (discreet) */}
        {history.length > 0 && (
          <div className="mt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={clear}
              className="px-2 py-1 text-[10px] bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/20 rounded text-cyan-300/80 transition-colors"
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

