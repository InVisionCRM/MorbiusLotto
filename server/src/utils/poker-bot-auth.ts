import type { Pool } from 'pg';
import { isAdminWallet } from '../lib/cosmetics-catalog';

/** Bootstrap/stop poker bots: caller must be admin or seated at the table (x-admin-wallet = connected wallet). */
export async function assertPokerBotControlAllowed(
  pool: Pool,
  tableId: string,
  walletHeader: string | undefined
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const wallet = walletHeader?.trim();
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return { ok: false, status: 403, error: 'Wallet required (x-admin-wallet)' };
  }
  if (isAdminWallet(wallet)) {
    return { ok: true };
  }
  const r = await pool.query(
    `SELECT 1 FROM poker_seats WHERE table_id = $1 AND player_address IS NOT NULL AND LOWER(player_address) = LOWER($2) LIMIT 1`,
    [tableId, wallet]
  );
  if (r.rows.length === 0) {
    return { ok: false, status: 403, error: 'Must be seated at this table or admin to manage bots' };
  }
  return { ok: true };
}
