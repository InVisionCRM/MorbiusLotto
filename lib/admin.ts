/**
 * Admin access: comma-separated list of wallet addresses (e.g. NEXT_PUBLIC_ADMIN_WALLETS).
 * Used for admin dashboard and nav visibility.
 */
const ADMIN_WALLETS_RAW =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ADMIN_WALLETS
    ? process.env.NEXT_PUBLIC_ADMIN_WALLETS
    : '';

export const ADMIN_WALLETS: string[] = ADMIN_WALLETS_RAW
  .split(',')
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

export function isAdminWallet(address: string | undefined): boolean {
  if (!address) return false;
  return ADMIN_WALLETS.includes(address.toLowerCase());
}
