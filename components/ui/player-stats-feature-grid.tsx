import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

const FEATURE_PANEL_STYLE = {
  background:
    "linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))",
  boxShadow:
    "inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)",
  border: "1px inset rgba(60, 60, 60, 0.5)",
}

export interface PlayerStatsFeatureItem {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  valueClassName?: string
}

interface PlayerStatsFeatureGridProps {
  items: PlayerStatsFeatureItem[]
  className?: string
}

/** First index of the last row for a fixed column count (0-based grid). */
function lastRowStartIndex(itemCount: number, cols: number): number {
  if (itemCount <= 0 || cols <= 0) return 0
  return Math.floor((itemCount - 1) / cols) * cols
}

export function PlayerStatsFeatureGrid({ items, className }: PlayerStatsFeatureGridProps) {
  const n = items.length
  const mdLast = lastRowStartIndex(n, 2)
  const lgLast = lastRowStartIndex(n, 3)

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 relative z-10", className)}>
      {items.map((item, index) => (
        <div
          key={item.title}
          className={cn(
            "flex flex-col py-6 relative group/feature",
            "border-white/10",
            index < n - 1 && "border-b",
            index < mdLast ? "md:border-b" : "md:border-b-0",
            index < lgLast ? "lg:border-b" : "lg:border-b-0",
            index % 2 === 0 && "md:border-l",
            index % 3 === 0 && "lg:border-l",
            "lg:border-r",
          )}
          style={FEATURE_PANEL_STYLE}
        >
          <div className="absolute inset-0 opacity-0 group-hover/feature:opacity-100 transition duration-200 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]" />

          <div className="mb-3 relative z-10 px-6 text-neutral-500 group-hover/feature:text-cyan-300 transition-colors">
            <item.icon className="h-4 w-4" />
          </div>

          <div className="text-sm font-semibold mb-2 relative z-10 px-6">
            <div className="absolute left-0 inset-y-0 h-5 group-hover/feature:h-6 w-1 rounded-tr-full rounded-br-full bg-neutral-700 group-hover/feature:bg-cyan-400 transition-all duration-200 origin-center" />
            <span className="group-hover/feature:translate-x-1 transition duration-200 inline-block text-neutral-300">
              {item.title}
            </span>
          </div>

          <div className="px-6 relative z-10">
            <div className={cn("text-xl font-bold text-neutral-100", item.valueClassName)}>{item.value}</div>
            {item.subtitle && <p className="text-xs text-neutral-400 mt-1">{item.subtitle}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
