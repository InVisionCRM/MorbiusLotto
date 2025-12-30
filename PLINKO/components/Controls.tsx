
import React from 'react';

interface ControlsProps {
  onDrop: () => void;
  disabled: boolean;
}

const Controls: React.FC<ControlsProps> = ({ onDrop, disabled }) => {
  return (
    <div className="bg-slate-800/80 p-1 rounded-2xl border border-slate-700 shadow-xl">
      <button
        onClick={onDrop}
        disabled={disabled}
        className={`w-full py-1 px-1 rounded-md text-md font-black transition-all transform active:scale-100 flex items-center justify-center gap-1
          ${disabled 
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed grayscale' 
            : 'bg-gradient-to-br from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white shadow-lg shadow-pink-500/20 active:shadow-inner'
          }`}
      >
        <i className="fas fa-play"></i>
        DROP BALL
      </button>
      <div className="mt-1 text-center">
        <p className="text-xs text-slate-500">
          Costs 10 PTS per drop
        </p>
      </div>
    </div>
  );
};

export default Controls;
