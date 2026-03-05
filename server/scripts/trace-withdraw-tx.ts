/**
 * One-off: simulate a failed withdrawWithSignature tx to get revert reason.
 * Run from repo root: npx ts-node --esm server/scripts/trace-withdraw-tx.ts
 * Or: cd server && npx ts-node --esm scripts/trace-withdraw-tx.ts
 *
 * Usage: pass tx hash as first arg, e.g.
 *   npx ts-node --esm server/scripts/trace-withdraw-tx.ts 0x7a2f65b39dba192041b97517ade65ae534e45c4faf460086d3a5c16fd4fa8f07
 */
import { createPublicClient, http, parseAbiParameters } from 'viem';
import { pulsechain } from 'viem/chains';

const TX_HASH = (process.argv[2] || '0x7a2f65b39dba192041b97517ade65ae534e45c4faf460086d3a5c16fd4fa8f07') as `0x${string}`;

const BLACKJACK = '0xc2Ae080dE01108b5C9C0f2C5C86051CFd3D18C00' as const;

const client = createPublicClient({
  chain: pulsechain,
  transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
});

async function main() {
  const tx = await client.getTransaction({ hash: TX_HASH });
  if (!tx) {
    console.error('Transaction not found');
    process.exit(1);
  }
  console.log('Block number:', tx.blockNumber);
  console.log('From:', tx.from);
  console.log('To:', tx.to);
  console.log('Data length:', tx.input.length);

  const block = tx.blockNumber ?? undefined;
  try {
    await client.call({
      to: tx.to!,
      from: tx.from,
      data: tx.input,
      blockNumber: block,
      account: tx.from,
    });
    console.log('Simulation succeeded (unexpected)');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\nRevert reason:', msg);
    if (err && typeof err === 'object' && 'cause' in err) {
      console.error('Cause:', (err as { cause?: unknown }).cause);
    }
    process.exit(1);
  }
}

main();
