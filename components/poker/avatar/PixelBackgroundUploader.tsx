'use client';

import React, { useState, useRef } from 'react';
import { Upload, Trash2 } from 'lucide-react';

export default function PixelBackgroundUploader({
  currentImage,
  onImageChange
}: {
  currentImage?: string;
  onImageChange: (dataUrl: string) => void;
}) {
  const [resolution, setResolution] = useState(32);
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = (src: string, res: number) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = res;
      canvas.height = res;

      const size = Math.min(img.width, img.height);
      const startX = (img.width - size) / 2;
      const startY = (img.height - size) / 2;

      ctx.drawImage(img, startX, startY, size, size, 0, 0, res, res);
      const dataUrl = canvas.toDataURL('image/png');
      setPreview(dataUrl);
      onImageChange(dataUrl);
    };
    img.src = src;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setOriginalSrc(src);
      processImage(src, resolution);
    };
    reader.readAsDataURL(file);
  };

  const handleResolutionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRes = parseInt(e.target.value, 10);
    setResolution(newRes);
    if (originalSrc) {
      processImage(originalSrc, newRes);
    }
  };

  const displayImage = preview ?? currentImage ?? null;

  return (
    <div className="space-y-3">
      {/* Upload zone — shrinks once an image is loaded */}
      <label className={`flex flex-col items-center justify-center w-full border-2 border-zinc-700 border-dashed rounded-xl cursor-pointer bg-zinc-800/50 hover:bg-zinc-700 transition-colors touch-manipulation ${displayImage ? 'py-3 min-h-0' : 'py-6 min-h-[120px]'}`}>
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-zinc-400" />
          <p className="text-sm text-zinc-400">
            {displayImage ? 'Replace image' : <><span className="font-semibold">Tap to upload</span> or drag and drop</>}
          </p>
        </div>
        {!displayImage && <p className="text-xs text-zinc-500 mt-1">PNG, JPG or WEBP</p>}
        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
      </label>

      {displayImage && (
        <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 overflow-hidden">
          {/* Preview */}
          <div className="flex items-center justify-center p-3 bg-zinc-900/60">
            <img
              src={displayImage}
              alt="Background preview"
              className="w-32 h-32 rounded-lg object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* Controls */}
          <div className="px-4 pb-4 pt-3 space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-zinc-300">
                Pixelation — <span className="text-zinc-400 font-mono text-xs">{resolution}px</span>
              </label>
              <button
                onClick={() => {
                  setOriginalSrc(null);
                  setPreview(null);
                  onImageChange('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-red-400 hover:text-red-300 p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-red-400/10 transition-colors touch-manipulation"
                title="Remove background"
                aria-label="Remove background"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              type="range"
              min="12"
              max="128"
              step="4"
              value={resolution}
              onChange={handleResolutionChange}
              disabled={!originalSrc}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50"
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Chunky (8-bit)</span>
              <span>Smooth (HD)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
