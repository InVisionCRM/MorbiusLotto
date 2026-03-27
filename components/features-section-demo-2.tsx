import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  IconAdjustmentsBolt,
  IconCloud,
  IconCurrencyDollar,
  IconEaseInOut,
  IconHeart,
  IconHelp,
  IconRouteAltLeft,
  IconTerminal2,
} from "@tabler/icons-react";

export type FeatureGridItem = {
  title: string;
  description: string;
  icon: ReactNode;
};

const marketingFeatures: FeatureGridItem[] = [
  {
    title: "Built for developers",
    description:
      "Built for engineers, developers, dreamers, thinkers and doers.",
    icon: <IconTerminal2 />,
  },
  {
    title: "Ease of use",
    description:
      "It's as easy as using an Apple, and as expensive as buying one.",
    icon: <IconEaseInOut />,
  },
  {
    title: "Pricing like no other",
    description:
      "Our prices are best in the market. No cap, no lock, no credit card required.",
    icon: <IconCurrencyDollar />,
  },
  {
    title: "100% Uptime guarantee",
    description: "We just cannot be taken down by anyone.",
    icon: <IconCloud />,
  },
  {
    title: "Multi-tenant Architecture",
    description: "You can simply share passwords instead of buying new seats",
    icon: <IconRouteAltLeft />,
  },
  {
    title: "24/7 Customer Support",
    description:
      "We are available a 100% of the time. Atleast our AI Agents are.",
    icon: <IconHelp />,
  },
  {
    title: "Money back guarantee",
    description:
      "If you donot like EveryAI, we will convince you to like us.",
    icon: <IconAdjustmentsBolt />,
  },
  {
    title: "And everything else",
    description: "I just ran out of copy ideas. Accept my sincere apologies",
    icon: <IconHeart />,
  },
];

type FeaturesSectionGridProps = {
  features?: FeatureGridItem[];
  /** Marketing (default): neutral borders. Admin: slate/cyan to match dashboard health tab. */
  variant?: "marketing" | "admin";
  className?: string;
};

export function FeaturesSectionGrid({
  features = marketingFeatures,
  variant = "marketing",
  className,
}: FeaturesSectionGridProps) {
  const isAdmin = variant === "admin";
  const numRows = Math.ceil(features.length / 4) || 1;

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 relative z-10",
        isAdmin ? "py-2 max-w-none mx-0" : "py-10 max-w-7xl mx-auto",
        className
      )}
    >
      {features.map((feature, index) => (
        <Feature
          key={`${feature.title}-${index}`}
          {...feature}
          index={index}
          numRows={numRows}
          variant={variant}
        />
      ))}
    </div>
  );
}

function Feature({
  title,
  description,
  icon,
  index,
  numRows,
  variant,
}: FeatureGridItem & {
  index: number;
  numRows: number;
  variant: "marketing" | "admin";
}) {
  const isAdmin = variant === "admin";
  const row = Math.floor(index / 4);
  const showBorderB = row < numRows - 1;
  const showBorderL = index % 4 === 0;

  return (
    <div
      className={cn(
        "flex flex-col lg:border-r py-10 relative group/feature",
        isAdmin ? "lg:border-slate-700/50 py-4 md:py-5" : "dark:border-neutral-800",
        showBorderL && (isAdmin ? "lg:border-l lg:border-slate-700/50" : "lg:border-l dark:border-neutral-800"),
        showBorderB && (isAdmin ? "lg:border-b lg:border-slate-700/50" : "lg:border-b dark:border-neutral-800")
      )}
    >
      <div
        className={cn(
          "opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full pointer-events-none",
          isAdmin
            ? "bg-gradient-to-t from-cyan-950/30 to-transparent"
            : row === 0
              ? "bg-gradient-to-t from-neutral-100 dark:from-neutral-800 to-transparent"
              : "bg-gradient-to-b from-neutral-100 dark:from-neutral-800 to-transparent"
        )}
      />
      <div
        className={cn(
          "mb-4 relative z-10 px-10",
          isAdmin && "px-4 md:px-6 mb-2",
          isAdmin ? "text-cyan-400/90" : "text-neutral-600 dark:text-neutral-400"
        )}
      >
        {icon}
      </div>
      <div className={cn("text-lg font-bold mb-2 relative z-10 px-10", isAdmin && "px-4 md:px-6 text-base")}>
        <div
          className={cn(
            "absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full transition-all duration-200 origin-center",
            isAdmin
              ? "bg-slate-600 group-hover/feature:bg-cyan-500"
              : "bg-neutral-300 dark:bg-neutral-700 group-hover/feature:bg-blue-500"
          )}
        />
        <span
          className={cn(
            "group-hover/feature:translate-x-2 transition duration-200 inline-block",
            isAdmin ? "text-slate-100" : "text-neutral-800 dark:text-neutral-100"
          )}
        >
          {title}
        </span>
      </div>
      <p
        className={cn(
          "text-sm max-w-xs relative z-10 px-10",
          isAdmin && "px-4 md:px-6 text-xs max-w-none",
          isAdmin ? "text-slate-400" : "text-neutral-600 dark:text-neutral-300"
        )}
      >
        {description}
      </p>
    </div>
  );
}

export default function FeaturesSectionDemo() {
  return <FeaturesSectionGrid />;
}
