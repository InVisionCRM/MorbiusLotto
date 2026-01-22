'use client'

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ContactModal({ open, onOpenChange }: ContactModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[400px] p-0"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-cyan-300 text-lg font-bold text-center">
            Contact Us
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6">
          <p className="text-white/70 text-sm text-center mb-6">
            Get in touch with us through our social channels
          </p>

          <div className="space-y-4">
            {/* Twitter */}
            <a
              href="https://x.com/Morbius_io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 rounded-lg transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.6), rgba(40, 40, 40, 0.4))',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5), inset 0 -2px 4px rgba(255, 255, 255, 0.05)',
                border: '1px inset rgba(60, 60, 60, 0.3)',
              }}
            >
              <div className="w-10 h-10 flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-cyan-300 font-semibold text-sm">Twitter</div>
                <div className="text-white/60 text-xs">@Morbius_io</div>
              </div>
              <div className="text-cyan-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>

            {/* Telegram */}
            <a
              href="https://t.me/Morbius_cash"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 rounded-lg transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.6), rgba(40, 40, 40, 0.4))',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5), inset 0 -2px 4px rgba(255, 255, 255, 0.05)',
                border: '1px inset rgba(60, 60, 60, 0.3)',
              }}
            >
              <div className="w-10 h-10 flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-cyan-300 font-semibold text-sm">Telegram</div>
                <div className="text-white/60 text-xs">Morbius_cash</div>
              </div>
              <div className="text-cyan-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          </div>

          <div className="mt-6 text-center">
            <p className="text-white/50 text-xs">
              We respond to messages within 24 hours
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}