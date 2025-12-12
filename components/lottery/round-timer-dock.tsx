'use client'

import { cn } from "@/lib/utils";
import { IconLayoutNavbarCollapse } from "@tabler/icons-react";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MultiClaimModal } from "./modals/multi-claim-modal";
import { PlayerTicketsModal } from "./player-tickets-modal";
import { PayoutBreakdownDialog } from "./round-timer";

interface RoundTimerDockProps {
  roundId?: bigint
  playerTickets?: Array<{
    ticketId: bigint | number
    numbers: readonly (number | bigint)[]
    isFreeTicket: boolean
    transactionHash?: string
  }>
  totalPssh?: bigint
  onBuyTicketsClick?: () => void
}

interface DockItem {
  title: string
  icon: React.ReactNode
  onClick: () => void
  color: string
}

export const RoundTimerDock = ({
  roundId,
  playerTickets = [],
  totalPssh,
  onBuyTicketsClick
}: RoundTimerDockProps) => {
  const router = useRouter()

  const items: DockItem[] = [
    {
      title: "Player Stats",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
        </svg>
      ),
      onClick: () => router.push('/lottery-purchase-showcase'),
      color: "bg-slate-900/50"
    },
    {
      title: "Claim Winnings",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      onClick: () => {
        // This will be handled by the modal trigger in the render
      },
      color: "bg-slate-900/50"
    },
    {
      title: "PLAY",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l.707.707A1 1 0 0012.414 11H13m-3 3.5v.5a1 1 0 001 1h1a1 1 0 001-1v-.5m-4 0h4m4 0v.5a1 1 0 01-1 1h-1a1 1 0 01-1-1v-.5m-4-3h4v-3a2 2 0 00-2-2h-1a2 2 0 00-2 2v3z" />
        </svg>
      ),
      onClick: onBuyTicketsClick || (() => {}),
      color: "bg-green-500/20"
    },
    {
      title: "Your Tickets",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      ),
      onClick: () => {
        // This will be handled by the modal trigger in the render
      },
      color: "bg-slate-900/50"
    },
    ...(totalPssh ? [{
      title: "Payouts" as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      onClick: () => {
        // This will be handled by the modal trigger in the render
      },
      color: "bg-slate-900/50"
    }] : [])
  ]

  return (
    <>
      <RoundTimerDockDesktop items={items} />
      <RoundTimerDockMobile items={items} />

      {/* Hidden modal triggers */}
      <div className="hidden">
        <MultiClaimModal />
        <PlayerTicketsModal roundId={roundId} playerTickets={playerTickets} />
        {totalPssh && <PayoutBreakdownDialog totalPssh={totalPssh} />}
      </div>
    </>
  );
};

const RoundTimerDockMobile = ({
  items,
  className,
}: {
  items: DockItem[];
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2"
          >
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 10,
                  transition: {
                    delay: idx * 0.01,
                  },
                }}
                transition={{ delay: (items.length - 1 - idx) * 0.01 }}
              >
                <button
                  onClick={() => {
                    item.onClick()
                    setOpen(false)
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${item.color} backdrop-blur-lg border border-white/30 hover:border-white/50 transition-all shadow-lg`}
                >
                  <div className="h-4 w-4 text-white">{item.icon}</div>
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 backdrop-blur-lg border border-white/20 hover:bg-white/30 transition-colors shadow-lg"
        title="Toggle navigation menu"
      >
        <IconLayoutNavbarCollapse className="h-5 w-5 text-white" />
      </button>
    </div>
  );
};

const RoundTimerDockDesktop = ({
  items,
  className,
}: {
  items: DockItem[];
  className?: string;
}) => {
  let mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden h-16 items-end gap-4 rounded-2xl bg-black/20 backdrop-blur-lg border border-white/20 px-4 pb-3 md:flex",
        className,
      )}
    >
      {items.map((item) => (
        <RoundTimerIconContainer mouseX={mouseX} key={item.title} {...item} />
      ))}
    </motion.div>
  );
};

function RoundTimerIconContainer({
  mouseX,
  title,
  icon,
  onClick,
  color,
}: {
  mouseX: MotionValue;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
}) {
  let ref = useRef<HTMLButtonElement>(null);

  let distance = useTransform(mouseX, (val) => {
    let bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };

    return val - bounds.x - bounds.width / 2;
  });

  let widthTransform = useTransform(distance, [-100, 0, 100], [40, 70, 40]);
  let heightTransform = useTransform(distance, [-100, 0, 100], [40, 70, 40]);

  let widthTransformIcon = useTransform(distance, [-100, 0, 100], [20, 35, 20]);
  let heightTransformIcon = useTransform(
    distance,
    [-100, 0, 100],
    [20, 35, 20],
  );

  let width = useSpring(widthTransform, {
    mass: 0.08,
    stiffness: 200,
    damping: 14,
  });
  let height = useSpring(heightTransform, {
    mass: 0.08,
    stiffness: 200,
    damping: 14,
  });

  let widthIcon = useSpring(widthTransformIcon, {
    mass: 0.08,
    stiffness: 200,
    damping: 14,
  });
  let heightIcon = useSpring(heightTransformIcon, {
    mass: 0.08,
    stiffness: 200,
    damping: 14,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      ref={ref}
      style={{ width, height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      className={`relative flex aspect-square items-center justify-center rounded-full ${color} backdrop-blur-sm border border-white/30 hover:border-white/50 transition-all shadow-lg hover:shadow-xl`}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 2, x: "-50%" }}
            className="absolute -top-8 left-1/2 w-fit rounded-md border border-white/20 bg-slate-900/90 backdrop-blur-lg px-2 py-0.5 text-xs whitespace-pre text-white"
          >
            {title}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        style={{ width: widthIcon, height: heightIcon }}
        className="flex items-center justify-center text-white"
      >
        {icon}
      </motion.div>
    </motion.button>
  );
}
