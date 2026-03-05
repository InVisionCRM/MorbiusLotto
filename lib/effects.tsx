'use client';

import { Fragment } from 'react';
import { motion, MotionValue, useTransform } from 'motion/react';
import { Card } from '@/components/shared/Card';
import { Chip } from '@/components/shared/Chip';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const ExplodeItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const angle = (i / 8) * Math.PI * 2;
  const x = useTransform(progress, [0, 1], [0, Math.cos(angle) * 400]);
  const y = useTransform(progress, [0, 1], [0, Math.sin(angle) * 400]);
  const rotate = useTransform(progress, [0, 1], [0, 360]);
  return (
    <motion.div className="absolute inset-0" style={{ x, y, rotate }}>
      <Chip color={i % 2 === 0 ? 'blue' : 'white'} value={50} />
    </motion.div>
  );
};

const ImplodeItem = ({ progress, i, pos }: { progress: MotionValue<number>, i: number, pos: any }) => {
  const x = useTransform(progress, [0, 1], [pos.x, 0]);
  const y = useTransform(progress, [0, 1], [pos.y, 0]);
  const rotate = useTransform(progress, [0, 1], [pos.r, 0]);
  return (
    <motion.div className="absolute inset-0" style={{ x, y, rotate }}>
      <Card suit={i % 2 === 0 ? 'spade' : 'diamond'} value={(i + 2).toString()} />
    </motion.div>
  );
};

const FanItem = ({ progress, i, angle }: { progress: MotionValue<number>, i: number, angle: number }) => {
  const rotate = useTransform(progress, [0, 1], [0, angle]);
  return (
    <motion.div className="absolute inset-0 origin-bottom" style={{ rotate }}>
      <Card suit={i % 2 === 0 ? 'heart' : 'spade'} value={(i + 2).toString()} className="w-full h-full shadow-xl" />
    </motion.div>
  );
};

const StackItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const y = useTransform(progress, [0, 0.5 + (i * 0.05)], [800, 0]);
  const rotate = useTransform(progress, [0, 0.5 + (i * 0.05)], [180, 0]);
  return (
    <motion.div className="absolute" style={{ bottom: i * 15, y, rotate, zIndex: i }}>
      <Chip color="green" value={25} className="shadow-[0_4px_0_rgba(0,0,0,0.5)]" />
    </motion.div>
  );
};

const DealItem = ({ progress, i, pos }: { progress: MotionValue<number>, i: number, pos: any }) => {
  const x = useTransform(progress, [0, 0.3 + (i * 0.2)], [400, pos.x]);
  const y = useTransform(progress, [0, 0.3 + (i * 0.2)], [400, pos.y]);
  const rotate = useTransform(progress, [0, 0.3 + (i * 0.2)], [180, pos.r]);
  const opacity = useTransform(progress, [0, 0.1], [0, 1]);
  return (
    <motion.div className="absolute" style={{ x, y, rotate, opacity }}>
      <Card suit="diamond" value={(10 - i).toString()} />
    </motion.div>
  );
};

const RouletteItem = ({ progress, i, counterRotate }: { progress: MotionValue<number>, i: number, counterRotate: MotionValue<number> }) => {
  const angle = (i / 8) * Math.PI * 2;
  const x = Math.cos(angle) * 120;
  const y = Math.sin(angle) * 120;
  return (
    <div className="absolute" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <motion.div style={{ rotate: counterRotate }}>
        <Chip color={i % 2 === 0 ? 'red' : 'black'} value={i * 10} className="w-12 h-12 text-sm" />
      </motion.div>
    </div>
  );
};

const MatrixItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const y = useTransform(progress, [0, 1], [-800 + (i * 100), 800 + (i * 200)]);
  return (
    <motion.div style={{ y }} className="flex flex-col gap-4">
      <Card suit="club" value="2" className="w-16 h-24 opacity-20" />
      <Card suit="spade" value="A" className="w-16 h-24 opacity-50" />
      <Card suit="diamond" value="K" className="w-16 h-24 opacity-80" />
      <Card suit="heart" value="Q" className="w-16 h-24" />
    </motion.div>
  );
};

const TornadoItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const pOffset = i * 0.05;
  const y = useTransform(progress, [0, 1], [600 - (i * 40), -600 - (i * 40)]);
  const x = useTransform(progress, p => Math.sin((p + pOffset) * 20) * ((p + pOffset) * 150));
  const scale = useTransform(progress, [0, 1], [0.2 + (i * 0.05), 1.5 + (i * 0.05)]);
  const rotate = useTransform(progress, [0, 1], [0, 1080]);
  return (
    <motion.div className="absolute" style={{ x, y, scale, rotate }}>
      <Card suit={i % 2 === 0 ? 'diamond' : 'club'} value={i.toString()} className="w-16 h-24 shadow-2xl" />
    </motion.div>
  );
};

