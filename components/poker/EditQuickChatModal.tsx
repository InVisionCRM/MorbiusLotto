'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';
import {
  DEFAULT_QUICKCHAT_PHRASES,
  QUICKCHAT_PHRASES_BY_CATEGORY,
} from '@/components/poker/quickchat-phrases';

const MAX_PHRASES = 25;

export interface EditQuickChatModalProps {
  open: boolean;
  onClose: () => void;
  selectedPhrases: string[];
  onSave: (phrases: string[]) => void;
}

const panelStyle = {
  background: 'rgba(10,10,10,0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
};

export function EditQuickChatModal({
  open,
  onClose,
  selectedPhrases,
  onSave,
}: EditQuickChatModalProps) {
  const [draft, setDraft] = useState<string[]>(selectedPhrases);

  useEffect(() => {
    if (open) setDraft([...selectedPhrases]);
  }, [open, selectedPhrases]);

  const addPhrase = useCallback((phrase: string) => {
    setDraft((prev) => {
      if (prev.includes(phrase) || prev.length >= MAX_PHRASES) return prev;
      return [...prev, phrase];
    });
  }, []);

  const removePhrase = useCallback((phrase: string) => {
    setDraft((prev) => prev.filter((p) => p !== phrase));
  }, []);

  const resetToDefault = useCallback(() => {
    setDraft([...DEFAULT_QUICKCHAT_PHRASES]);
  }, []);

  const handleSave = useCallback(() => {
    onSave(draft);
    onClose();
  }, [draft, onSave, onClose]);

  if (!open) return null;

  const content = (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-quickchat-title"
          className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl"
          style={panelStyle}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2
              id="edit-quickchat-title"
              className="font-grandstander text-lg font-semibold"
              style={{ color: 'var(--poker-text)' }}
            >
              Edit QuickChat
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" style={{ color: 'var(--poker-text)' }} />
            </button>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 min-h-0 overflow-hidden">
            {/* Your phrases */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">
                  Your phrases ({draft.length}/{MAX_PHRASES})
                </span>
                {draft.length >= MAX_PHRASES && (
                  <span className="text-xs text-amber-400">Max reached</span>
                )}
              </div>
              <ul
                className="flex-1 overflow-y-auto rounded-lg border border-white/10 p-2 space-y-1 min-h-[120px]"
                style={{ background: 'rgba(0,0,0,0.4)' }}
              >
                {draft.length === 0 ? (
                  <li className="text-sm text-slate-500 py-2 text-center">
                    No phrases. Add from the list.
                  </li>
                ) : (
                  draft.map((phrase) => (
                    <li
                      key={phrase}
                      className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-white/5 group"
                    >
                      <span className="font-grandstander text-sm truncate flex-1" style={{ color: 'var(--poker-text)' }}>
                        {phrase}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhrase(phrase)}
                        className="p-1 rounded opacity-70 hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-colors"
                        aria-label={`Remove ${phrase}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* All phrases by category */}
            <div className="flex flex-col min-h-0">
              <span className="text-sm font-medium text-slate-300 mb-2">Add from list</span>
              <div
                className="flex-1 overflow-y-auto rounded-lg border border-white/10 p-2 space-y-3 min-h-[120px]"
                style={{ background: 'rgba(0,0,0,0.4)' }}
              >
                {Object.entries(QUICKCHAT_PHRASES_BY_CATEGORY).map(([category, phrases]) => (
                  <div key={category}>
                    <div className="text-xs font-medium text-cyan-400/90 mb-1 sticky top-0 bg-slate-900/95 py-0.5">
                      {category}
                    </div>
                    <ul className="space-y-0.5">
                      {phrases.map((phrase) => {
                        const inDraft = draft.includes(phrase);
                        const atMax = draft.length >= MAX_PHRASES;
                        const canAdd = !inDraft && !atMax;
                        return (
                          <li
                            key={phrase}
                            className="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-white/5"
                          >
                            <span className="font-grandstander text-sm truncate flex-1" style={{ color: 'var(--poker-text)' }}>
                              {phrase}
                            </span>
                            <button
                              type="button"
                              onClick={() => canAdd && addPhrase(phrase)}
                              disabled={!canAdd}
                              className="p-1 rounded opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyan-500/20 text-cyan-400 transition-colors"
                              aria-label={inDraft ? 'Already added' : `Add ${phrase}`}
                              title={inDraft ? 'Already added' : atMax ? 'Max phrases reached' : 'Add'}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10">
            <button
              type="button"
              onClick={resetToDefault}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
              style={{ color: 'var(--poker-text)' }}
            >
              <RotateCcw className="w-4 h-4" />
              Reset to default
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
                style={{ color: 'var(--poker-text)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : null;
}
