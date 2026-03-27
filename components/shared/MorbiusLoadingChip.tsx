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
        width={44}
        height={44}
        className="h-11 w-11 animate-spin opacity-80"
        sizes="44px"
        priority
      />
    </div>
  )
}
