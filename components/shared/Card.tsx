import { Spade, Heart, Club, Diamond } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Card({ suit = 'spade', value = 'A', className }: { suit?: 'spade' | 'heart' | 'club' | 'diamond', value?: string, className?: string }) {
  const isRed = suit === 'heart' || suit === 'diamond';
  const Icon = suit === 'spade' ? Spade : suit === 'heart' ? Heart : suit === 'club' ? Club : Diamond;

  return (
    <div className={cn("relative w-24 h-36 bg-white rounded-xl border-2 border-slate-200 shadow-md flex items-center justify-center overflow-hidden", className)}>
      <div className={cn("absolute top-2 left-2 flex flex-col items-center", isRed ? "text-red-500" : "text-slate-900")}>
        <span className="text-sm font-bold leading-none">{value}</span>
        <Icon className="w-3 h-3" />
      </div>
      <Icon className={cn("w-10 h-10", isRed ? "text-red-500" : "text-slate-900")} />
      <div className={cn("absolute bottom-2 right-2 flex flex-col items-center rotate-180", isRed ? "text-red-500" : "text-slate-900")}>
        <span className="text-sm font-bold leading-none">{value}</span>
        <Icon className="w-3 h-3" />
      </div>
    </div>
  );
}