const DoubleFanItem = ({ progress, i, angle }: { progress: MotionValue<number>, i: number, angle: number }) => {
  const rotateL = useTransform(progress, [0, 1], [0, -angle]);
  const rotateR = useTransform(progress, [0, 1], [0, angle]);
  return (
    <Fragment>
      <motion.div className="absolute origin-bottom-right" style={{ rotate: rotateL, right: '50%' }}>
        <Card suit="heart" value={(i+2).toString()} className="shadow-xl" />
      </motion.div>
      <motion.div className="absolute origin-bottom-left" style={{ rotate: rotateR, left: '50%' }}>
        <Card suit="spade" value={(i+2).toString()} className="shadow-xl" />
      </motion.div>
    </Fragment>
  );
};

const CircularFanItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotate = useTransform(progress, [0, 1], [0, i * 30]);
  return (
    <motion.div className="absolute inset-0 origin-bottom" style={{ rotate }}>
      <Card suit={i % 2 === 0 ? 'diamond' : 'club'} value="A" className="shadow-md" />
    </motion.div>
  );
};

const AccordionFanItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const x = useTransform(progress, [0, 1], [0, (i - 3) * 60]);
  const rotate = useTransform(progress, [0, 1], [0, (i - 3) * 5]);
  return (
    <motion.div className="absolute" style={{ x, rotate }}>
      <Card suit="spade" value={(i+2).toString()} className="shadow-xl" />
    </motion.div>
  );
};

const SpiralFanItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotate = useTransform(progress, [0, 1], [0, i * 24]);
  const y = useTransform(progress, [0, 1], [0, -i * 12]);
  const scale = useTransform(progress, [0, 1], [1, 1 - (i * 0.03)]);
  return (
    <motion.div className="absolute inset-0 origin-bottom" style={{ rotate, y, scale }}>
      <Card suit="heart" value="7" className="shadow-lg" />
    </motion.div>
  );
};

const CornerFanItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotate = useTransform(progress, [0, 1], [0, i * 15]);
  return (
    <motion.div className="absolute inset-0 origin-bottom-left" style={{ rotate }}>
      <Card suit="club" value="K" className="shadow-xl w-full h-full" />
    </motion.div>
  );
};

const ReverseFanItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotate = useTransform(progress, [0, 1], [(i - 4) * 15, 0]);
  return (
    <motion.div className="absolute inset-0 origin-bottom" style={{ rotate }}>
      <Card suit="diamond" value="Q" className="shadow-md" />
    </motion.div>
  );
};

const VerticalRolodexItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotateX = useTransform(progress, [0, 1], [0, (i - 4.5) * 20]);
  const z = useTransform(progress, [0, 1], [0, Math.abs(i - 4.5) * -20]);
  return (
    <motion.div className="absolute inset-0" style={{ rotateX, z, transformStyle: "preserve-3d" }}>
      <Card suit="spade" value="J" className="w-full h-full shadow-xl" />
    </motion.div>
  );
};

const FlowerFanItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotate = useTransform(progress, [0, 1], [0, i * 45]);
  const y = useTransform(progress, [0, 1], [0, -120]);
  return (
    <motion.div className="absolute inset-0 origin-center" style={{ rotate }}>
      <motion.div style={{ y }} className="w-full h-full">
        <Card suit="heart" value="A" className="shadow-md" />
      </motion.div>
    </motion.div>
  );
};

const ChaosFanItem = ({ progress, i, rand }: { progress: MotionValue<number>, i: number, rand: any }) => {
  const rotate = useTransform(progress, [0, 1], [0, rand.r]);
  const x = useTransform(progress, [0, 1], [0, rand.x]);
  const y = useTransform(progress, [0, 1], [0, rand.y]);
  return (
    <motion.div className="absolute inset-0 origin-bottom" style={{ rotate, x, y }}>
      <Card suit="club" value={(i+2).toString()} className="shadow-lg" />
    </motion.div>
  );
};

const CascadeFanItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotate = useTransform(progress, [0, 1], [0, (i - 3) * 15]);
  const y = useTransform(progress, [0, 1], [0, i * 40]);
  return (
    <motion.div className="absolute inset-0 origin-top" style={{ rotate, y }}>
      <Card suit="diamond" value="10" className="shadow-xl" />
    </motion.div>
  );
};

const FullPageGridFlipItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const start = i * 0.03;
  const end = start + 0.2;
  const rotateY = useTransform(progress, [start, end], [0, 180]);
  return (
    <motion.div className="relative w-full aspect-[2/3]" style={{ rotateY, transformStyle: "preserve-3d" }}>
      <div className="absolute inset-0 [backface-visibility:hidden] bg-slate-800 rounded-xl border-2 border-slate-700 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-slate-600 opacity-50"></div>
      </div>
      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
        <Card suit={i % 2 === 0 ? 'heart' : 'spade'} value="A" className="w-full h-full" />
      </div>
    </motion.div>
  );
};

const DominoFlipItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const start = i * 0.1;
  const end = start + 0.2;
  const rotateX = useTransform(progress, [start, end], [0, 85]);
  return (
    <motion.div className="origin-bottom" style={{ rotateX, transformStyle: "preserve-3d" }}>
      <Card suit="diamond" value="10" className="shadow-xl" />
    </motion.div>
  );
};

