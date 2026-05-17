/**
 * EIP-2612 permit helpers.
 *
 * Detection: a token is treated as "supports permit" iff it exposes BOTH `nonces(owner)` AND
 * `DOMAIN_SEPARATOR()`. We probe via `eth_call`; failure → no permit, fall back to approve+transferFrom.
 *
 * Signing: builds the EIP-712 typed-data hash that EIP-2612 mandates and asks the connected wallet
 * to sign it. Output is the (v, r, s) triple consumed by `*WithPermit(...)` entrypoints (e.g.
 * `TournamentPrizeEscrowV6.depositPrizePoolWithPermit`).
 */

import type { PublicClient, WalletClient, Address, Hex } from 'viem';

/** Minimal ABI fragments to probe permit support without pulling in a full ERC-20 ABI here. */
const PROBE_ABI = [
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'version',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const;

/**
 * Probe whether a token implements EIP-2612 permit. Cheap (two parallel eth_calls) and safe;
 * returns false on any RPC error so callers can degrade gracefully to approve+transferFrom.
 */
export async function detectPermitSupport(args: {
  publicClient: PublicClient;
  token: Address;
  owner: Address;
}): Promise<boolean> {
  try {
    await Promise.all([
      args.publicClient.readContract({
        address: args.token,
        abi: PROBE_ABI,
        functionName: 'nonces',
        args: [args.owner],
      }),
      args.publicClient.readContract({
        address: args.token,
        abi: PROBE_ABI,
        functionName: 'DOMAIN_SEPARATOR',
        args: [],
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build + sign an EIP-2612 permit. Returns the (v, r, s) signature plus the deadline that was
 * embedded in the typed data — caller passes both to `*WithPermit(...)`.
 *
 * Notes:
 *   - Reads `name()` and `nonces(owner)` from the token on-chain. Skips `version()` (most tokens
 *     omit it from the EIP-712 domain in practice; if signing fails for a stricter token, try
 *     adding `version` to `domain` below).
 *   - `deadlineSeconds` defaults to 1 hour from now — enough slack for a slow wallet popup without
 *     being so loose that a re-broadcast weeks later goes through.
 */
export async function signErc20Permit(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  token: Address;
  owner: Address;
  spender: Address;
  value: bigint;
  /** Seconds until the permit expires. Default: 3600. */
  deadlineSeconds?: number;
  /**
   * Optional override for the token's EIP-712 domain `version` field. Some tokens hard-code "1"
   * but don't expose `version()`; others use "2". Defaults to omitting `version` from the domain.
   */
  version?: string;
}): Promise<{ v: number; r: Hex; s: Hex; deadline: bigint }> {
  const [name, nonce, chainId] = await Promise.all([
    args.publicClient.readContract({
      address: args.token,
      abi: PROBE_ABI,
      functionName: 'name',
      args: [],
    }),
    args.publicClient.readContract({
      address: args.token,
      abi: PROBE_ABI,
      functionName: 'nonces',
      args: [args.owner],
    }),
    args.publicClient.getChainId(),
  ]);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (args.deadlineSeconds ?? 3600));

  const domain: { name: string; chainId: number; verifyingContract: Address; version?: string } = {
    name: String(name),
    chainId,
    verifyingContract: args.token,
  };
  if (args.version) domain.version = args.version;

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  } as const;

  const message = {
    owner: args.owner,
    spender: args.spender,
    value: args.value,
    nonce: nonce as bigint,
    deadline,
  };

  const signature = await args.walletClient.signTypedData({
    account: args.owner,
    domain,
    types,
    primaryType: 'Permit',
    message,
  });

  // viem returns 0x{r}{s}{v} — split it.
  const r = ('0x' + signature.slice(2, 66)) as Hex;
  const s = ('0x' + signature.slice(66, 130)) as Hex;
  const v = parseInt(signature.slice(130, 132), 16);
  return { v, r, s, deadline };
}
