'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { IconDownload, IconPhoto, IconCopy } from '@tabler/icons-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import {
  type ShareOverlayId,
  SHARE_OVERLAY_OPTIONS,
  renderShareOverlay,
} from '@/components/poker/tournament/share-overlay-presets';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg';

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

/**
 * Download PNG after async canvas work. Prefer data URL (no blob lifecycle); blob + delayed revoke as fallback.
 * Deferred click helps Safari / strict download policies after await in the handler.
 */
function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const tryDataUrl = (): boolean => {
    try {
      const dataUrl = canvas.toDataURL('image/png', 0.92);
      if (!dataUrl || dataUrl === 'data:,') return false;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.setAttribute('rel', 'noopener noreferrer');
      a.style.display = 'none';
      document.body.appendChild(a);
      window.setTimeout(() => {
        a.click();
        window.setTimeout(() => {
          if (a.parentNode) document.body.removeChild(a);
        }, 0);
      }, 0);
      return true;
    } catch {
      return false;
    }
  };

  if (tryDataUrl()) return;

  void canvasToBlob(canvas).then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.setAttribute('rel', 'noopener noreferrer');
    a.style.display = 'none';
    document.body.appendChild(a);
    window.setTimeout(() => {
      a.click();
      window.setTimeout(() => {
        if (a.parentNode) document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 0);
    }, 0);
  });
}

export type PokerTournamentSharePanelProps = {
  tournamentName: string;
  isFreeroll: boolean;
  /** Shown on overlays (e.g. site + chain). */
  siteLine?: string;
  scheduleLine: string;
  prizeLine: string;
  payoutLine: string;
};

export function PokerTournamentSharePanel({
  tournamentName,
  isFreeroll,
  siteLine = 'Morbius.io · PulseChain',
  scheduleLine,
  prizeLine,
  payoutLine,
}: PokerTournamentSharePanelProps) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [overlayStyle, setOverlayStyle] = useState<ShareOverlayId>('neonHero');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const groupId = useId();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const fundingLabel = isFreeroll ? 'Freeroll' : 'Buy-in';

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileError(null);
    if (!f) return;
    if (!ACCEPT.split(',').some((t) => f.type === t.trim())) {
      setFileError('Use PNG or JPEG.');
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setFileError('Image must be 8 MB or smaller.');
      return;
    }
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const clearImage = () => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFileError(null);
  };

  const runExportCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const el = shareCardRef.current;
    if (!el) return null;
    try {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {
      /* ignore */
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#0c1222',
      logging: false,
      foreignObjectRendering: false,
      scrollX: 0,
      scrollY: -window.scrollY,
    });
    return canvas;
  }, []);

  const blobFromCanvas = useCallback(async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
    let blob = await canvasToBlob(canvas);
    if (blob) return blob;
    try {
      const dataUrl = canvas.toDataURL('image/png', 0.92);
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      return null;
    }
  }, []);

  const onDownload = async () => {
    setStatusMsg(null);
    setExporting(true);
    try {
      const canvas = await runExportCanvas();
      if (!canvas) {
        setStatusMsg('Could not create image.');
        return;
      }
      const filename = `poker-tournament-share-${Date.now()}.png`;
      downloadCanvasAsPng(canvas, filename);
      setStatusMsg('Download started. Check your downloads folder.');
    } catch (err) {
      console.error('[PokerTournamentSharePanel] export failed', err);
      setStatusMsg('Export failed. Try another browser or image.');
    } finally {
      setExporting(false);
    }
  };

  const onCopyImage = async () => {
    setStatusMsg(null);
    setExporting(true);
    try {
      const canvas = await runExportCanvas();
      if (!canvas) {
        setStatusMsg('Could not create image.');
        return;
      }
      const blob = await blobFromCanvas(canvas);
      if (!blob) {
        setStatusMsg('Could not create image.');
        return;
      }
      if (!navigator.clipboard?.write) {
        setStatusMsg('Clipboard not supported here — use Download.');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatusMsg('Image copied to clipboard.');
    } catch {
      setStatusMsg('Copy failed — use Download.');
    } finally {
      setExporting(false);
    }
  };

  const overlayProps = {
    tournamentName: tournamentName.trim() || 'My tournament',
    fundingLabel,
    siteLine,
    scheduleLine,
    prizeLine,
    payoutLine,
  };

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-white/70 leading-relaxed">
        Upload a background image, pick an overlay style, then download or copy a PNG for social posts.
      </p>

      <div className="space-y-2">
        <Label className="text-sm font-semibold text-white/90">Overlay style</Label>
        <RadioGroup
          value={overlayStyle}
          onValueChange={(v) => setOverlayStyle(v as ShareOverlayId)}
          className="grid gap-3 sm:grid-cols-2"
          aria-label="Overlay style for share image"
        >
          {SHARE_OVERLAY_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              htmlFor={`${groupId}-${opt.id}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-500/20 bg-black/25 p-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)] transition-colors hover:border-cyan-500/35',
                overlayStyle === opt.id && 'border-cyan-500/45 bg-cyan-500/[0.08]',
              )}
            >
              <RadioGroupItem
                value={opt.id}
                id={`${groupId}-${opt.id}`}
                className="mt-0.5 border-cyan-500/50 text-cyan-400 focus-visible:ring-cyan-500/45"
              />
              <span className="min-w-0">
                <span className="block font-jost text-sm font-semibold text-white/95">{opt.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/55">{opt.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold text-white/90">Background image</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-600/25 to-blue-600/20 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:from-cyan-600/35 hover:to-blue-600/30"
          >
            <IconPhoto className="h-4 w-4 opacity-90" aria-hidden />
            Choose image
          </button>
          {previewUrl ? (
            <button
              type="button"
              onClick={clearImage}
              className="rounded-lg px-3 py-2 text-sm text-white/60 underline-offset-2 hover:text-white hover:underline"
            >
              Remove
            </button>
          ) : null}
        </div>
        {fileError ? <p className="text-[11px] text-amber-200/90">{fileError}</p> : null}
      </div>

      <div className="space-y-2">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-white/50">Preview</p>
        <div className="flex justify-center overflow-x-auto pb-1">
          <div
            ref={shareCardRef}
            className="relative aspect-[1200/630] w-full max-w-[600px] shrink-0 overflow-hidden rounded-xl"
            style={{
              background: 'linear-gradient(145deg, #0f172a 0%, #0c1524 45%, #0f172a 100%)',
              border: '1px solid rgba(6, 182, 212, 0.28)',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.45)',
            }}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.75))',
                }}
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.06), transparent 65%)',
              }}
              aria-hidden
            />
            {renderShareOverlay(overlayStyle, overlayProps)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={exporting}
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/35 bg-gradient-to-r from-cyan-600/30 to-blue-600/25 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:from-cyan-600/40 hover:to-blue-600/35 disabled:opacity-50"
        >
          {exporting ? (
            'Working…'
          ) : (
            <>
              <IconDownload className="h-4 w-4" aria-hidden />
              Download PNG
            </>
          )}
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={onCopyImage}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <IconCopy className="h-4 w-4" aria-hidden />
          Copy image
        </button>
      </div>
      {statusMsg ? <p className="text-center text-[11px] text-cyan-200/85">{statusMsg}</p> : null}
    </div>
  );
}
