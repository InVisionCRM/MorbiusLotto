'use client';

import { useState, useEffect } from 'react';
import { BreakReminder } from './BreakReminder';

/**
 * Only render BreakReminder after client mount.
 * Prevents WagmiProviderNotFoundError during Next.js static prerender of /_not-found,
 * since useAccount is called inside BreakReminder and WagmiProvider context may not
 * be available during SSR/static generation.
 */
export function BreakReminderWrapper() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <BreakReminder />;
}
