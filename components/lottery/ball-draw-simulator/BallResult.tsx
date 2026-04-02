 
import React from 'react';

interface BallResultProps {
  number: number;
  type: 'white' | 'red';
  animate: boolean;
  delay?: number;
}

const BallResult: React.FC<BallResultProps> = ({ number, type, animate, delay = 0 }) => {
  const textColor = '#3b0764' // purple-950

  const motionClass = animate
    ? 'scale-100 translate-y-0 opacity-100'
    : 'scale-0 translate-y-10 opacity-0'

  return (
    <div
      className={`relative inline-flex overflow-hidden rounded-full p-[1px] transition-all duration-500 w-10 h-10 sm:w-14 sm:h-14 text-base sm:text-lg ${motionClass}`}
    >
      {/* Ball base */}
      <span className="relative inline-flex items-center justify-center rounded-full font-bold w-full h-full z-[1] bg-white text-black overflow-hidden">
        <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{number}</span>
      </span>
    </div>
  );
};

export default BallResult;
