'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  usePokerTableEffect,
  TABLE_EFFECT_OPTIONS,
  FELT_COLOR_PRESETS,
  RAIL_COLOR_PRESETS,
  type TableEffectId,
} from '@/hooks/use-poker-table-effect';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { usePokerRpsChallenges } from '@/hooks/use-poker-rps-challenges';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** When true, shows admin-only Table Graphics section. */
  isAdmin?: boolean;
  /** Current logo filename from table state (server-set). */
  currentLogo?: string | null;
  /** Current logo opacity from table state (server-set). */
  currentLogoOpacity?: number | null;
  /** WebSocket client for admin logo updates. */
  wsClient?: BlackjackWebSocketClient | null;
  /** Table ID for admin logo updates. */
  tableId?: string;
};

export function PokerTableSettingsModal({ isOpen, onClose, isAdmin, currentLogo, currentLogoOpacity, wsClient, tableId }: Props) {
  const { effect, setEffect, feltColor, setFeltColor, railColor, setRailColor } = usePokerTableEffect();
  const rpsChallenges = usePokerRpsChallenges();

  // Admin logo state — seeded from server state
  const [logoFiles, setLogoFiles] = useState<string[]>([]);
  const [selectedLogo, setSelectedLogo] = useState<string | null>(currentLogo ?? null);
  const [opacity, setOpacity] = useState(currentLogoOpacity ?? 0.12);
  const [saving, setSaving] = useState(false);

  // Sync from server state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedLogo(currentLogo ?? null);
      setOpacity(currentLogoOpacity ?? 0.12);
    }
  }, [isOpen, currentLogo, currentLogoOpacity]);

  // Load available logo files from the public directory listing API
  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    fetch('/api/poker/logos')
      .then(r => r.ok ? r.json() : { files: [] })
      .then((data: { files: string[] }) => setLogoFiles(data.files ?? []))
      .catch(() => setLogoFiles([]));
  }, [isOpen, isAdmin]);

  const handleSaveLogo = useCallback(async () => {
    if (!wsClient || !tableId) return;
    setSaving(true);
    try {
      await wsClient.pokerUpdateTableLogo(tableId, selectedLogo, opacity);
    } catch { /* toast error handled by WS */ }
    setSaving(false);
  }, [wsClient, tableId, selectedLogo, opacity]);

  // Detect if admin has unsaved changes
  const logoChanged = selectedLogo !== (currentLogo ?? null) || opacity !== (currentLogoOpacity ?? 0.12);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center pt-2 px-2 pointer-events-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="pointer-events-auto w-full max-w-sm rounded-xl overflow-hidden max-h-[90dvh] overflow-y-auto"
        style={{
          background: 'rgba(8,10,16,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(34,211,238,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <span className="text-[11px] font-extrabold tracking-wide uppercase" style={{ color: 'rgba(34,211,238,0.9)' }}>
            Table Appearance
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-lg transition-all hover:bg-white/10 flex items-center justify-center text-[10px]"
            style={{ color: 'rgba(255,255,255,0.6)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          {/* Effect selector — hidden on mobile since effects are PC only */}
          <div className="hidden md:block">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1.5">Effect</div>
            <div className="flex gap-1.5">
              {TABLE_EFFECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEffect(opt.id as TableEffectId)}
                  className="flex-1 px-2 py-1.5 rounded-lg border text-center transition-all"
                  style={{
                    background: effect === opt.id ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                    borderColor: effect === opt.id ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: effect === opt.id ? 'rgba(34,211,238,0.95)' : 'rgba(255,255,255,0.6)' }}
                  >
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Felt color */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1.5">Felt Color</div>
            <div className="grid grid-cols-6 gap-1.5">
              {FELT_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setFeltColor(preset.id)}
                  className="flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all"
                  style={{
                    background: feltColor === preset.id ? 'rgba(34,211,238,0.08)' : 'transparent',
                    borderColor: feltColor === preset.id ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full shrink-0 border"
                    style={{
                      background: preset.gradient,
                      borderColor: feltColor === preset.id ? 'rgba(34,211,238,0.6)' : 'rgba(255,255,255,0.1)',
                    }}
                  />
                  <span
                    className="text-[9px] font-bold leading-none"
                    style={{ color: feltColor === preset.id ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.45)' }}
                  >
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Rail color */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1.5">Rail Color</div>
            <div className="grid grid-cols-6 gap-1.5">
              {RAIL_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setRailColor(preset.id)}
                  className="flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all"
                  style={{
                    background: railColor === preset.id ? 'rgba(34,211,238,0.08)' : 'transparent',
                    borderColor: railColor === preset.id ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full shrink-0 border"
                    style={{
                      background: preset.swatch,
                      borderColor: railColor === preset.id ? 'rgba(34,211,238,0.6)' : 'rgba(255,255,255,0.1)',
                    }}
                  />
                  <span
                    className="text-[9px] font-bold leading-none"
                    style={{ color: railColor === preset.id ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.45)' }}
                  >
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Mini-games — accept RPS challenges from other players (just-for-fun). */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1.5">Mini-games</div>
            <button
              type="button"
              onClick={() => rpsChallenges.setEnabled(!rpsChallenges.enabled)}
              role="switch"
              aria-checked={rpsChallenges.enabled}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg border transition-all"
              style={{
                background: rpsChallenges.enabled ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.03)',
                borderColor: rpsChallenges.enabled ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.06)',
              }}
            >
              <span className="text-[11px] font-bold" style={{ color: rpsChallenges.enabled ? 'rgba(34,211,238,0.9)' : 'rgba(255,255,255,0.55)' }}>
                Accept Rock-Paper-Scissors challenges
              </span>
              <span
                className="relative w-8 h-[18px] rounded-full shrink-0 transition-all"
                style={{ background: rpsChallenges.enabled ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.12)' }}
              >
                <span
                  className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
                  style={{ left: rpsChallenges.enabled ? '16px' : '2px' }}
                />
              </span>
            </button>
          </div>

          {/* ── Admin: Table Graphics ────────────────────────────────── */}
          {isAdmin && (
            <div className="pt-2 mt-1 border-t border-amber-400/15">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'rgba(251,191,36,0.7)' }}>
                Admin — Table Graphics
              </div>

              {/* Logo selector */}
              <div className="mb-2">
                <div className="text-[10px] font-medium text-white/40 mb-1.5">Logo</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {/* "None" option */}
                  <button
                    type="button"
                    onClick={() => setSelectedLogo(null)}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg border transition-all"
                    style={{
                      background: selectedLogo === null ? 'rgba(251,191,36,0.08)' : 'transparent',
                      borderColor: selectedLogo === null ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded border flex items-center justify-center"
                      style={{
                        borderColor: selectedLogo === null ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <span className="text-[10px] text-white/30">Off</span>
                    </div>
                    <span
                      className="text-[8px] font-bold leading-none"
                      style={{ color: selectedLogo === null ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.4)' }}
                    >
                      None
                    </span>
                  </button>

                  {logoFiles.map((file) => (
                    <button
                      key={file}
                      type="button"
                      onClick={() => setSelectedLogo(file)}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg border transition-all"
                      style={{
                        background: selectedLogo === file ? 'rgba(251,191,36,0.08)' : 'transparent',
                        borderColor: selectedLogo === file ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded border overflow-hidden flex items-center justify-center"
                        style={{
                          borderColor: selectedLogo === file ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.1)',
                          background: 'rgba(0,0,0,0.4)',
                        }}
                      >
                        <img
                          src={`/Marketing /LOGOS/${file}`}
                          alt={file}
                          className="max-w-full max-h-full object-contain"
                          draggable={false}
                        />
                      </div>
                      <span
                        className="text-[8px] font-bold leading-none truncate max-w-full"
                        style={{ color: selectedLogo === file ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.4)' }}
                      >
                        {file.replace(/\.[^.]+$/, '')}
                      </span>
                    </button>
                  ))}
                </div>
                {logoFiles.length === 0 && (
                  <p className="text-[10px] text-white/25 mt-1">
                    No logos found. Add images to <span className="font-mono text-white/35">public/Marketing/LOGOS/</span>
                  </p>
                )}
              </div>

              {/* Opacity slider */}
              {selectedLogo && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-white/40">Opacity</span>
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: 'rgba(251,191,36,0.8)' }}>
                      {Math.round(opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(opacity * 100)}
                    onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, rgba(251,191,36,0.6) 0%, rgba(251,191,36,0.6) ${opacity * 100}%, rgba(255,255,255,0.08) ${opacity * 100}%, rgba(255,255,255,0.08) 100%)`,
                    }}
                  />
                </div>
              )}

              {/* Save button */}
              {logoChanged && (
                <button
                  type="button"
                  onClick={handleSaveLogo}
                  disabled={saving}
                  className="w-full py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wide transition-all"
                  style={{
                    background: 'rgba(251,191,36,0.12)',
                    borderColor: 'rgba(251,191,36,0.35)',
                    color: 'rgba(251,191,36,0.95)',
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Apply Logo'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
