'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GameHowTo } from '@/components/shared/GameHowTo'
import { PlinkoScene } from '@/components/home2/scenes'

interface HowToPlayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function HowToPlayModal({ open, onOpenChange }: HowToPlayModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100000] sm:max-w-[440px] p-0 gap-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0c1521] max-h-[88vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>How to play Plinko</DialogTitle>
        </DialogHeader>
        <GameHowTo
          name="Plinko"
          tagline="Drop the ball, ride the pegs, catch a multiplier."
          accent="#22d3ee"
          art={<PlinkoScene />}
          pills={[
            { label: 'Provably Fair' },
            { label: 'Instant Play' },
            { label: 'Auto-Bet' },
            { label: '3 Risk Levels', muted: true },
            { label: 'VIP Rakeback', muted: true },
          ]}
          steps={[
            { title: 'Set your bet', detail: 'Choose how many MORBIUS to wager.' },
            { title: 'Pick a risk level', detail: 'Low, Medium, or High — higher risk, bigger top multipliers.' },
            { title: 'Drop the ball', detail: 'It bounces through the pegs into a multiplier slot.' },
            { title: 'Get paid instantly', detail: 'Your payout is the bet × the slot it lands in.' },
          ]}
          payouts={{
            heading: 'Top multipliers',
            rows: [
              { label: 'Low', value: 'up to 16×', color: '#34d399' },
              { label: 'Medium', value: 'up to 110×', color: '#fbbf24' },
              { label: 'High', value: 'up to 200×', color: '#f87171' },
            ],
          }}
          notes={[
            { title: 'Provably fair.', body: 'Each drop is decided by a server seed you can verify afterward — no wallet transaction per bet.' },
            { title: 'Edges pay most.', body: 'Every slot is equally likely; the biggest multipliers sit on the edges and are the hardest to reach.' },
            { title: 'Losses earn rakeback.', body: 'A share of net losses comes back as VIP rakeback based on your tier.' },
          ]}
        />
      </DialogContent>
    </Dialog>
  )
}
