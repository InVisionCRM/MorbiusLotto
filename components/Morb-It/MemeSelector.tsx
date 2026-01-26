'use client';

import React from 'react';
import { MemeTemplate } from '@/app/Morb-It/types';

interface MemeSelectorProps {
  templates: MemeTemplate[];
  selectedId: string;
  onSelect: (template: MemeTemplate) => void;
}

export const MemeSelector: React.FC<MemeSelectorProps> = ({ templates, selectedId, onSelect }) => {
  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
      }}
    >
      <h2 className="text-lg font-bold mb-4 text-cyan-300">Choose Template</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className={`relative aspect-square rounded-lg overflow-hidden transition-all hover:scale-105 ${
              selectedId === template.id
                ? 'ring-2 ring-cyan-400'
                : ''
            }`}
            style={{
              border: selectedId === template.id
                ? '2px solid rgba(6, 182, 212, 0.8)'
                : '2px solid rgba(60, 60, 60, 0.5)',
              boxShadow: selectedId === template.id
                ? '0 0 12px rgba(6, 182, 212, 0.4)'
                : 'none',
            }}
          >
            <img
              src={template.url}
              alt={template.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
              <span className="absolute bottom-1 left-1 right-1 text-[10px] text-cyan-300 text-center truncate">
                {template.name}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
