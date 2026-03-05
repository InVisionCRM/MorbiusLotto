import React from 'react';
import { TextLayer } from '../types';

interface LayerEditorProps {
  layer: TextLayer;
  onChange: (updatedLayer: TextLayer) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  index: number;
  isSelected: boolean;
}

export const LayerEditor: React.FC<LayerEditorProps> = ({ layer, onChange, onDelete, onSelect, index, isSelected }) => {
  const handleChange = (key: keyof TextLayer, value: any) => {
    onChange({ ...layer, [key]: value });
  };

  return (
    <div 
      onClick={() => onSelect(layer.id)}
      className={`p-4 rounded-lg mb-4 border transition-colors cursor-pointer ${
        isSelected 
          ? 'bg-slate-700 border-indigo-500 shadow-md shadow-indigo-900/20' 
          : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <label className={`text-xs font-semibold uppercase tracking-wider ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`}>
          Layer {index + 1} {isSelected && '(Selected)'}
        </label>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(layer.id);
          }}
          className="text-red-400 hover:text-red-300 text-xs hover:"
        >
          Remove
        </button>
      </div>

      <textarea
        value={layer.text}
        onChange={(e) => handleChange('text', e.target.value)}
        className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none mb-3 resize-none h-20 text-sm"
        placeholder="Enter text..."
      />

      <div className="flex justify-end">
        <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input 
                type="checkbox" 
                checked={layer.isUppercase}
                onChange={(e) => handleChange('isUppercase', e.target.checked)}
                className="w-4 h-4 rounded text-indigo-500 bg-slate-800 border-slate-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-bold text-slate-300 group-hover:text-white">ALL CAPS</span>
        </label>
      </div>
    </div>
  );
};