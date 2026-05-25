/**
 * MORBIUS holder discovery via PulseChain RPC.
 *
 * PulseScan (api.scan.pulsechain.com) returns 502 from cloud/datacenter egress
 * (e.g. Railway) while residential IPs work. Snapshots must not depend on it.
 * We enumerate candidate wallets from ERC-20 Transfer logs, then read balances
 * on-chain at the snapshot block.
 */

import { type Address, parseAbiItem } from 'viem';
import { multicall } from 'viem/actions';
import { getPublicClient } from './chain-client';
import { MORBIUS_TOKEN_ADDRESS } from '../config/contracts';
import { logger } from './logger';

/** First MORBIUS Transfer on PulseChain mainnet (binary-searched). */
export const MORBIUS_DEPLOY_BLOCK = 25_013_103n;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const ERC20_BALANCE_OF_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const LOG_CHUNK_SIZE = 5_000n;
const BALANCE_BATCH_SIZE = 100;

export interface MorbiusHolderBalance {
  address: string;
  balance: bigint;
}

async function collectTransferAddresses(
  fromBlock: bigint,
  toBlock: bigint,
  seedAddresses: Iterable<string>,
): Promise<Set<string>> {
  const client = getPublicClient();
  const addresses = new Set<string>();

  for (const addr of seedAddresses) {
    const normalized = addr.toLowerCase();
    if (normalized && normalized !== ZERO_ADDRESS) {
      addresses.add(normalized);
    }
  }

  let scannedFrom = fromBlock;
  let chunkCount = 0;
  let logCount = 0;

  while (scannedFrom <= toBlock) {
    const scannedTo = scannedFrom + LOG_CHUNK_SIZE - 1n > toBlock
      ? toBlock
      : scannedFrom + LOG_CHUNK_SIZE - 1n;

    let logs;
    try {
      logs = await client.getLogs({
        address: MORBIUS_TOKEN_ADDRESS,
        event: TRANSFER_EVENT,
        fromBlock: scannedFrom,
        toBlock: scannedTo,
      });
    } catch (err) {
      // Public RPC can timeout on large ranges — retry smaller chunks once.
      if (LOG_CHUNK_SIZE > 1_000n && scannedTo - scannedFrom >= 1_000n) {
        const mid = scannedFrom + (scannedTo - scannedFrom) / 2n;
        for (const [subFrom, subTo] of [[scannedFrom, mid], [mid + 1n, scannedTo]] as const) {
          const subLogs = await client.getLogs({
            address: MORBIUS_TOKEN_ADDRESS,
            event: TRANSFER_EVENT,
            fromBlock: subFrom,
            toBlock: subTo,
          });
          logCount += subLogs.length;
          for (const log of subLogs) {
            if (log.args.from) addresses.add(log.args.from.toLowerCase());
            if (log.args.to) addresses.add(log.args.to.toLowerCase());
          }
        }
        chunkCount += 1;
        scannedFrom = scannedTo + 1n;
        continue;
      }
      logger.error(
        `[MorbiusHoldersRPC] getLogs failed blocks ${scannedFrom}-${scannedTo}`,
        err,
      );
      throw err;
    }

    logCount += logs.length;
    for (const log of logs) {
      if (log.args.from) addresses.add(log.args.from.toLowerCase());
      if (log.args.to) addresses.add(log.args.to.toLowerCase());
    }

    chunkCount += 1;
    if (chunkCount % 25 === 0) {
      logger.info(
        `[MorbiusHoldersRPC] Log scan progress: block ${scannedTo}/${toBlock}, `
        + `${addresses.size} candidates, ${logCount} transfers`,
      );
    }

    scannedFrom = scannedTo + 1n;
  }

  addresses.delete(ZERO_ADDRESS);
  logger.info(
    `[MorbiusHoldersRPC] Transfer scan complete: ${logCount} logs, `
    + `${addresses.size} candidate addresses (${chunkCount} chunks)`,
  );
  return addresses;
}

async function readBalancesAtBlock(
  addresses: string[],
  blockNumber: bigint,
): Promise<Map<string, bigint>> {
  const client = getPublicClient();
  const balances = new Map<string, bigint>();

  for (let i = 0; i < addresses.length; i += BALANCE_BATCH_SIZE) {
    const batch = addresses.slice(i, i + BALANCE_BATCH_SIZE);
    const results = await multicall(client, {
      contracts: batch.map((address) => ({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [address as Address],
      })),
      blockNumber,
    });

    for (let j = 0; j < batch.length; j += 1) {
      const result = results[j];
      if (result.status === 'success') {
        balances.set(batch[j], result.result as bigint);
      } else {
        logger.warn(`[MorbiusHoldersRPC] balanceOf failed for ${batch[j]}`);
        balances.set(batch[j], 0n);
      }
    }
  }

  return balances;
}

/**
 * Fetch all MORBIUS holders with non-zero balance at `atBlock` (default: latest).
 * `fromBlock` limits Transfer log scanning — pass the last good snapshot block
 * when incremental scanning is enough; otherwise scans from token deploy.
 */
export async function fetchMorbiusHoldersFromChain(options: {
  fromBlock?: bigint;
  atBlock?: bigint;
  seedAddresses?: string[];
} = {}): Promise<{ holders: MorbiusHolderBalance[]; blockNumber: bigint }> {
  const client = getPublicClient();
  const blockNumber = options.atBlock ?? await client.getBlockNumber();
  const fromBlock = options.fromBlock ?? MORBIUS_DEPLOY_BLOCK;

  if (fromBlock > blockNumber) {
    throw new Error(
      `Invalid scan range: fromBlock ${fromBlock} > snapshot block ${blockNumber}`,
    );
  }

  logger.info(
    `[MorbiusHoldersRPC] Scanning Transfer logs ${fromBlock} → ${blockNumber} `
    + `(seeds: ${options.seedAddresses?.length ?? 0})`,
  );

  const candidates = await collectTransferAddresses(
    fromBlock,
    blockNumber,
    options.seedAddresses ?? [],
  );

  const candidateList = Array.from(candidates);
  logger.info(`[MorbiusHoldersRPC] Reading balances for ${candidateList.length} addresses...`);

  const balances = await readBalancesAtBlock(candidateList, blockNumber);
  const holders: MorbiusHolderBalance[] = [];

  for (const [address, balance] of balances) {
    if (balance > 0n) {
      holders.push({ address, balance });
    }
  }

  logger.info(`[MorbiusHoldersRPC] ${holders.length} non-zero holders at block ${blockNumber}`);
  return { holders, blockNumber };
}
