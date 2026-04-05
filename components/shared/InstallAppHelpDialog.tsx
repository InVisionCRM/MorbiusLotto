'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { usePwaInstallPrompt } from '@/contexts/pwa-install-prompt-context';
import { IosInstallInstructions } from '@/components/shared/IosInstallInstructions';
import { isIosTouchDevice, isStandaloneDisplay } from '@/lib/pwa-platform';

type InstallAppHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Re-openable install help: iOS Safari steps and/or Chromium one-tap install when available.
 */
export function InstallAppHelpDialog({ open, onOpenChange }: InstallAppHelpDialogProps) {
  const { deferredPrompt, clearDeferredPrompt } = usePwaInstallPrompt();
  const [standalone, setStandalone] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    setStandalone(isStandaloneDisplay());
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      /* dismissed or failed */
    } finally {
      setInstalling(false);
      clearDeferredPrompt();
    }
  }, [deferredPrompt, clearDeferredPrompt]);

  if (!open) return null;

  const ios = isIosTouchDevice();
  const showChromiumInstall = !ios && !!deferredPrompt;

  return (
    <div
      className="surface-modal-shell z-[130]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-app-help-title"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.2),transparent_65%)]" />
      <div
        className="relative z-[1] w-full max-w-lg overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl sm:max-w-xl"
        style={{
          boxShadow:
            '0 4px 32px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        }}
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="flex max-h-[min(90vh,720px)] flex-col items-center gap-5 overflow-y-auto px-6 pb-8 pt-10 sm:px-10 sm:pb-10">
          <div className="relative w-[min(72vw,220px)] shrink-0">
            <Image
              src="/morbius/OfficialMorbiusLogo.png"
              alt="MORBIUS"
              width={440}
              height={440}
              className="h-auto w-full object-contain drop-shadow-[0_0_20px_rgba(34,211,238,0.3)]"
            />
          </div>

          <div className="text-center">
            <h2
              id="install-app-help-title"
              className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
            >
              Install Morbius
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">
              Add the app to your device for quick access and a full-screen experience.
            </p>
          </div>

          {standalone ? (
            <p className="text-center text-sm text-slate-300">
              You are already using the installed app or full-screen mode.
            </p>
          ) : ios ? (
            <IosInstallInstructions />
          ) : (
            <div className="flex w-full flex-col gap-4">
              {showChromiumInstall ? (
                <button
                  type="button"
                  disabled={installing}
                  onClick={handleInstallClick}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg transition hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60"
                >
                  {installing ? 'Opening install…' : 'Install app'}
                </button>
              ) : (
                <div className="rounded-xl border border-cyan-500/15 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                  <p className="font-medium text-cyan-200/90">Desktop or Android (Chrome, Edge, etc.)</p>
                  <p className="mt-2 text-slate-400">
                    Look for the install icon in the address bar or use the browser menu (
                    <strong className="text-slate-300">Install app</strong> /{' '}
                    <strong className="text-slate-300">Install Morbius</strong>).
                  </p>
                </div>
              )}
              <details className="w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2 text-sm text-slate-400">
                <summary className="cursor-pointer select-none font-medium text-cyan-200/90 hover:text-cyan-100">
                  Installing on iPhone or iPad?
                </summary>
                <div className="mt-3 border-t border-white/10 pt-3">
                  <IosInstallInstructions className="border-0 bg-transparent px-0 py-1 shadow-none" />
                </div>
              </details>
            </div>
          )}

          <button
            type="button"
            onClick={close}
            className="text-sm font-medium text-slate-400 underline-offset-2 hover:text-cyan-300 hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
