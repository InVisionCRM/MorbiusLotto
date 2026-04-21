'use client';

import React from 'react';
import { Theme } from '@/lib/theme';

export interface ConfirmActionRow {
  label: string;
  value: React.ReactNode;
  /** highlight color — defaults to white */
  accent?: 'cyan' | 'yellow' | 'green' | 'white';
}

interface ConfirmActionCardProps {
  title: string;
  subtitle?: string;
  rows: ConfirmActionRow[];
  onBack: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  /** Optional warning shown above buttons (e.g. "Insufficient balance") */
  warning?: string;
}

const ACCENT_CLASS: Record<string, string> = {
  cyan: 'text-cyan-300',
  yellow: 'text-yellow-300',
  green: 'text-emerald-300',
  white: 'text-white',
};

export function ConfirmActionCard({
  title,
  subtitle,
  rows,
  onBack,
  onConfirm,
  confirmLabel = 'Confirm',
  isLoading = false,
  disabled = false,
  warning,
}: ConfirmActionCardProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onBack} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl"
        style={Theme.panel.base}
      >
        {/* Header */}
        <div className={`px-5 py-4 ${Theme.modal.header}`}>
          <h2 className="text-lg font-bold text-white text-center">{title}</h2>
          {subtitle && (
            <p className="text-cyan-100/80 text-xs text-center mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Detail rows */}
        <div className="px-5 py-4 space-y-0 divide-y divide-white/8">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-2.5">
              <span className="text-gray-400 text-sm shrink-0">{row.label}</span>
              <span className={`text-sm font-semibold text-right ${ACCENT_CLASS[row.accent ?? 'white']}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Warning */}
        {warning && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-yellow-900/30 border border-yellow-500/30 text-yellow-300 text-xs">
            {warning}
          </div>
        )}

        {/* Buttons */}
        <div className="px-5 pb-5 pt-1 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Go Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled || isLoading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              disabled || isLoading
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : `${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white`
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing…
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
