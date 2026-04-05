import { cn } from '@/lib/utils';

/**
 * Step-by-step Add to Home Screen instructions for iPhone / iPad (Safari).
 * Apple does not expose a programmatic install API; users must use Share → Add to Home Screen.
 */
export function IosInstallInstructions({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-full rounded-xl border border-cyan-500/20 bg-slate-950/50 px-4 py-4 text-left text-sm text-slate-200',
        className,
      )}
    >
      <p className="font-medium text-cyan-200">iPhone or iPad — Safari</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Add to Home Screen is provided by Safari. If you use Chrome or another browser on iOS, open
        this site in <strong className="text-slate-300">Safari</strong> first (Share → Open in Safari
        when available), then follow the steps below.
      </p>
      <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-slate-300">
        <li>
          Tap <strong className="text-white">Share</strong>{' '}
          <span className="whitespace-nowrap">(square with an upward arrow)</span> in the toolbar.
        </li>
        <li>
          Scroll the share sheet and tap{' '}
          <strong className="text-white">Add to Home Screen</strong>.
        </li>
        <li>
          Edit the name if you like, then tap <strong className="text-white">Add</strong>.
        </li>
      </ol>
      <p className="mt-4 text-xs text-slate-500">
        Unlike Android or desktop Chrome, iOS does not allow websites to trigger install with a
        single in-page button — this flow is required by Apple.
      </p>
    </div>
  );
}
