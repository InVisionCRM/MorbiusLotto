import { type ComponentPropsWithoutRef, type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  className?: string
}

interface BentoCardProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  name?: ReactNode
  /** Backward-compatible alias used by some existing callers */
  title?: ReactNode
  className?: string
  background?: ReactNode
  /** Backward-compatible alias used by some existing callers */
  header?: ReactNode
  Icon?: React.ElementType
  description?: ReactNode
  children?: ReactNode
}

/** Embossed glass panel — matches home tokenomics / Plinko grey surfaces */
const BENTO_CARD_SURFACE = cn(
  "border border-white/35 bg-refraction/50",
)

const BENTO_CARD_SURFACE_STYLE = {
  boxShadow:
    "inset 0 -2px 3px rgba(74, 8, 137, 0.85), inset 0 -50px 50px rgba(112, 14, 209, 0.9), inset 0 1px 0 rgba(116, 15, 193, 0.96)), 0 10px 24px rgba(0, 0, 0, 0.51)",
} as const

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
  title,
  className,
  background,
  header,
  Icon,
  description,
  children,
  style,
  ...props
}: BentoCardProps) => {
  const hasCustomChildren = children != null
  const hasMeta = !!(Icon || name || title || description)

  return (
    <div
      className={cn(
        "group relative col-span-3 flex min-h-0 flex-col overflow-hidden rounded-2xl",
        "transform-gpu",
        BENTO_CARD_SURFACE,
        className
      )}
      style={{ ...BENTO_CARD_SURFACE_STYLE, ...style }}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">{background ?? header}</div>

      {hasCustomChildren ? <div className="relative z-10 min-h-0 flex-1">{children}</div> : null}

      {!hasCustomChildren && hasMeta ? (
        <div className="relative z-10 mt-auto p-5 pt-8">
          <div className="pointer-events-none flex transform-gpu flex-col gap-1.5 transition-all duration-300 lg:group-hover:-translate-y-10">
            {Icon ? (
              <Icon className="h-10 w-10 origin-left text-white/55 transition-all duration-300 ease-in-out group-hover:scale-90 [&_svg]:stroke-[1.25]" />
            ) : null}
            {(name ?? title) ? (
              <h3 className="text-lg font-semibold tracking-tight text-white/95 md:text-xl">{name ?? title}</h3>
            ) : null}
            {description ? <p className="max-w-lg text-sm leading-relaxed text-white/50">{description}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-[1] rounded-2xl transition-all duration-300 group-hover:bg-white/[0.04]" />
    </div>
  )
}

const BentoGridItem = BentoCard

export { BentoCard, BentoGrid, BentoGridItem }
