'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { usePwaInstallPrompt } from '@/contexts/pwa-install-prompt-context';
import { IosInstallInstructions } from '@/components/shared/IosInstallInstructions';
import { isIosTouchDevice, isStandaloneDisplay } from '@/lib/pwa-platform';

const STORAGE_KEY = 'morbius_pwa_home_install_splash_dismissed_v1';

/**
 * Full-screen install splash on the home page only: large branding + Chromium
 * install button when available, or iOS “Add to Home Screen” steps.
 */
export function PwaHomeInstallSplash() {
  const { deferredPrompt, clearDeferredPrompt } = usePwaInstallPrompt();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandaloneDisplay()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      /* private mode */
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !open) return;
    const onInstalled = () => {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
      setOpen(false);
      clearDeferredPrompt();
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, [open, clearDeferredPrompt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      /* user dismissed or prompt failed */
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
      className="surface-modal-shell z-[120]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-home-install-title"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.25),transparent_65%)]" />
      <div
        className="relative z-[1] w-full max-w-lg overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl sm:max-w-xl"
        style={{
          boxShadow:
            '0 4px 32px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        }}
      >
        <button
          type="button"
          onClick={dismiss}
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

        <div className="flex flex-col items-center gap-6 px-6 pb-8 pt-10 sm:px-10 sm:pb-10">
          <div className="relative w-[min(88vw,340px)] shrink-0">
            <Image
              src="/morbius/OfficialMorbiusLogo.png"
              alt="MORBIUS"
              width={680}
              height={680}
              className="h-auto w-full object-contain drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]"
              priority
            />
          </div>

          <div className="text-center">
            <h2
              id="pwa-home-install-title"
              className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
            >
              Install Morbius
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">
              Add the app for quick access, a cleaner full-screen experience, and faster return
              visits on PulseChain.
            </p>
          </div>

          {ios ? (
            <IosInstallInstructions />
          ) : (
            <div className="flex w-full flex-col items-stretch gap-3">
              {showChromiumInstall ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    disabled={installing}
                    onClick={handleInstallClick}
                    className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg transition hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60"
                  >
                    {installing ? 'Opening install…' : 'Install app'}
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-xl border border-slate-600/80 bg-slate-800/80 px-6 py-3 text-base font-medium text-slate-200 transition hover:bg-slate-700/80 sm:min-w-[8rem]"
                  >
                    Not now
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-center text-sm text-slate-400">
                    If your browser supports it, an install option may appear in the address bar
                    (install icon or menu). You can close this and browse — nothing is required.
                  </p>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="self-center rounded-xl border border-slate-600/80 bg-slate-800/80 px-6 py-3 text-base font-medium text-slate-200 transition hover:bg-slate-700/80"
                  >
                    Not now
                  </button>
                </>
              )}
            </div>
          )}

          {ios ? (
            <button
              type="button"
              onClick={dismiss}
              className="text-sm font-medium text-slate-400 underline-offset-2 hover:text-cyan-300 hover:underline"
            >
              Continue without installing
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
