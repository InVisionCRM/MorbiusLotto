import { type ComponentPropsWithoutRef, type ReactNode } from "react"
import { ArrowRightIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  className?: string
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string
  className: string
  background: ReactNode
  Icon: React.ElementType
  description: string
  href: string
  cta: string
}

/** Embossed glass panel — matches home tokenomics / Plinko grey surfaces */
const BENTO_CARD_SURFACE = cn(
  "border border-white/[0.08] bg-black/35 shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
  "backdrop-blur-xl backdrop-saturate-150",
  "[background:linear-gradient(155deg,rgba(18,22,28,0.72),rgba(28,32,40,0.45))]",
  "dark:border-white/[0.1] dark:bg-black/40",
  "dark:[box-shadow:inset_0_2px_6px_rgba(0,0,0,0.55),inset_0_-2px_5px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.4)]"
)

const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[minmax(20rem,22rem)] grid-cols-3 gap-4 md:auto-rows-[22rem]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta,
  ...props
}: BentoCardProps) => (
  <div
    className={cn(
      "group relative col-span-3 flex min-h-0 flex-col overflow-hidden rounded-2xl",
      "transform-gpu",
      BENTO_CARD_SURFACE,
      className
    )}
    {...props}
  >
    <div className="pointer-events-none absolute inset-0 overflow-hidden">{background}</div>

    <div className="relative z-10 mt-auto p-5 pt-8">
      <div className="pointer-events-none flex transform-gpu flex-col gap-1.5 transition-all duration-300 lg:group-hover:-translate-y-10">
        <Icon className="h-10 w-10 origin-left text-white/55 transition-all duration-300 ease-in-out group-hover:scale-90 [&_svg]:stroke-[1.25]" />
        <h3 className="text-lg font-semibold tracking-tight text-white/95 md:text-xl">{name}</h3>
        <p className="max-w-lg text-sm leading-relaxed text-white/50">{description}</p>
      </div>

      <div
        className={cn(
          "pointer-events-none flex w-full translate-y-0 transform-gpu flex-row items-center pt-2 transition-all duration-300 group-hover:opacity-100 lg:hidden"
        )}
      >
        <Button variant="link" asChild size="sm" className="pointer-events-auto h-auto p-0 text-cyan-400 hover:text-cyan-300">
          <a href={href}>
            {cta}
            <ArrowRightIcon className="ms-2 h-4 w-4 rtl:rotate-180" />
          </a>
        </Button>
      </div>
    </div>

    <div
      className={cn(
        "pointer-events-none absolute bottom-0 z-10 hidden w-full translate-y-10 transform-gpu flex-row items-center p-5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 lg:flex"
      )}
    >
      <Button variant="link" asChild size="sm" className="pointer-events-auto h-auto p-0 text-cyan-400 hover:text-cyan-300">
        <a href={href}>
          {cta}
          <ArrowRightIcon className="ms-2 h-4 w-4 rtl:rotate-180" />
        </a>
      </Button>
    </div>

    <div className="pointer-events-none absolute inset-0 z-[1] rounded-2xl transition-all duration-300 group-hover:bg-white/[0.04]" />
  </div>
)

export { BentoCard, BentoGrid }