const FullPageWaveFlipItem = ({ progress, i, cols }: { progress: MotionValue<number>, i: number, cols: number }) => {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const delay = (row + col) * 0.05;
  const rotateX = useTransform(progress, [delay, delay + 0.3], [0, 180]);
  return (
    <motion.div className="relative w-full aspect-[2/3]" style={{ rotateX, transformStyle: "preserve-3d" }}>
      <div className="absolute inset-0 [backface-visibility:hidden] bg-slate-800 rounded-xl border-2 border-slate-700"></div>
      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateX(180deg)]">
        <Card suit="heart" value="K" className="w-full h-full" />
      </div>
    </motion.div>
  );
};

const FoldingScreenItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rotateY = useTransform(progress, [0, 1], [0, i % 2 === 0 ? 75 : -75]);
  const origin = i % 2 === 0 ? "left" : "right";
  return (
    <motion.div className="-ml-[1px]" style={{ rotateY, transformOrigin: origin, transformStyle: "preserve-3d" }}>
      <Card suit="diamond" value="8" className="rounded-none border-x border-slate-300 shadow-lg" />
    </motion.div>
  );
};

const ExplodingGridItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const z = useTransform(progress, [0.5, 1], [0, (i % 3 === 1 ? 200 : -100) + (Math.floor(i/3) === 1 ? 150 : -50)]);
  return (
    <motion.div style={{ z, transformStyle: "preserve-3d" }}>
      <Card suit="club" value="9" />
    </motion.div>
  );
};

const HoveringDeckSpreadItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const z = useTransform(progress, [0, 1], [i * 2, i * 40]);
  const y = useTransform(progress, [0, 1], [0, -i * 10]);
  return (
    <motion.div className="absolute inset-0" style={{ z, y, transformStyle: "preserve-3d" }}>
      <Card suit="heart" value="J" className="w-full h-full shadow-xl" />
    </motion.div>
  );
};

const FullPageChaosFlipItem = ({ progress, i }: { progress: MotionValue<number>, i: number }) => {
  const rX = ((i * 37) % 360) - 180;
  const rY = ((i * 73) % 360) - 180;
  const rotateX = useTransform(progress, [0, 1], [0, rX]);
  const rotateY = useTransform(progress, [0, 1], [0, rY]);
  const z = useTransform(progress, [0, 1], [0, ((i * 17) % 200) - 100]);
  return (
    <motion.div className="relative w-full aspect-[2/3]" style={{ rotateX, rotateY, z, transformStyle: "preserve-3d" }}>
      <div className="absolute inset-0 [backface-visibility:hidden] bg-slate-800 rounded-xl border-2 border-slate-700"></div>
      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
        <Card suit="diamond" value="A" className="w-full h-full" />
      </div>
    </motion.div>
  );
};

