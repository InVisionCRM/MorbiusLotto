/** Load holder snapshot blocklist from DB (merkle_blocklist + merkle_lp_pairs). */
async function loadHolderBlocklist(pool) {
  const set = new Set();
  const { rows: bl } = await pool.query('SELECT lower(address) AS address FROM merkle_blocklist');
  for (const r of bl) set.add(r.address);
  const { rows: lp } = await pool.query('SELECT lower(pair_address) AS pair_address FROM merkle_lp_pairs');
  for (const r of lp) set.add(r.pair_address);
  return set;
}

/** Load LP snapshot blocklist from DB (merkle_lp_blocklist). */
async function loadLpBlocklist(pool) {
  const set = new Set();
  const { rows: bl } = await pool.query('SELECT lower(address) AS address FROM merkle_lp_blocklist');
  for (const r of bl) set.add(r.address);
  return set;
}

function assertNoBlocklistedPayouts(blocklist, payouts) {
  const blocked = payouts.filter((p) => blocklist.has(p.wallet_address.toLowerCase()));
  if (blocked.length === 0) return;
  const sample = blocked.slice(0, 10).map((p) => p.wallet_address).join(', ');
  throw new Error(
    `${blocked.length} payout row(s) match the exclusion blocklist (e.g. ${sample}). ` +
      'Re-snapshot the epoch after fixing merkle_blocklist before disperse.',
  );
}

module.exports = { loadHolderBlocklist, loadLpBlocklist, assertNoBlocklistedPayouts };
