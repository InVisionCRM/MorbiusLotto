'use client';

// Two 3D CSS dice driven by motion/react. During isRolling: tumble for 1.2s.
// On stop: snap to the face matching (val1, val2) within 0.2s.
// CSS classes (.die-body, .die-face-N, .dot) live in app/craps/craps.css.

import { useEffect } from 'react';
import { motion, useAnimation } from 'motion/react';

interface DiceProps {
  val1: number;
  val2: number;
  isRolling: boolean;
}

// Standard die face → rotateX/Y so that face is forward.
const targetRotation = (val: number) => {
  switch (val) {
    case 1: return { x: 0, y: 0 };
    case 2: return { x: 0, y: -90 };
    case 3: return { x: -90, y: 0 };
    case 4: return { x: 90, y: 0 };
    case 5: return { x: 0, y: 90 };
    case 6: return { x: 180, y: 0 };
    default: return { x: 0, y: 0 };
  }
};

const DieFace = ({ num }: { num: number }) => {
  // 3×3 dot grid — each die face places dots at the indexes for its pip count.
  const dots = Array(9).fill(null);
  const active: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const on = active[num] || [];
  return (
    <div className={`die-face die-face-${num}`}>
      {dots.map((_, i) => (
        <div key={i} className={on.includes(i) ? 'dot' : ''} />
      ))}
    </div>
  );
};

export function CrapsDice({ val1, val2, isRolling }: DiceProps) {
  const a = useAnimation();
  const b = useAnimation();

  useEffect(() => {
    if (isRolling) {
      a.start({
        rotateX: [0, 720, 1440, 1800],
        rotateY: [0, 1080, 2160, 2160],
        rotateZ: [0, 360, 720, 1080],
        transition: { duration: 1.2, ease: 'easeOut' },
      });
      b.start({
        rotateX: [0, 1080, 2160, 2160],
        rotateY: [0, 720, 1440, 1800],
        rotateZ: [0, 720, 1080, 1440],
        transition: { duration: 1.2, ease: 'easeOut' },
      });
      return;
    }
    const t1 = targetRotation(val1);
    const t2 = targetRotation(val2);
    a.start({ rotateX: t1.x, rotateY: t1.y, rotateZ: 0, transition: { duration: 0.2 } });
    b.start({ rotateX: t2.x, rotateY: t2.y, rotateZ: 0, transition: { duration: 0.2 } });
  }, [isRolling, val1, val2, a, b]);

  return (
    <div className="dice-container flex gap-8 items-center justify-center p-8">
      <motion.div className="die-body" animate={a}>
        {[1, 2, 3, 4, 5, 6].map((n) => <DieFace key={n} num={n} />)}
      </motion.div>
      <motion.div className="die-body" animate={b}>
        {[1, 2, 3, 4, 5, 6].map((n) => <DieFace key={n} num={n} />)}
      </motion.div>
    </div>
  );
}
