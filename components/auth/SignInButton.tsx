'use client';

import { useSiwe } from '@/contexts/siwe-context';
import { useAccount } from 'wagmi';

/**
 * A minimal sign-in / sign-out chip. Drop it next to the wallet connect
 * button or anywhere you'd want a privileged-action gate.
 *
 *   <SignInButton />
 *
 * Renders nothing when the wallet isn't connected (the wallet-connect UI is
 * a separate concern). When connected but not signed in, shows "Sign in";
 * when signed in, shows "Signed in · Sign out".
 */
export function SignInButton({ className = '' }: { className?: string }) {
  const { isConnected } = useAccount();
  const { isAuthenticated, isSigningIn, signIn, signOut } = useSiwe();

  if (!isConnected) return null;

  if (isAuthenticated) {
    return (
      <button
        type="button"
        onClick={() => void signOut()}
        className={`text-xs px-2 py-1 rounded border border-white/15 text-white/70 hover:text-white hover:border-white/30 ${className}`}
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void signIn().catch(() => { /* user rejection or wallet error — handled by SIWE state */ })}
      disabled={isSigningIn}
      className={`text-xs px-2 py-1 rounded border border-purple-400/40 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25 disabled:opacity-50 ${className}`}
    >
      {isSigningIn ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
