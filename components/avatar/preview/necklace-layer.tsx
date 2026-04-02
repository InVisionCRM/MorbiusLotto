import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import {
  NECKLACE_CHAIN_TS,
  NECKLACE_DRAPE,
  sampleNecklaceDrape,
} from './helpers';

type NecklaceLayerProps = {
  necklace: AvatarConfig['necklace'];
  uid: string;
};

export function NecklaceLayer({ necklace, uid }: NecklaceLayerProps) {
  const d = NECKLACE_DRAPE.d;
  switch (necklace) {
    case 'Gold Chain': {
      const beads = NECKLACE_CHAIN_TS.map((t) => sampleNecklaceDrape(t));
      return (
        <g>
          <path d={d} fill="none" stroke="#b45309" strokeWidth={1.45} strokeLinecap="round" />
          <path d={d} fill="none" stroke="#fbbf24" strokeWidth={0.9} strokeLinecap="round" />
          {beads.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={0.52} fill="#fcd34d" stroke="#b45309" strokeWidth={0.12} />
          ))}
        </g>
      );
    }
    case 'Silver Chain': {
      const beads = NECKLACE_CHAIN_TS.map((t) => sampleNecklaceDrape(t));
      return (
        <g>
          <path d={d} fill="none" stroke="#64748b" strokeWidth={1.35} strokeLinecap="round" />
          <path d={d} fill="none" stroke="#e2e8f0" strokeWidth={0.85} strokeLinecap="round" />
          {beads.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={0.5} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={0.1} />
          ))}
        </g>
      );
    }
    case 'Voxel Chain': {
      const [mx, my] = sampleNecklaceDrape(0.5);
      return (
        <g>
          <path d={d} fill="none" stroke={`url(#${uid}custom)`} strokeWidth={1.55} strokeLinecap="round" />
          <path d={d} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={1.55} strokeLinecap="round" opacity={0.4} />
          <rect x={mx - 3.25} y={my + 0.35} width="6.5" height="5.8" fill={`url(#${uid}custom)`} rx={0.45} />
          <rect x={mx - 2.2} y={my + 0.7} width="2.4" height="1.75" rx={0.28} fill="rgba(255,255,255,0.22)" />
        </g>
      );
    }
    default:
      return null;
  }
}
