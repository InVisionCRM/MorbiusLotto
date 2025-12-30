
import React, { useEffect, useState } from 'react';

interface ScoreDisplayProps {
  score: number;
  lastMultiplier: number | null;
}

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ score, lastMultiplier }) => {
  const [displayScore, setDisplayScore] = useState(score);

  useEffect(() => {
    const timer = setInterval(() => {
      if (displayScore < score) {
        setDisplayScore(prev => Math.min(prev + 1, score));
      } else if (displayScore > score) {
        setDisplayScore(prev => Math.max(prev - 1, score));
      }
    }, 20);
    return () => clearInterval(timer);
  }, [score, displayScore]);

  return (
    <div className="bg-slate-800/80 p-1 rounded-3xl border border-slate-700 shadow-[0_20px_50px_rgba(0,0,0,0.3)] space-y-6 backdrop-blur-md">
      <div className="flex flex-col">
        <span className="text-slate-500 text-xs uppercase tracking-[0.2em] font-bold mb-1">Available Credits</span>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-blue-500">
            {Math.floor(displayScore)}
          </span>
          <span className="text-slate-400 text-sm font-bold">PTS</span>
        </div>
      </div>
      
      <div className="pt-1 border-t border-slate-700/50">
        <span className="text-slate-500 text-xs uppercase tracking-[0.2em] font-bold block mb-3">Previous Result</span>
        <div className={`transition-all duration-700 transform ${lastMultiplier ? 'opacity-100 translate-y-0' : 'opacity-20 translate-y-2'}`}>
          {lastMultiplier ? (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-pink-500/10 flex items-center justify-center border border-pink-500/30">
                <span className="text-2xl font-black text-pink-500">{lastMultiplier}x</span>
              </div>
              <div className="flex flex-col">
                <span className="text-slate-200 font-bold">Multiplier Hit!</span>
                <span className="text-slate-400 text-xs">Payout confirmed</span>
              </div>
            </div>
          ) : (
             <div className="flex items-center gap-3 grayscale">
               <div className="h-8 w-8 rounded-xl bg-slate-700 flex items-center justify-center">
                 <i className="fas fa-dot-circle text-slate-500"></i>
               </div>
               <span className="text-slate-600 font-bold italic">Awaiting drop...</span>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScoreDisplay;
