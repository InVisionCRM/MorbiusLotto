/**
 * Reconcile on-chain BlackjackV7 reserves against off-chain (DB) play balances.
 *
 * WHY: BlackjackV7 (0xc2Ae080dE01108b5C9C0f2C5C86051CFd3D18C00) is a player-custody
 * "reserve" contract. Because gameplay/payouts run off-chain (server + hot wallet),
 * the on-chain `withdraw()` that would DECREMENT a depositor's reserve was almost
 * never called — so `totalReserves` (~23.35M) is basically GROSS LIFETIME DEPOSITS,
 * not current liability. emergencyWithdraw only releases balance above totalReserves,
 * which is why nearly the whole pool is frozen.
 *
 * This script tells you the REAL exposure by splitting the frozen reserves into:
 *   - owedBacked   : current DB balance that IS covered by this wallet's on-chain
 *                    reserve  -> payable to the player DIRECTLY FROM this pool
 *                    (server-signed withdrawWithSignature). Liquidity you get back.
 *   - owedExcess   : current DB balance ABOVE this wallet's reserve -> a real debt
 *                    you must still cover from the hot wallet (pool can't cover it).
 *   - deadLocked   : on-chain reserve ABOVE current DB balance -> money the house
 *                    already won (player lost/cashed out off-chain). Frozen and
 *                    unextractable. THIS is the true "dead" number.
 *
 * Current DB balance (wei) per wallet, robust to whether migration 156 ran:
 *     player_poker_chips.balance (whole chips, 1 chip = 1 MORBIUS) * 1e18
 *   + players.balance            (residual wei / un-migrated balance)
 *
 * READ-ONLY. Only SELECTs and eth_call view reads. It NEVER writes to the DB and
 * NEVER sends a transaction.
 *
 * Usage (from repo root, with server/.env holding DATABASE_URL):
 *   node server/scripts/reconcile-blackjack-reserves.js
 *
 * Optional env:
 *   RPC_URL            (default https://rpc.pulsechain.com)
 *   BLACKJACK_ADDRESS  (default V7)
 *   MORBIUS_ADDRESS    (default 0xB7d4...C6F1)
 *   OUT_CSV            (default ./blackjack-reserve-reconciliation.csv)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'https://rpc.pulsechain.com';
const BLACKJACK = (process.env.BLACKJACK_ADDRESS || '0xc2Ae080dE01108b5C9C0f2C5C86051CFd3D18C00').toLowerCase();
const MORBIUS = (process.env.MORBIUS_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1').toLowerCase();
const OUT_CSV = process.env.OUT_CSV || path.join(process.cwd(), 'blackjack-reserve-reconciliation.csv');
const WEI = 10n ** 18n;

// The 70 depositor wallets in BlackjackV7 (snapshot; reserves are re-read live below).
// Second field = wallet you are known to control (leave "" for external players;
// fill in more as you identify them and re-run to see recoverable totals move).
const WALLETS = [
  ["0x9bcc201d90c2f45b61cfed7b710a08ee3ba4b086", ""],
  ["0xe8e9a8d1874e77eb2075d5f3020ad59d4dbe099b", ""],
  ["0x9633e2947d3fa6194826401d4ffd3e922cfc5412", ""],
  ["0x98c5154168853d5768361dc27513a633f15704ac", ""],
  ["0xd45eca7d50fe06f95f3c46fd0b11f85ad047290f", ""],
  ["0x899720baa52df75c47a0c440cf5bf7818d796c4f", ""],
  ["0x70444750eedf1b2c9b777cbf096a5919a14895e5", "owner/emergencyAdmin"],
  ["0xae3a9849516b880f11fb9b8f7a1d2b3652450235", ""],
  ["0x8fac73dede4e2d892a3a55e58ec24650e0844bd7", ""],
  ["0xe017c1e208cfeecadd82c39dabb175fdb13b642b", ""],
  ["0x2775dd8242c4f589536113475b7c80f42ab4a70a", "authorizedServer"],
  ["0x1632e74353784c474638d3facdceadac88e3ea4e", ""],
  ["0xe8cdfe8bb310b23da4e1453ceca3dc0a8dc5c2c4", ""],
  ["0xe7b99a6897e39bab0d1107beb709f8624f76f1b7", ""],
  ["0x8efad1da5e5a29706e228bc3b3498cc1e6fcbd4a", ""],
  ["0xda8681ace25181131c48b4705586bcf0c3b7a3d9", ""],
  ["0xf9e48f4c0eb3aa7709331ea89b9ac30351ecc391", ""],
  ["0x412184a37acecc178dcfb3863b47857d6dda60f4", ""],
  ["0xca09d3b56c0c22946d8a12a5b5d8656eba2162e4", ""],
  ["0x3f224a640517d9497123e2d5f88ceb1239ead53d", ""],
  ["0x8605a54244bddef405ca1b0924cd003d434fedb1", ""],
  ["0x0b00dc6833f2a7fecb3910e8a2777e826dda5500", ""],
  ["0xd9521fc5990ca3ec1f60d0fc7d2e83dfbd620e9c", ""],
  ["0x96a995daad68776c8924d2117c72766f1859ca53", ""],
  ["0x5d372e0ef4d9ed0689ce7fdcfb931da5b4f7f6b8", ""],
  ["0xc4dd850fe282dfad87e1451257c497385b0bf6ab", ""],
  ["0x41682815b05fe6b54a6c0f8813bb99423ee0309d", "plsTreasury"],
  ["0xcc72a91facc3741d1f36914cfcfc635723239285", ""],
  ["0x809af3e7ce3f28196cc619d0698922d9e1364569", ""],
  ["0x479143834c0ec540e0924923383cdd8839b138a3", ""],
  ["0x5107a8e02bcc443e25e4df7ab5db2dbb9f0bdcc8", ""],
  ["0x064da67680c6def174581a9c464d08d5175b59fd", ""],
  ["0xd449b4a617dae1afcf8a2afc99486db692d947ff", ""],
  ["0xd1609ca1eb3f68a2ad892df945410d572c74dcd5", ""],
  ["0x611f43004ec308dc84c964b813bfbda153bbae57", ""],
  ["0xd1b56a53cad22d16d417148105a33e8cefccf49b", ""],
  ["0xe5897595e4dd5d2a4455dedf618d2c05ae2f29ef", ""],
  ["0x4ac099766fe60c408a6329ab02914022863b6d78", ""],
  ["0xe8df971d0481546ac6deb0c1665d7d44780f907e", ""],
  ["0x79c8eff27b397f02b1b45293948b536c1e3b67c8", ""],
  ["0x26969ebab3f66bd6891b34503ab11ac4d5d2508f", ""],
  ["0xc0b47331e6587e47d6847310c977c7c25485109b", ""],
  ["0x2ddf220d1c4d8e37cbf4912470edf93169a52964", ""],
  ["0x181969013b5e80a7a3016cb910a62eb17faaf713", ""],
  ["0x92480ff8d44bf8ba65dbfc0c9548400cc9f16326", ""],
  ["0xe8dd73a05638a419d106895f037fb0683a3e2105", ""],
  ["0xaecfc3162cedce794f31436b001a349294b68fce", ""],
  ["0xfbf19160c49b45324287a8e5d6269d2b384ed526", ""],
  ["0x4bd6d5c572ad27f035a7e6796a455e68fac625b9", ""],
  ["0x8f6dc8fd8a5115fdec3ccbe36be6cf9b28635f2e", ""],
  ["0xa10b1e8249fb0ee42316af0f4afa2b666002764c", ""],
  ["0x514a1c1f9f1f499e7a655b022a284d5b8d96d0b5", ""],
  ["0xb10f41102e052fc437a8de3b5d95fd6c67c64450", ""],
  ["0x7f18e5bad641f989aefb4379190430c0247eacb5", ""],
  ["0x063d63657645a0060dea5f3928729d0ee736f042", ""],
  ["0x2a41d979ba8d1867aca3dabec7e1f8a7a9026b82", ""],
  ["0x810f091dd216f9e25782fb4ba0618fb6e678592b", ""],
  ["0xf54c17a6448107193e575be9a03c904031f81151", ""],
  ["0x747e7111ab5138688607b159461713e7e5136745", ""],
  ["0xa7c94d3276fb156005ef46cb7d4163dae7dc3c9c", ""],
  ["0xf2e226407514e042c1a4c5ed4344bdc35913b585", ""],
  ["0x6155b62c92775d85920f64a511d35f2022a48f95", ""],
  ["0xa4d2cafe13bebe3ccbbb628e3afaead706e6b6b8", ""],
  ["0xe5906003e42e88d2c2bfbbb4b8f1fafa4ac2496d", ""],
  ["0x105a17191ef4cc85c176cd87a905edf4550ffc38", ""],
  ["0xaff6efd928f8099d1be8e0a003a238315cd0d0b9", ""],
  ["0x131fcd28cba5222318c945d011940abae42cdabe", ""],
  ["0xaf66e601299f3d88d82734431629cf3fa9f41269", ""],
  ["0xc684b8024a1a852f6707ba01081fb55abcc5e74d", ""],
  ["0x4e637ce5eb8a0d626e2f0ff1b72b831e4ad3a7bf", ""],
];

const BJ_ABI = [
  'function playerReserves(address) view returns (uint256)',
  'function totalReserves() view returns (uint256)',
];
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

function fmt(wei) {
  // wei (BigInt) -> "1,234,567.89" MORBIUS
  const neg = wei < 0n;
  let v = neg ? -wei : wei;
  const whole = v / WEI;
  const frac = ((v % WEI) * 100n) / WEI; // 2 dp
  const s = whole.toLocaleString('en-US') + '.' + frac.toString().padStart(2, '0');
  return (neg ? '-' : '') + s;
}
const bmin = (a, b) => (a < b ? a : b);
const bmax = (a, b) => (a > b ? a : b);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set (expected in server/.env). Aborting.');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  const isNeon = url.includes('neon.tech');
  const useVerifyFull = /sslmode=verify-full|sslmode=verify-ca/i.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isNeon ? (useVerifyFull ? { rejectUnauthorized: true } : { rejectUnauthorized: false }) : false,
  });

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const bj = new ethers.Contract(BLACKJACK, BJ_ABI, provider);
  const morbius = new ethers.Contract(MORBIUS, ERC20_ABI, provider);

  const addrs = WALLETS.map(([a]) => a);
  const ownTag = new Map(WALLETS);

  // --- On-chain: contract balance, totalReserves, per-wallet reserves (live) ---
  const [contractBalance, totalReserves] = await Promise.all([
    morbius.balanceOf(BLACKJACK),
    bj.totalReserves(),
  ]);
  const reserves = {};
  for (const a of addrs) {
    reserves[a] = await bj.playerReserves(a); // BigInt
  }

  // --- Off-chain: chips (whole MORBIUS) + dust (wei) ---
  const client = await pool.connect();
  let chipRows, dustRows;
  try {
    chipRows = await client.query(
      'SELECT wallet_address, balance FROM player_poker_chips WHERE wallet_address = ANY($1)',
      [addrs]
    );
    dustRows = await client.query(
      'SELECT LOWER(wallet_address) AS w, balance FROM players WHERE LOWER(wallet_address) = ANY($1)',
      [addrs]
    );
  } finally {
    client.release();
    await pool.end();
  }
  const chips = new Map(chipRows.rows.map((r) => [r.wallet_address.toLowerCase(), BigInt(r.balance)]));
  const dust = new Map(dustRows.rows.map((r) => [r.w, BigInt(r.balance)]));

  // --- Reconcile ---
  const out = [];
  let sumReserve = 0n, sumDb = 0n, sumOwedBacked = 0n, sumOwedExcess = 0n, sumDeadLocked = 0n;
  let sumOwnReserve = 0n;

  for (const a of addrs) {
    const reserve = reserves[a] || 0n;
    const dbWei = (chips.get(a) || 0n) * WEI + (dust.get(a) || 0n);
    const owedBacked = bmin(dbWei, reserve);
    const owedExcess = bmax(0n, dbWei - reserve);
    const deadLocked = bmax(0n, reserve - dbWei);
    const tag = ownTag.get(a) || '';

    sumReserve += reserve;
    sumDb += dbWei;
    sumOwedBacked += owedBacked;
    sumOwedExcess += owedExcess;
    sumDeadLocked += deadLocked;
    if (tag) sumOwnReserve += reserve;

    out.push({ a, tag, reserve, dbWei, owedBacked, owedExcess, deadLocked });
  }
  out.sort((x, y) => (y.reserve > x.reserve ? 1 : y.reserve < x.reserve ? -1 : 0));

  // --- Print table ---
  console.log('\nBlackjackV7 reserve reconciliation  (contract ' + BLACKJACK + ')');
  console.log('='.repeat(120));
  console.log(
    'idx  wallet                                        reserve            db_balance        owedBacked        deadLocked   tag'
  );
  out.forEach((r, i) => {
    console.log(
      String(i + 1).padStart(3) + '  ' +
      r.a + '  ' +
      fmt(r.reserve).padStart(16) + '  ' +
      fmt(r.dbWei).padStart(16) + '  ' +
      fmt(r.owedBacked).padStart(16) + '  ' +
      fmt(r.deadLocked).padStart(16) + '   ' + r.tag
    );
  });

  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY');
  console.log('  contract MORBIUS balance          : ' + fmt(contractBalance));
  console.log('  totalReserves (on-chain)          : ' + fmt(totalReserves));
  console.log('  sum reserves over listed wallets  : ' + fmt(sumReserve) + '   (should ~= totalReserves)');
  console.log('  ------------------------------------------------------------------');
  console.log('  CURRENT real liability (DB)        : ' + fmt(sumDb) + '   <- what you still owe these depositors');
  console.log('    - payable FROM this pool         : ' + fmt(sumOwedBacked) + '   (owedBacked: server-sign withdrawals -> liquidity relief)');
  console.log('    - must cover from hot wallet      : ' + fmt(sumOwedExcess) + '   (owedExcess: DB balance above their on-chain reserve)');
  console.log('  DEAD-LOCKED house profit           : ' + fmt(sumDeadLocked) + '   <- frozen, unextractable. THE TRUE LOSS.');
  console.log('  ------------------------------------------------------------------');
  console.log('  reserves at wallets you control    : ' + fmt(sumOwnReserve) + '   (recoverable via placeBet->emergencyWithdraw)');
  console.log('');
  console.log('  Sanity: owedBacked + deadLocked should ~= sum reserves:');
  console.log('          ' + fmt(sumOwedBacked + sumDeadLocked) + '  vs  ' + fmt(sumReserve));

  // --- CSV ---
  const header = 'wallet,tag,reserve_wei,db_balance_wei,owed_backed_wei,owed_excess_wei,dead_locked_wei\n';
  const body = out
    .map((r) => [r.a, r.tag, r.reserve, r.dbWei, r.owedBacked, r.owedExcess, r.deadLocked].join(','))
    .join('\n');
  fs.writeFileSync(OUT_CSV, header + body + '\n');
  console.log('\nCSV written: ' + OUT_CSV);
  console.log('(read-only run — no DB writes, no transactions)\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
