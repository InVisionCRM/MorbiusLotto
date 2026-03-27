import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Rotating Morbius chip for loading states — viewport bottom quarter, centered, clockwise spin. */
export function MorbiusLoadingChip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-[25%] left-1/2 z-[100] -translate-x-1/2',
        className
      )}
      aria-hidden
    >
      <Image
        src="/morbius/MorbiusChip.png"
        alt=""
        width={160}
        height={160}
        className="h-40 w-40 opacity-50 animate-[spin_4s_linear_infinite]"
        sizes="160px"
        priority
      />
    </div>
  )
}
