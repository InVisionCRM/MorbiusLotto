'use client';

/**
 * /settings — account settings page.
 *
 * Currently hosts the Telegram notifications panel. Built as its own page so
 * future settings sections can drop in here without touching game UI.
 */

import { useAccount } from 'wagmi';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { TelegramLink } from '@/components/settings/TelegramLink';

export default function SettingsPage() {
  const { address, isConnected } = useAccount();

  return (
    <GlobalMainNav>
      <div className="min-h-screen bg-black text-white pt-4 md:pt-2">
        <div className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-white/55">
              Manage your account preferences.
            </p>

            <section className="mt-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                Notifications
              </h2>
              {!isConnected || !address ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 text-center">
                  <p className="text-sm text-white/60">
                    Connect your wallet to manage notification settings.
                  </p>
                </div>
              ) : (
                <TelegramLink walletAddress={address} />
              )}
            </section>
          </div>
        </div>
      </div>
    </GlobalMainNav>
  );
}
