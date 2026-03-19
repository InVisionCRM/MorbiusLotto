'use client';

import React from 'react';
import type { BJMultiHandObj } from '@/lib/websocket-client';
import { Button } from '@/components/ui/button';

interface Props {
  hand: BJMultiHandObj;
  handIndex: number;
  onAction: (action: 'hit' | 'stand' | 'double_down' | 'split', handIndex?: number) => void;
}

export default function BJMultiActionButtons({ hand, handIndex, onAction }: Props) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {hand.canHit && (
        <Button
          onClick={() => onAction('hit', handIndex)}
          className="bg-green-700 hover:bg-green-600 text-white text-sm px-5 h-9"
        >
          Hit
        </Button>
      )}
      {hand.canStand && (
        <Button
          onClick={() => onAction('stand', handIndex)}
          className="bg-slate-600 hover:bg-slate-500 text-white text-sm px-5 h-9"
        >
          Stand
        </Button>
      )}
      {hand.canDoubleDown && (
        <Button
          onClick={() => onAction('double_down', handIndex)}
          className="bg-yellow-700 hover:bg-yellow-600 text-white text-sm px-5 h-9"
        >
          Double
        </Button>
      )}
      {hand.canSplit && (
        <Button
          onClick={() => onAction('split', handIndex)}
          className="bg-purple-700 hover:bg-purple-600 text-white text-sm px-5 h-9"
        >
          Split
        </Button>
      )}
    </div>
  );
}
