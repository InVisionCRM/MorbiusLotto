'use client';

/**
 * Theme Studio — a live editor for the colour knobs in `app/theme-tokens.css`.
 *
 * Open it on any real screen (not a mockup) and every slider repaints the page
 * underneath immediately, because the whole app's colour utilities resolve
 * through those knobs.
 *
 * The panel is deliberately styled with fixed inline colours rather than
 * Tailwind classes: it is editing the palette that Tailwind classes resolve
 * through, so using them here would make the editor re-colour itself and
 * become unreadable exactly when you push a knob to an extreme.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUILT_IN_PRESETS,
  THEME_FAMILY_GROUPS,
  THEME_KNOBS,
  THEME_STORAGE_KEY,
  applyTheme,
  decodeTheme,
  encodeTheme,
  pruneAdjustments,
  toCss,
  type ThemeAdjustments,
  type ThemeKnobKey,
} from '@/lib/casino-theme';

/** Fixed chrome palette, independent of the theme being edited. */
const UI = {
  panel: '#0b0f14',
  panelBorder: '#1f2933',
  raised: '#131a22',
  text: '#e6edf3',
  textDim: '#8b98a5',
  accent: '#4493f8',
  accentText: '#ffffff',
} as const;

function swatchGradient(family: string): string {
  const stops = [200, 400, 500, 700, 900]
    .map((shade) => `var(--ct-${family}-${shade})`)
    .join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

export default function ThemeStudio() {
  const [open, setOpen] = useState(false);
  const [adjustments, setAdjustments] = useState<ThemeAdjustments>({});
  const [activeGroup, setActiveGroup] = useState<string>(THEME_FAMILY_GROUPS[0].label);
  const [copied, setCopied] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore from the URL first (shared links win), then localStorage.
  useEffect(() => {
    let initial: ThemeAdjustments = {};
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('theme');
      if (fromUrl) {
        initial = decodeTheme(fromUrl);
      } else {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored) initial = pruneAdjustments(JSON.parse(stored) as ThemeAdjustments);
      }
    } catch {
      // Corrupt or unavailable storage just means we start from the default look.
    }
    setAdjustments(initial);
    applyTheme(initial);
    setHydrated(true);
  }, []);

  // Persist and repaint on every change.
  useEffect(() => {
    if (!hydrated) return;
    applyTheme(adjustments);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(pruneAdjustments(adjustments)));
    } catch {
      // Non-fatal: the look still applies for this session.
    }
  }, [adjustments, hydrated]);

  // Ctrl/Cmd + Shift + T toggles the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setKnob = useCallback((family: string, knob: ThemeKnobKey, value: number) => {
    setAdjustments((prev) => ({ ...prev, [`${family}.${knob}`]: value }));
  }, []);

  const resetFamily = useCallback((family: string) => {
    setAdjustments((prev) => {
      const next = { ...prev };
      for (const { key } of THEME_KNOBS) delete next[`${family}.${key}`];
      return next;
    });
  }, []);

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied('clipboard blocked');
      window.setTimeout(() => setCopied(null), 1600);
    }
  }, []);

  const changedCount = useMemo(
    () => Object.keys(pruneAdjustments(adjustments)).length,
    [adjustments]
  );
  const group = THEME_FAMILY_GROUPS.find((g) => g.label === activeGroup) ?? THEME_FAMILY_GROUPS[0];

  if (!hydrated) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Theme Studio (Ctrl/Cmd + Shift + T)"
        style={{
          position: 'fixed', bottom: 16, left: 16, zIndex: 2147483000,
          width: 40, height: 40, borderRadius: 10, cursor: 'pointer',
          background: UI.panel, border: `1px solid ${UI.panelBorder}`,
          color: UI.text, fontSize: 17, lineHeight: 1,
          boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
        }}
      >
        ◐
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: 16, left: 16, zIndex: 2147483000,
        width: 372, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
        background: UI.panel, border: `1px solid ${UI.panelBorder}`, borderRadius: 12,
        color: UI.text, fontSize: 12,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderBottom: `1px solid ${UI.panelBorder}`,
        }}
      >
        <strong style={{ fontSize: 13 }}>Theme Studio</strong>
        <span style={{ color: UI.textDim }}>
          {changedCount ? `${changedCount} change${changedCount === 1 ? '' : 's'}` : 'default'}
        </span>
        <button
          type="button"
          onClick={() => setAdjustments({})}
          style={{
            marginLeft: 'auto', background: 'transparent', border: `1px solid ${UI.panelBorder}`,
            color: UI.textDim, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11,
          }}
        >
          Reset all
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close Theme Studio"
          style={{
            background: 'transparent', border: 'none', color: UI.textDim,
            cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>

      {/* Presets */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${UI.panelBorder}` }}>
        <div style={{ color: UI.textDim, marginBottom: 6 }}>Starting points</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BUILT_IN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => setAdjustments({ ...preset.adjustments })}
              style={{
                background: UI.raised, border: `1px solid ${UI.panelBorder}`, color: UI.text,
                borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 11,
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Group tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0' }}>
        {THEME_FAMILY_GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            onClick={() => setActiveGroup(g.label)}
            style={{
              flex: 1, cursor: 'pointer', borderRadius: 6, padding: '5px 6px', fontSize: 11,
              background: g.label === activeGroup ? UI.accent : 'transparent',
              color: g.label === activeGroup ? UI.accentText : UI.textDim,
              border: `1px solid ${g.label === activeGroup ? UI.accent : UI.panelBorder}`,
            }}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div style={{ color: UI.textDim, padding: '6px 12px 0', fontSize: 11 }}>{group.hint}</div>

      {/* Sliders */}
      <div style={{ overflowY: 'auto', padding: '8px 12px 12px' }}>
        {group.families.map((family) => (
          <div key={family} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{family}</span>
              <span
                aria-hidden
                style={{
                  flex: 1, height: 10, borderRadius: 3,
                  background: swatchGradient(family),
                  border: `1px solid ${UI.panelBorder}`,
                }}
              />
              <button
                type="button"
                onClick={() => resetFamily(family)}
                style={{
                  background: 'transparent', border: 'none', color: UI.textDim,
                  cursor: 'pointer', fontSize: 11, padding: 0,
                }}
              >
                reset
              </button>
            </div>

            {THEME_KNOBS.map((knob) => {
              const id = `${family}.${knob.key}`;
              const value = adjustments[id] ?? knob.def;
              const dirty = value !== knob.def;
              return (
                <div key={knob.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label
                    htmlFor={id}
                    style={{ width: 58, color: dirty ? UI.text : UI.textDim, fontSize: 11 }}
                  >
                    {knob.label}
                  </label>
                  <input
                    id={id}
                    type="range"
                    min={knob.min}
                    max={knob.max}
                    step={knob.step}
                    value={value}
                    onChange={(e) => setKnob(family, knob.key, Number(e.target.value))}
                    style={{ flex: 1, accentColor: UI.accent, height: 16 }}
                  />
                  <span
                    style={{
                      width: 46, textAlign: 'right', fontSize: 10,
                      fontVariantNumeric: 'tabular-nums',
                      color: dirty ? UI.text : UI.textDim,
                    }}
                  >
                    {value}
                    {knob.suffix}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Export */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderTop: `1px solid ${UI.panelBorder}`,
        }}
      >
        <button
          type="button"
          onClick={() => copy('CSS', toCss(adjustments))}
          style={{
            background: UI.raised, border: `1px solid ${UI.panelBorder}`, color: UI.text,
            borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: 11,
          }}
        >
          Copy CSS
        </button>
        <button
          type="button"
          onClick={() =>
            copy(
              'link',
              `${window.location.origin}${window.location.pathname}?theme=${encodeURIComponent(
                encodeTheme(adjustments)
              )}`
            )
          }
          style={{
            background: UI.raised, border: `1px solid ${UI.panelBorder}`, color: UI.text,
            borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: 11,
          }}
        >
          Copy link
        </button>
        <span style={{ color: UI.textDim, fontSize: 11, marginLeft: 'auto' }}>
          {copied ? `${copied} copied` : 'Ctrl/Cmd + Shift + T'}
        </span>
      </div>
    </div>
  );
}
