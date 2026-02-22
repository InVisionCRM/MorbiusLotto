'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';

export interface LayoutElement {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_LAYOUT: LayoutElement[] = [
  { id: 'table', type: 'oval', label: 'Table (oval)', x: 25, y: 20, width: 50, height: 45 },
  { id: 'seat0', type: 'seat', label: 'Seat 0 (you)', x: 42, y: 78, width: 12, height: 14 },
  { id: 'seat1', type: 'seat', label: 'Seat 1', x: 75, y: 65, width: 12, height: 14 },
  { id: 'seat2', type: 'seat', label: 'Seat 2', x: 85, y: 42, width: 12, height: 14 },
  { id: 'seat3', type: 'seat', label: 'Seat 3', x: 75, y: 18, width: 12, height: 14 },
  { id: 'seat4', type: 'seat', label: 'Seat 4', x: 42, y: 5, width: 12, height: 14 },
  { id: 'seat5', type: 'seat', label: 'Seat 5', x: 8, y: 18, width: 12, height: 14 },
  { id: 'communityCards', type: 'community', label: 'Community cards', x: 38, y: 42, width: 24, height: 12 },
  { id: 'pot', type: 'pot', label: 'Pot', x: 44, y: 48, width: 12, height: 5 },
  { id: 'actionBar', type: 'actions', label: 'Action bar', x: 25, y: 88, width: 50, height: 8 },
  { id: 'chat', type: 'chat', label: 'Chat panel', x: 78, y: 10, width: 18, height: 35 },
];

const STORAGE_KEY = 'poker-layout-designer';

function loadSavedLayout(): LayoutElement[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LayoutElement[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function saveLayout(layout: LayoutElement[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout, null, 2));
}

export default function PokerLayoutDesignerPage() {
  const [elements, setElements] = useState<LayoutElement[]>(() => loadSavedLayout() ?? DEFAULT_LAYOUT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ id: string; handle: string; startX: number; startY: number; startW: number; startH: number; startElX: number; startElY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = elements.find((e) => e.id === selectedId);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragState && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = 100 / rect.width;
        const scaleY = 100 / rect.height;
        const dx = (e.clientX - dragState.startX) * scaleX;
        const dy = (e.clientY - dragState.startY) * scaleY;
        setElements((prev) =>
          prev.map((el) =>
            el.id === dragState.id
              ? { ...el, x: Math.max(0, Math.min(100 - el.width, dragState.elX + dx)), y: Math.max(0, Math.min(100 - el.height, dragState.elY + dy)) }
              : el
          )
        );
      }
      if (resizeState && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = 100 / rect.width;
        const scaleY = 100 / rect.height;
        const dx = (e.clientX - resizeState.startX) * scaleX;
        const dy = (e.clientY - resizeState.startY) * scaleY;
        setElements((prev) => {
          const el = prev.find((x) => x.id === resizeState.id);
          if (!el) return prev;
          const { handle, startW, startH, startElX, startElY } = resizeState;
          let w = startW;
          let h = startH;
          let x = startElX;
          let y = startElY;
          if (handle.includes('e')) w = Math.max(4, startW + dx);
          if (handle.includes('w')) {
            const nw = Math.max(4, startW - dx);
            x = startElX + (startW - nw);
            w = nw;
          }
          if (handle.includes('s')) h = Math.max(3, startH + dy);
          if (handle.includes('n')) {
            const nh = Math.max(3, startH - dy);
            y = startElY + (startH - nh);
            h = nh;
          }
          return prev.map((elem) => (elem.id === resizeState.id ? { ...elem, x, y, width: w, height: h } : elem));
        });
      }
    },
    [dragState, resizeState]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
    setResizeState(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const exportJson = () => {
    const payload = { version: 1, background: '/POKER/Pokerbg.jpg', elements };
    const str = JSON.stringify(payload, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'poker-layout.json';
    a.click();
    URL.revokeObjectURL(url);
    navigator.clipboard.writeText(str).catch(() => {});
  };

  const handleReset = () => {
    setElements(DEFAULT_LAYOUT);
    setSelectedId(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSave = () => {
    saveLayout(elements);
    alert('Layout saved to this browser. Use Export to get JSON for the real game.');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <Link href="/poker" className="text-cyan-400 hover:text-cyan-300 text-sm">
            ← Poker
          </Link>
          <h1 className="text-xl font-bold text-cyan-400">Poker table layout designer</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-700 text-white text-sm"
            >
              Save
            </button>
            <button
              type="button"
              onClick={exportJson}
              className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-sm"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded bg-slate-600 hover:bg-slate-700 text-white text-sm"
            >
              Reset
            </button>
          </div>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Drag elements to move. Select an element and drag the corners/edges to resize. Export JSON and share it to apply the layout to the real poker game.
        </p>

        <div
          ref={containerRef}
          role="presentation"
          onClick={() => setSelectedId(null)}
          className="relative w-full rounded-xl overflow-hidden border-2 border-cyan-500/30"
          style={{
            backgroundImage: 'url(/POKER/Pokerbg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            aspectRatio: '16/10',
            maxHeight: '70vh',
          }}
        >
          {elements.map((el) => {
            const isSelected = selectedId === el.id;
            const isOval = el.type === 'oval';
            return (
              <div
                key={el.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setSelectedId(el.id);
                }}
                onKeyDown={(e) => e.key === 'Escape' && setSelectedId(null)}
                onMouseDown={(e) => {
                  if (resizeState) return;
                  const target = e.currentTarget;
                  const rect = containerRef.current!.getBoundingClientRect();
                  const scaleX = rect.width / 100;
                  const scaleY = rect.height / 100;
                  const elRect = target.getBoundingClientRect();
                  const relX = (elRect.left - rect.left) / scaleX;
                  const relY = (elRect.top - rect.top) / scaleY;
                  setDragState({ id: el.id, startX: e.clientX, startY: e.clientY, elX: relX, elY: relY });
                }}
                className={`absolute cursor-move select-none ${isSelected ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900' : ''}`}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  borderRadius: isOval ? '50%' : '8px',
                  background: isOval
                    ? 'linear-gradient(160deg, #0d5c2e 0%, #0a4d26 50%, #083d1e 100%)'
                    : 'rgba(20, 20, 20, 0.85)',
                  border: '1px solid rgba(34, 211, 238, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  color: '#94a3b8',
                }}
              >
                <span className="pointer-events-none text-center px-1">{el.label}</span>

                {isSelected && (
                  <>
                    {['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((handle) => {
                      const style: React.CSSProperties = {
                        width: 12,
                        height: 12,
                        marginLeft: -6,
                        marginTop: -6,
                        left: handle.includes('w') ? 0 : handle.includes('e') ? undefined : '50%',
                        right: handle.includes('e') ? 0 : undefined,
                        top: handle.includes('n') ? 0 : handle.includes('s') ? undefined : '50%',
                        bottom: handle.includes('s') ? 0 : undefined,
                      };
                      return (
                        <div
                          key={handle}
                          className="absolute w-3 h-3 bg-cyan-400 rounded-full border-2 border-white cursor-nwse-resize z-10"
                          style={style}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState(null);
                            setResizeState({
                              id: el.id,
                              handle,
                              startX: e.clientX,
                              startY: e.clientY,
                              startW: el.width,
                              startH: el.height,
                              startElX: el.x,
                              startElY: el.y,
                            });
                          }}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-4 rounded-lg bg-slate-800/80 border border-cyan-500/30">
          <h2 className="text-cyan-400 font-medium mb-2">Exported format</h2>
          <p className="text-slate-400 text-sm mb-2">
            Export produces a JSON file with <code className="bg-slate-700 px-1 rounded">version</code>, <code className="bg-slate-700 px-1 rounded">background</code>, and <code className="bg-slate-700 px-1 rounded">elements</code>. Each element has <code className="bg-slate-700 px-1 rounded">id</code>, <code className="bg-slate-700 px-1 rounded">type</code>, <code className="bg-slate-700 px-1 rounded">label</code>, <code className="bg-slate-700 px-1 rounded">x</code>, <code className="bg-slate-700 px-1 rounded">y</code>, <code className="bg-slate-700 px-1 rounded">width</code>, <code className="bg-slate-700 px-1 rounded">height</code> (all in percent 0–100). Share the JSON to have it applied to the real poker table.
          </p>
        </div>
      </div>
    </div>
  );
}
