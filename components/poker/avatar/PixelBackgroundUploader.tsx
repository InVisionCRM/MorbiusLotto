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
      onImageChange(canvas.toDataURL('image/png'));
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center w-full">
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-zinc-700 border-dashed rounded-xl cursor-pointer bg-zinc-800/50 hover:bg-zinc-700 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-8 h-8 mb-3 text-zinc-400" />
            <p className="mb-2 text-sm text-zinc-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
            <p className="text-xs text-zinc-500">PNG, JPG or WEBP</p>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </label>
      </div>

      {(originalSrc || currentImage) && (
        <div className="space-y-4 bg-zinc-800/30 p-4 rounded-xl border border-zinc-700/50">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-zinc-300">Pixelation Level</label>
            <button
              onClick={() => {
                setOriginalSrc(null);
                onImageChange('');
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors"
              title="Remove background"
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
      )}
    </div>
  );
}