export const effects = [
  {
    title: "1. Vertical Velocity",
    description: "Cards moving at different vertical speeds to create depth.",
    code: `const y1 = useTransform(progress, [0, 1], [500, -500]);
const y2 = useTransform(progress, [0, 1], [800, -800]);
const y3 = useTransform(progress, [0, 1], [300, -300]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const y1 = useTransform(progress, [0, 1], [500, -500]);
      const y2 = useTransform(progress, [0, 1], [800, -800]);
      const y3 = useTransform(progress, [0, 1], [300, -300]);
      return (
        <div className="relative flex gap-8">
          <motion.div style={{ y: y1 }}><Card suit="spade" value="A" /></motion.div>
          <motion.div style={{ y: y2 }}><Card suit="heart" value="K" /></motion.div>
          <motion.div style={{ y: y3 }}><Card suit="club" value="Q" /></motion.div>
        </div>
      );
    }
  },
  {
    title: "2. Horizontal Drift",
    description: "Chips drifting horizontally in opposing directions.",
    code: `const x1 = useTransform(progress, [0, 1], [-500, 500]);
const x2 = useTransform(progress, [0, 1], [500, -500]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const x1 = useTransform(progress, [0, 1], [-500, 500]);
      const x2 = useTransform(progress, [0, 1], [500, -500]);
      return (
        <div className="relative flex flex-col gap-8">
          <motion.div style={{ x: x1 }}><Chip color="red" value={100} /></motion.div>
          <motion.div style={{ x: x2 }}><Chip color="blue" value={500} /></motion.div>
          <motion.div style={{ x: x1 }}><Chip color="black" value={1000} /></motion.div>
        </div>
      );
    }
  },
  {
    title: "3. Continuous Rotation",
    description: "Cards spinning continuously as you scroll.",
    code: `const rotate = useTransform(progress, [0, 1], [0, 720]);
const y = useTransform(progress, [0, 1], [400, -400]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotate1 = useTransform(progress, [0, 1], [0, 720]);
      const rotate2 = useTransform(progress, [0, 1], [0, -720]);
      const y = useTransform(progress, [0, 1], [400, -400]);
      return (
        <div className="relative flex gap-12">
          <motion.div style={{ y, rotate: rotate1 }}><Card suit="diamond" value="J" /></motion.div>
          <motion.div style={{ y, rotate: rotate2 }}><Card suit="club" value="10" /></motion.div>
        </div>
      );
    }
  },
  {
    title: "4. Scale & Fade",
    description: "Chips growing and fading in, then fading out.",
    code: `const scale = useTransform(progress, [0, 0.5, 1], [0.5, 2, 0.5]);
const opacity = useTransform(progress, [0, 0.5, 1], [0, 1, 0]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const scale = useTransform(progress, [0, 0.5, 1], [0.5, 2, 0.5]);
      const opacity = useTransform(progress, [0, 0.5, 1], [0, 1, 0]);
      return (
        <motion.div style={{ scale, opacity }}>
          <Chip color="green" value={25} className="w-32 h-32 text-3xl" />
        </motion.div>
      );
    }
  },
  {
    title: "5. 3D Flip Y",
    description: "Cards flipping over on the Y-axis.",
    code: `const rotateY = useTransform(progress, [0, 1], [0, 720]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateY = useTransform(progress, [0, 1], [0, 720]);
      const y = useTransform(progress, [0, 1], [300, -300]);
      return (
        <div className="perspective-[1000px]">
          <motion.div style={{ y, rotateY, transformStyle: "preserve-3d" }}>
            <Card suit="spade" value="8" />
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "6. 3D Flip X",
    description: "Chips flipping over on the X-axis.",
    code: `const rotateX = useTransform(progress, [0, 1], [0, 720]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateX = useTransform(progress, [0, 1], [0, 720]);
      const x = useTransform(progress, [0, 1], [-300, 300]);
      return (
        <div className="perspective-[1000px]">
          <motion.div style={{ x, rotateX, transformStyle: "preserve-3d" }}>
            <Chip color="black" value={1000} />
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "7. Zig-Zag",
    description: "Cards moving in a zig-zag pattern down the screen.",
    code: `const x = useTransform(progress, [0, 0.25, 0.5, 0.75, 1], [0, 200, -200, 200, 0]);
const y = useTransform(progress, [0, 1], [400, -400]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const x = useTransform(progress, [0, 0.25, 0.5, 0.75, 1], [0, 200, -200, 200, 0]);
      const y = useTransform(progress, [0, 1], [400, -400]);
      return (
        <motion.div style={{ x, y }}>
          <Card suit="heart" value="7" />
        </motion.div>
      );
    }
  },
  {
    title: "8. Spiral",
    description: "Chips spiraling outwards from the center.",
    code: `const rotate = useTransform(progress, [0, 1], [0, 1080]);
const scale = useTransform(progress, [0, 1], [0, 3]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotate = useTransform(progress, [0, 1], [0, 1080]);
      const scale = useTransform(progress, [0, 1], [0, 3]);
      return (
        <motion.div style={{ rotate, scale }}>
          <Chip color="red" value={5} />
        </motion.div>
      );
    }
  },
  {
    title: "9. Explode",
    description: "A stack of chips exploding outwards in all directions.",
    code: `// Mapped for 8 different directions
const x = useTransform(progress, [0, 1], [0, Math.cos(angle) * 400]);
const y = useTransform(progress, [0, 1], [0, Math.sin(angle) * 400]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-20 h-20">
          {range(8).map(i => (
            <ExplodeItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "10. Implode",
    description: "Cards coming together into a single deck.",
    code: `const x = useTransform(progress, [0, 1], [startX, 0]);
const y = useTransform(progress, [0, 1], [startY, 0]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const positions = [
        { x: -400, y: -400, r: -45 },
        { x: 400, y: -400, r: 45 },
        { x: -400, y: 400, r: -135 },
        { x: 400, y: 400, r: 135 },
      ];
      return (
        <div className="relative w-24 h-36">
          {positions.map((pos, i) => (
            <ImplodeItem key={i} progress={progress} i={i} pos={pos} />
          ))}
        </div>
      );
    }
  },
  {
    title: "11. Wave",
    description: "Chips moving in a sine wave pattern.",
    code: `const x = useTransform(progress, [0, 0.25, 0.5, 0.75, 1], [0, 200, 0, -200, 0]);
const y = useTransform(progress, [0, 1], [400, -400]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const x1 = useTransform(progress, [0, 0.25, 0.5, 0.75, 1], [0, 200, 0, -200, 0]);
      const x2 = useTransform(progress, [0, 0.25, 0.5, 0.75, 1], [0, -200, 0, 200, 0]);
      const y = useTransform(progress, [0, 1], [400, -400]);
      return (
        <div className="relative flex gap-10">
          <motion.div style={{ x: x1, y }}><Chip color="green" value={25} /></motion.div>
          <motion.div style={{ x: x2, y }}><Chip color="black" value={100} /></motion.div>
        </div>
      );
    }
  },
  {
    title: "12. Perspective Tilt",
    description: "Cards tilting dynamically in 3D space based on scroll.",
    code: `const rotateX = useTransform(progress, [0, 1], [60, -60]);
const rotateY = useTransform(progress, [0, 1], [-60, 60]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateX = useTransform(progress, [0, 1], [60, -60]);
      const rotateY = useTransform(progress, [0, 1], [-60, 60]);
      const scale = useTransform(progress, [0, 0.5, 1], [0.8, 1.2, 0.8]);
      return (
        <div className="perspective-[800px]">
          <motion.div style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" }}>
            <Card suit="club" value="A" className="w-48 h-72" />
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "13. Color Shift",
    description: "Chips changing color hue as they scroll.",
    code: `const hue = useTransform(progress, [0, 1], [0, 360]);
const filter = useTransform(hue, h => \`hue-rotate(\${h}deg)\`);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const hue = useTransform(progress, [0, 1], [0, 360]);
      const y1 = useTransform(progress, [0, 1], [300, -300]);
      const y2 = useTransform(progress, [0, 1], [400, -200]);
      const filter = useTransform(hue, h => `hue-rotate(${h}deg)`);
      return (
        <div className="relative flex gap-8">
          <motion.div style={{ y: y1, filter }}><Chip color="red" value={5} className="w-32 h-32" /></motion.div>
          <motion.div style={{ y: y2, filter }}><Chip color="blue" value={10} className="w-32 h-32" /></motion.div>
        </div>
      );
    }
  },
  {
    title: "14. Blur & Focus",
    description: "Cards coming into focus as they reach the center.",
    code: `const blurVal = useTransform(progress, [0, 0.5, 1], [20, 0, 20]);
const filter = useTransform(blurVal, b => \`blur(\${b}px)\`);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const blurVal = useTransform(progress, [0, 0.5, 1], [20, 0, 20]);
      const filter = useTransform(blurVal, b => `blur(${b}px)`);
      const scale = useTransform(progress, [0, 0.5, 1], [0.5, 1.5, 0.5]);
      return (
        <motion.div style={{ filter, scale }}>
          <Card suit="heart" value="Q" className="w-40 h-60" />
        </motion.div>
      );
    }
  },
  {
    title: "15. Staggered Drop",
    description: "Cards dropping from the top one by one.",
    code: `// Different input ranges for each card
const y1 = useTransform(progress, [0, 0.4], [-800, 0]);
const y2 = useTransform(progress, [0.2, 0.6], [-800, 0]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const y1 = useTransform(progress, [0, 0.4], [-800, 0]);
      const y2 = useTransform(progress, [0.2, 0.6], [-800, 0]);
      const y3 = useTransform(progress, [0.4, 0.8], [-800, 0]);
      const y4 = useTransform(progress, [0.6, 1.0], [-800, 0]);
      return (
        <div className="flex gap-4">
          <motion.div style={{ y: y1 }}><Card suit="spade" value="2" /></motion.div>
          <motion.div style={{ y: y2 }}><Card suit="heart" value="3" /></motion.div>
          <motion.div style={{ y: y3 }}><Card suit="club" value="4" /></motion.div>
          <motion.div style={{ y: y4 }}><Card suit="diamond" value="5" /></motion.div>
        </div>
      );
    }
  },
  {
    title: "16. Orbit",
    description: "Chips orbiting around a central point.",
    code: `const angle = useTransform(progress, [0, 1], [0, Math.PI * 4]);
const x = useTransform(angle, a => Math.cos(a) * 200);
const y = useTransform(angle, a => Math.sin(a) * 200);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const angle1 = useTransform(progress, [0, 1], [0, Math.PI * 4]);
      const angle2 = useTransform(progress, [0, 1], [Math.PI, Math.PI * 5]);
      const x1 = useTransform(angle1, a => Math.cos(a) * 200);
      const y1 = useTransform(angle1, a => Math.sin(a) * 200);
      const x2 = useTransform(angle2, a => Math.cos(a) * 200);
      const y2 = useTransform(angle2, a => Math.sin(a) * 200);
      return (
        <div className="relative flex items-center justify-center">
          <Chip color="black" value={100} className="absolute z-10" />
          <motion.div className="absolute" style={{ x: x1, y: y1 }}><Chip color="red" value={5} /></motion.div>
          <motion.div className="absolute" style={{ x: x2, y: y2 }}><Chip color="blue" value={10} /></motion.div>
        </div>
      );
    }
  },
  {
    title: "17. Card Fan",
    description: "A deck of cards fanning out from the bottom.",
    code: `const rotate = useTransform(progress, [0, 1], [0, targetAngle]);
// transformOrigin: "bottom center"`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const angles = [-45, -30, -15, 0, 15, 30, 45];
      return (
        <div className="relative w-32 h-48 mt-32">
          {angles.map((angle, i) => (
            <FanItem key={i} progress={progress} i={i} angle={angle} />
          ))}
        </div>
      );
    }
  },
  {
    title: "18. Chip Stack",
    description: "Chips stacking up from the bottom.",
    code: `const y = useTransform(progress, [0, 1], [800, targetY]);
const rotate = useTransform(progress, [0, 1], [180, 0]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-24 h-64 flex flex-col-reverse items-center">
          {range(10).map(i => (
            <StackItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "19. Shuffle",
    description: "Cards shuffling past each other.",
    code: `const x1 = useTransform(progress, [0, 0.4, 0.6, 1], [0, -150, -150, 0]);
const x2 = useTransform(progress, [0, 0.4, 0.6, 1], [0, 150, 150, 0]);
const zIndex1 = useTransform(progress, p => p > 0.5 ? 10 : 0);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const x1 = useTransform(progress, [0, 0.4, 0.6, 1], [0, -150, -150, 0]);
      const x2 = useTransform(progress, [0, 0.4, 0.6, 1], [0, 150, 150, 0]);
      const y1 = useTransform(progress, [0, 0.4, 0.6, 1], [0, -20, 20, 0]);
      const y2 = useTransform(progress, [0, 0.4, 0.6, 1], [0, 20, -20, 0]);
      const zIndex1 = useTransform(progress, p => p > 0.5 ? 10 : 0);
      const zIndex2 = useTransform(progress, p => p > 0.5 ? 0 : 10);
      return (
        <div className="relative w-32 h-48">
          <motion.div className="absolute inset-0" style={{ x: x1, y: y1, zIndex: zIndex1 }}>
            <Card suit="spade" value="A" className="w-full h-full" />
          </motion.div>
          <motion.div className="absolute inset-0" style={{ x: x2, y: y2, zIndex: zIndex2 }}>
            <Card suit="heart" value="K" className="w-full h-full" />
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "20. Deal",
    description: "Cards being dealt to different positions.",
    code: `const x = useTransform(progress, [0, 1], [400, targetX]);
const y = useTransform(progress, [0, 1], [400, targetY]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const positions = [
        { x: -200, y: -100, r: -10 },
        { x: 0, y: -100, r: 0 },
        { x: 200, y: -100, r: 10 },
      ];
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          {positions.map((pos, i) => (
            <DealItem key={i} progress={progress} i={i} pos={pos} />
          ))}
          <div className="absolute bottom-10 right-10">
             <Card suit="club" value="Deck" className="bg-slate-800 text-white border-slate-700" />
          </div>
        </div>
      );
    }
  },
  {
    title: "21. Roulette Spin",
    description: "Chips spinning like a roulette wheel.",
    code: `const rotate = useTransform(progress, [0, 1], [0, 1440]);
// Container rotates, children counter-rotate to stay upright`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotate = useTransform(progress, [0, 1], [0, 1440]);
      const counterRotate = useTransform(progress, [0, 1], [0, -1440]);
      return (
        <motion.div className="relative w-64 h-64 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center" style={{ rotate }}>
          {range(8).map(i => (
            <RouletteItem key={i} progress={progress} i={i} counterRotate={counterRotate} />
          ))}
        </motion.div>
      );
    }
  },
  {
    title: "22. Matrix Rain",
    description: "Cards falling like Matrix code.",
    code: `const y = useTransform(progress, [0, 1], [-1000, 1000]);
// Staggered start positions and speeds`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-full h-full overflow-hidden flex justify-around">
          {range(5).map(i => (
            <MatrixItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "23. Heartbeat",
    description: "Chips pulsing as you scroll.",
    code: `const scale = useTransform(progress, 
  [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1], 
  [1, 1.5, 1, 1.5, 1, 1.5, 1, 1.5, 1]
);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const scale = useTransform(progress, 
        [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1], 
        [1, 1.5, 1, 1.5, 1, 1.5, 1, 1.5, 1]
      );
      const filter = useTransform(scale, s => `drop-shadow(0 0 ${(s - 1) * 50}px rgba(239,68,68,0.8))`);
      return (
        <motion.div style={{ scale, filter }}>
          <Chip color="red" value={100} className="w-40 h-40 text-4xl" />
        </motion.div>
      );
    }
  },
  {
    title: "24. Swing",
    description: "Cards swinging like a pendulum.",
    code: `const rotateZ = useTransform(progress, 
  [0, 0.25, 0.5, 0.75, 1], 
  [0, 60, -45, 30, 0]
);
// transformOrigin: "top center"`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateZ = useTransform(progress, 
        [0, 0.25, 0.5, 0.75, 1], 
        [0, 60, -45, 30, 0]
      );
      return (
        <div className="relative">
          <div className="absolute top-0 left-1/2 w-1 h-32 bg-white/20 -translate-x-1/2 -translate-y-full"></div>
          <motion.div style={{ rotate: rotateZ, transformOrigin: "top center" }}>
            <Card suit="spade" value="J" className="w-40 h-60" />
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "25. Tornado",
    description: "Cards swirling in a tornado shape.",
    code: `const y = useTransform(progress, [0, 1], [500, -500]);
const x = useTransform(progress, p => Math.sin(p * 20) * (p * 200));
const scale = useTransform(progress, [0, 1], [0.2, 2]);
const rotate = useTransform(progress, [0, 1], [0, 1440]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          {range(15).map(i => (
            <TornadoItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "26. Double Fan",
    description: "Two decks fanning out in opposite directions.",
    code: `const rotateL = useTransform(progress, [0, 1], [0, -angle]);\nconst rotateR = useTransform(progress, [0, 1], [0, angle]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const angles = [15, 30, 45, 60, 75];
      return (
        <div className="relative w-32 h-48 mt-32 flex justify-center">
          {angles.map((angle, i) => (
            <DoubleFanItem key={i} progress={progress} i={i} angle={angle} />
          ))}
        </div>
      );
    }
  },
  {
    title: "27. 360 Circular Fan",
    description: "Cards fanning out into a complete circle.",
    code: `const rotate = useTransform(progress, [0, 1], [0, i * 30]);\n// transformOrigin: "bottom center"`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-24 h-36">
          {range(12).map(i => (
            <CircularFanItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "28. Accordion Spread",
    description: "Cards spreading horizontally like an accordion.",
    code: `const x = useTransform(progress, [0, 1], [0, (i - 3) * 60]);\nconst rotate = useTransform(progress, [0, 1], [0, (i - 3) * 5]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-24 h-36 flex items-center justify-center">
          {range(7).map(i => (
            <AccordionFanItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "29. Spiral Fan",
    description: "Cards fanning and spiraling outward.",
    code: `const rotate = useTransform(progress, [0, 1], [0, i * 24]);\nconst y = useTransform(progress, [0, 1], [0, -i * 12]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-24 h-36 mt-32">
          {range(15).map(i => (
            <SpiralFanItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "30. Corner Fan",
    description: "Cards fanning out from the bottom-left corner.",
    code: `const rotate = useTransform(progress, [0, 1], [0, i * 15]);\n// transformOrigin: "bottom left"`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-32 h-48">
          {range(7).map(i => (
            <CornerFanItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "31. Reverse Fan",
    description: "Cards start fanned out and close into a single deck.",
    code: `const rotate = useTransform(progress, [0, 1], [(i - 4) * 15, 0]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-24 h-36 mt-20">
          {range(9).map(i => (
            <ReverseFanItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "32. Vertical Rolodex",
    description: "Cards fanning out vertically like a rolodex.",
    code: `const rotateX = useTransform(progress, [0, 1], [0, (i - 4.5) * 20]);\n// transformOrigin: "center center"`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-32 h-48 perspective-[1000px]">
          {range(10).map(i => (
            <VerticalRolodexItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "33. Flower Fan",
    description: "Cards blooming outward from the center.",
    code: `const rotate = useTransform(progress, [0, 1], [0, i * 45]);\nconst y = useTransform(progress, [0, 1], [0, -120]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-24 h-36">
          {range(8).map(i => (
            <FlowerFanItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "34. Chaos Fan",
    description: "Cards fanning out with randomized messy angles.",
    code: `const rotate = useTransform(progress, [0, 1], [0, randomAngle]);\nconst x = useTransform(progress, [0, 1], [0, randomX]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const randoms = [
        { r: -42, x: -30, y: 10 }, { r: 23, x: 40, y: -5 }, { r: -15, x: -10, y: 20 },
        { r: 56, x: 50, y: 15 }, { r: -68, x: -60, y: -10 }, { r: 12, x: 20, y: 25 },
        { r: 80, x: 70, y: 5 }, { r: -85, x: -70, y: -15 }, { r: 35, x: 30, y: -20 }
      ];
      return (
        <div className="relative w-24 h-36">
          {randoms.map((rand, i) => (
            <ChaosFanItem key={i} progress={progress} i={i} rand={rand} />
          ))}
        </div>
      );
    }
  },
  {
    title: "35. Cascade Fan",
    description: "Cards fanning out while cascading downwards.",
    code: `const rotate = useTransform(progress, [0, 1], [0, (i - 3) * 15]);\nconst y = useTransform(progress, [0, 1], [0, i * 40]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="relative w-24 h-36 -mt-32">
          {range(7).map(i => (
            <CascadeFanItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "36. Full Page Grid Flip",
    description: "A full screen grid of cards flipping over sequentially.",
    code: `const rotateY = useTransform(progress, [start, end], [0, 180]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      // 4 rows, 6 cols = 24 cards
      return (
        <div className="w-full h-full p-4 md:p-12 grid grid-cols-4 md:grid-cols-6 gap-4 perspective-[1200px]">
          {range(24).map(i => (
            <FullPageGridFlipItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "37. 3D Carousel",
    description: "Cards arranged in a 3D carousel rotating based on scroll.",
    code: `const rotateY = useTransform(progress, [0, 1], [0, -360]);\n// Cards translated Z outward`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateY = useTransform(progress, [0, 1], [0, -360]);
      const numCards = 8;
      const radius = 250;
      return (
        <div className="perspective-[1000px] flex items-center justify-center">
          <motion.div className="relative w-32 h-48" style={{ rotateY, transformStyle: "preserve-3d" }}>
            {range(numCards).map(i => {
              const angle = (i / numCards) * 360;
              return (
                <div key={i} className="absolute inset-0" style={{ transform: `rotateY(${angle}deg) translateZ(${radius}px)`, backfaceVisibility: 'hidden' }}>
                  <Card suit="club" value={(i+2).toString()} className="w-full h-full shadow-2xl" />
                </div>
              );
            })}
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "38. Domino Flip",
    description: "Cards falling over sequentially like dominos.",
    code: `const rotateX = useTransform(progress, [start, end], [0, 85]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="perspective-[1000px] flex gap-4 items-end h-64">
          {range(8).map(i => (
            <DominoFlipItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  },
  {
    title: "39. Full Page Wave Flip",
    description: "A full grid of cards flipping in a diagonal wave pattern.",
    code: `const delay = (row + col) * 0.05;\nconst rotateX = useTransform(progress, [delay, delay + 0.3], [0, 180]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const cols = 6;
      const rows = 4;
      return (
        <div className="w-full h-full p-4 md:p-12 grid grid-cols-4 md:grid-cols-6 gap-4 perspective-[1000px]">
          {range(rows * cols).map(i => (
            <FullPageWaveFlipItem key={i} progress={progress} i={i} cols={cols} />
          ))}
        </div>
      );
    }
  },
  {
    title: "40. Floating 3D Gallery",
    description: "Cards floating at different depths, tilting together.",
    code: `const rotateX = useTransform(progress, [0, 1], [30, -30]);\nconst rotateY = useTransform(progress, [0, 1], [-30, 30]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateX = useTransform(progress, [0, 1], [45, -45]);
      const rotateY = useTransform(progress, [0, 1], [-45, 45]);
      const cards = [
        { x: -150, y: -100, z: 100 }, { x: 150, y: -150, z: -50 },
        { x: 0, y: 0, z: 200 }, { x: -200, y: 150, z: -100 },
        { x: 200, y: 100, z: 50 }
      ];
      return (
        <div className="perspective-[1000px] w-full h-full flex items-center justify-center">
          <motion.div className="relative w-full h-full" style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}>
            {cards.map((pos, i) => (
              <div key={i} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, ${pos.z}px)` }}>
                <Card suit="spade" value={(i+2).toString()} className="shadow-2xl" />
              </div>
            ))}
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "41. Folding Screen",
    description: "Cards folding up like an accordion screen.",
    code: `const rotateY = useTransform(progress, [0, 1], [0, i % 2 === 0 ? 80 : -80]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="perspective-[1200px] flex items-center justify-center w-full">
          <div className="flex">
            {range(5).map(i => (
              <FoldingScreenItem key={i} progress={progress} i={i} />
            ))}
          </div>
        </div>
      );
    }
  },
  {
    title: "42. Exploding 3D Grid",
    description: "A grid of cards that tilts and explodes outward in Z-space.",
    code: `const z = useTransform(progress, [0.5, 1], [0, randomZ]);\nconst rotateX = useTransform(progress, [0, 0.5], [0, 60]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateX = useTransform(progress, [0, 0.5], [0, 60]);
      const rotateZ = useTransform(progress, [0, 0.5], [0, 20]);
      return (
        <div className="perspective-[1000px] w-full h-full flex items-center justify-center">
          <motion.div className="grid grid-cols-3 gap-4" style={{ rotateX, rotateZ, transformStyle: "preserve-3d" }}>
            {range(9).map(i => (
              <ExplodingGridItem key={i} progress={progress} i={i} />
            ))}
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "43. Hovering Deck Spread",
    description: "A deck tilts in 3D and spreads out along the Z-axis.",
    code: `const z = useTransform(progress, [0, 1], [0, i * 40]);\nconst rotateX = useTransform(progress, [0, 1], [0, 60]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateX = useTransform(progress, [0, 1], [0, 65]);
      const rotateZ = useTransform(progress, [0, 1], [0, -30]);
      return (
        <div className="perspective-[1000px] flex items-center justify-center">
          <motion.div className="relative w-32 h-48" style={{ rotateX, rotateZ, transformStyle: "preserve-3d" }}>
            {range(10).map(i => (
              <HoveringDeckSpreadItem key={i} progress={progress} i={i} />
            ))}
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "44. Cylinder Spin",
    description: "Cards forming a vertical cylinder rotating in 3D.",
    code: `const rotateX = useTransform(progress, [0, 1], [0, 360]);\n// Cards translated Z and rotated X`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      const rotateX = useTransform(progress, [0, 1], [0, -360]);
      const numCards = 8;
      const radius = 200;
      return (
        <div className="perspective-[1000px] flex items-center justify-center">
          <motion.div className="relative w-32 h-48" style={{ rotateX, transformStyle: "preserve-3d" }}>
            {range(numCards).map(i => {
              const angle = (i / numCards) * 360;
              return (
                <div key={i} className="absolute inset-0" style={{ transform: `rotateX(${angle}deg) translateZ(${radius}px)`, backfaceVisibility: 'hidden' }}>
                  <Card suit="spade" value="Q" className="w-full h-full shadow-2xl" />
                </div>
              );
            })}
          </motion.div>
        </div>
      );
    }
  },
  {
    title: "45. Full Page Chaos Flip",
    description: "A full grid of cards flipping randomly in all directions.",
    code: `const rotateX = useTransform(progress, [0, 1], [0, randomX]);\nconst rotateY = useTransform(progress, [0, 1], [0, randomY]);`,
    Component: ({ progress }: { progress: MotionValue<number> }) => {
      return (
        <div className="w-full h-full p-4 md:p-12 grid grid-cols-4 md:grid-cols-6 gap-4 perspective-[1000px]">
          {range(24).map(i => (
            <FullPageChaosFlipItem key={i} progress={progress} i={i} />
          ))}
        </div>
      );
    }
  }
];
