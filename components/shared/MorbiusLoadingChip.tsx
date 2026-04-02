import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Rotating Morbius chip for loading states — lower viewport, centered, clockwise spin. */
export function MorbiusLoadingChip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-12 left-1/2 z-0 -translate-x-1/2',
        className
      )}
      aria-hidden
    >
      <Image
        src="/morbius/MorbiusChip.png"
        alt=""
        width={160}
        height={160}
        className="h-40 w-40 opacity-50 animate-[spin_8s_linear_infinite]"
        sizes="160px"
        priority
      />
    </div>
  )
}
