'use client';

import React from 'react';
import { TextLayer } from '@/app/Morb-It/types';

interface LayerEditorProps {
  index: number;
  layer: TextLayer;
  onChange: (layer: TextLayer) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  isSelected: boolean;
}

export const LayerEditor: React.FC<LayerEditorProps> = ({
  index,
  layer,
  onChange,
  onDelete,
  onSelect,
  isSelected,
}) => {
  return (
    <div
      onClick={() => onSelect(layer.id)}
      className={`mb-3 p-3 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10'
          : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-300">
          Layer {index + 1}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(layer.id);
          }}
          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/20 transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="space-y-3">
        {/* Text Input */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Text</label>
          <input
            type="text"
            value={layer.text}
            onChange={(e) =>
              onChange({
                ...layer,
                text: layer.isUppercase ? e.target.value.toUpperCase() : e.target.value,
              })
            }
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Size Slider */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">
            Size: {Math.round(layer.size)}
          </label>
          <input
            type="range"
            min="10"
            max="150"
            value={layer.size}
            onChange={(e) => onChange({ ...layer, size: Number(e.target.value) })}
            onClick={(e) => e.stopPropagation()}
            className="w-full accent-indigo-500"
          />
        </div>

        {/* Rotation */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">
            Rotation: {Math.round(layer.rotation)}°
          </label>
          <input
            type="range"
            min="-180"
            max="180"
            value={layer.rotation}
            onChange={(e) => onChange({ ...layer, rotation: Number(e.target.value) })}
            onClick={(e) => e.stopPropagation()}
            className="w-full accent-indigo-500"
          />
        </div>

        {/* Colors */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-slate-400 mb-1 block">Fill</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={layer.color}
                onChange={(e) => onChange({ ...layer, color: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-slate-600"
              />
              <span className="text-xs text-slate-500 font-mono">{layer.color}</span>
            </div>
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-400 mb-1 block">Stroke</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={layer.strokeColor}
                onChange={(e) => onChange({ ...layer, strokeColor: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-slate-600"
              />
              <span className="text-xs text-slate-500 font-mono">{layer.strokeColor}</span>
            </div>
          </div>
        </div>

        {/* Uppercase Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`uppercase-${layer.id}`}
            checked={layer.isUppercase}
            onChange={(e) => onChange({ ...layer, isUppercase: e.target.checked })}
            onClick={(e) => e.stopPropagation()}
            className="accent-indigo-500"
          />
          <label
            htmlFor={`uppercase-${layer.id}`}
            className="text-xs text-slate-400 cursor-pointer"
          >
            UPPERCASE
          </label>
        </div>
      </div>
    </div>
  );
};
