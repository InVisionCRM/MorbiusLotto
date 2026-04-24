'use client'

import { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { generateHexClientSeed } from '@/lib/generate-client-seed'

const MAX_LEN = 255

export type ProvablyFairClientSeedModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onChange: (next: string) => void
}

export function ProvablyFairClientSeedModal({
  open,
  onOpenChange,
  value,
  onChange,
}: ProvablyFairClientSeedModalProps) {
  const onRandom = useCallback(() => {
    const next = generateHexClientSeed()
    if (next) onChange(next)
  }, [onChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-white">
            Provably fair
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-1">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, MAX_LEN))}
            maxLength={MAX_LEN}
            rows={3}
            spellCheck={false}
            className="w-full resize-none rounded-lg border border-cyan-500/25 bg-black/40 px-3 py-2 font-mono text-xs text-cyan-100 placeholder:text-white/30 focus:border-cyan-500/50 focus:outline-none focus:ring-0"
            aria-label="Client seed"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-cyan-500/40 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/50 hover:text-white"
              onClick={onRandom}
            >
              Random
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
