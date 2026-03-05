import { cn } from '@/lib/utils';

export function Chip({ color = 'red', value = 100, className }: { color?: 'red' | 'blue' | 'black' | 'green' | 'white', value?: number, className?: string }) {
  const colorClasses = {
    red: 'bg-red-500 border-red-600 text-white',
    blue: 'bg-blue-500 border-blue-600 text-white',
    black: 'bg-slate-900 border-slate-950 text-white',
    green: 'bg-emerald-500 border-emerald-600 text-white',
    white: 'bg-white border-slate-200 text-slate-900',
  };

  return (
    <div className={cn("relative w-20 h-20 rounded-full border-4 shadow-md flex items-center justify-center", colorClasses[color], className)}>
      <div className="absolute inset-1 rounded-full border-2 border-dashed border-current opacity-50"></div>
      <div className="absolute inset-3 rounded-full border border-current opacity-30"></div>
      <span className="font-bold text-lg">{value}</span>
    </div>
  );
}
