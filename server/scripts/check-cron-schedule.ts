// Show current cron configuration + last drop time + computed next drop time
// for both holder and LP merkle drops.
//
// Usage (from /Users/kyle/MORBlotto/server):
//   npx ts-node --transpile-only scripts/check-cron-schedule.ts
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(__dirname, '..', '.env') });

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function nextWeeklyDrop(now: Date, day: number, hour: number): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  const dayDelta = (day - now.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + dayDelta);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  return next;
}
function nextMonthlyDrop(now: Date, day: number, hour: number): Date {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(day, 28), hour, 0, 0));
  if (candidate.getTime() > now.getTime()) return candidate;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, Math.min(day, 28), hour, 0, 0));
}
function nextBiweeklyDrop(now: Date, day: number, hour: number): Date {
  // Biweekly = same as weekly but the cron skips odd weekNums. We just compute
  // the next weekly slot, then bump by 7d if its weekNum % 2 !== 0.
  let candidate = nextWeeklyDrop(now, day, hour);
  for (let i = 0; i < 4; i++) {
    const weekNum = Math.floor(candidate.getTime() / (7 * 24 * 3600 * 1000));
    if (weekNum % 2 === 0) return candidate;
    candidate = new Date(candidate.getTime() + 7 * 24 * 3600 * 1000);
  }
  return candidate;
}

function fmt(d: Date | null): string {
  if (!d) return '—';
  const utc = d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const ny = d.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  return `${utc}  (${ny} ET)`;
}

function howLong(ms: number): string {
  if (ms < 0) return `${Math.round(-ms / 60000)}m ago`;
  const days = Math.floor(ms / (24 * 3600_000));
  const hours = Math.floor((ms % (24 * 3600_000)) / 3600_000);
  const mins = Math.floor((ms % 3600_000) / 60000);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

async function describe(label: string, settingsTbl: string, epochsTbl: string, cronEnvVar: string) {
  const { rows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM ${settingsTbl}
     WHERE key IN ('schedule_type','schedule_day','schedule_hour_utc','schedule_interval')`,
  );
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  const type = s.schedule_type ?? 'manual';
  const day = parseInt(s.schedule_day ?? '5', 10);
  const hour = parseInt(s.schedule_hour_utc ?? '12', 10);
  const interval = parseInt(s.schedule_interval ?? '60', 10);

  const last = await pool.query<{ epoch_number: number; created_at: string; status: string }>(
    `SELECT epoch_number, created_at, status FROM ${epochsTbl}
     ORDER BY epoch_number DESC LIMIT 1`,
  );
  const lastRow = last.rows[0];
  const now = new Date();
  let next: Date | null = null;

  if (type === 'weekly')        next = nextWeeklyDrop(now, day, hour);
  else if (type === 'biweekly') next = nextBiweeklyDrop(now, day, hour);
  else if (type === 'monthly')  next = nextMonthlyDrop(now, day, hour);
  else if (type === 'interval_hours')   { const ms = interval * 3600_000; const slot = Math.floor(now.getTime() / ms); next = new Date((slot + 1) * ms); }
  else if (type === 'interval_minutes') { const ms = interval * 60_000;   const slot = Math.floor(now.getTime() / ms); next = new Date((slot + 1) * ms); }

  console.log(`── ${label}`);
  console.log(`   schedule_type   : ${type}`);
  if (type === 'weekly' || type === 'biweekly') {
    console.log(`   schedule_day    : ${day} (${DOW[day]} UTC)`);
    console.log(`   schedule_hour   : ${hour}:00 UTC`);
  } else if (type === 'monthly') {
    console.log(`   schedule_day    : day ${day} of month`);
    console.log(`   schedule_hour   : ${hour}:00 UTC`);
  } else if (type === 'interval_hours' || type === 'interval_minutes') {
    console.log(`   interval        : every ${interval} ${type === 'interval_hours' ? 'h' : 'min'}`);
  }
  console.log(`   cron env (${cronEnvVar}): ${process.env[cronEnvVar] ?? '(unset)'}`);
  console.log(`   last epoch      : #${lastRow?.epoch_number ?? '—'} (${lastRow?.status ?? '—'})  ${lastRow ? fmt(new Date(lastRow.created_at)) : ''}`);
  if (lastRow) {
    const ago = now.getTime() - new Date(lastRow.created_at).getTime();
    console.log(`                     ${howLong(-ago)} (${howLong(ago)} ago)`);
  }
  console.log(`   next scheduled  : ${type === 'manual' ? '(never — manual)' : fmt(next)}`);
  if (next) console.log(`                     in ${howLong(next.getTime() - now.getTime())}`);
}

async function main() {
  console.log(`Now: ${fmt(new Date())}\n`);
  await describe('HOLDER (merkle_drops)', 'merkle_settings', 'merkle_epochs', 'MERKLE_DROP_CRON_ENABLED');
  console.log();
  await describe('LP     (merkle_lp)',    'merkle_lp_settings', 'merkle_lp_epochs', 'MERKLE_LP_DROP_CRON_ENABLED');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
