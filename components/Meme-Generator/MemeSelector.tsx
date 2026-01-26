import React from 'react';
import { MemeTemplate } from '../types';

interface MemeSelectorProps {
  templates: MemeTemplate[];
  selectedId: string;
  onSelect: (template: MemeTemplate) => void;
}

export const MemeSelector: React.FC<MemeSelectorProps> = ({ templates, selectedId, onSelect }) => {
  return (
    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 h-[500px] overflow-y-auto custom-scrollbar">
      <h3 className="text-lg font-bold mb-4 text-white sticky top-0 bg-slate-800 pb-2 border-b border-slate-700 z-10">
        Choose Template
      </h3>
      <div className="grid grid-cols-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
        {templates.map((meme) => (
          <button
            key={meme.id}
            onClick={() => onSelect(meme)}
            className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
              selectedId === meme.id
                ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                : 'border-transparent hover:border-slate-500'
            }`}
          >
            <img
              src={meme.url}
              alt={meme.name}
              className="w-full h-full object-cover transition-transform group-hover:scale-110"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1 text-xs text-center truncate text-white opacity-0 group-hover:opacity-100 transition-opacity">
              {meme.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
