'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const BLACKJACK_HOW_TO_VIDEO_URL =
  'https://ivaqyn53qos0zxu5.public.blob.vercel-storage.com/How-To-Video/how_to_play_blackjack.mp4';

interface BlackjackHowToVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BlackjackHowToVideoModal({ open, onOpenChange }: BlackjackHowToVideoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[100000] sm:max-w-[820px] bg-black border-2 border-cyan-400/60 p-0 overflow-hidden"
        style={{
          boxShadow: '0 0 30px rgba(34, 211, 238, 0.35), inset 0 0 20px rgba(34, 211, 238, 0.08)',
        }}
      >
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-2xl font-black text-center tracking-wider text-cyan-300">
            HOW TO PLAY BLACKJACK
          </DialogTitle>
        </DialogHeader>
        <div className="px-3 pb-3">
          <div className="rounded-lg overflow-hidden border border-white/10 bg-black">
            <video
              key={open ? 'open' : 'closed'}
              src={BLACKJACK_HOW_TO_VIDEO_URL}
              controls
              autoPlay={open}
              playsInline
              className="w-full"
              preload="metadata"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
