/* eslint-disable react/forbid-dom-props */
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
      className={`relative inline-flex overflow-hidden rounded-full w-12 h-12 p-[1px] transition-all duration-500 ${motionClass}`}
    >
      {/* Inner content */}
      <span
        className="relative inline-flex items-center justify-center rounded-full font-bold w-full h-full text-[1.25rem] z-[1] bg-white text-purple-950"
      >
        <span>{number}</span>
      </span>
    </div>
  );
};

export default BallResult;
