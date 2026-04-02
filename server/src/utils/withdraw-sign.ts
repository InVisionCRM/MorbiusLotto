import { privateKeyToAccount, sign } from 'viem/accounts';
import { keccak256, concat, encodeAbiParameters, stringToHex, padHex } from 'viem';

export const MIN_WITHDRAWAL_WEI = BigInt('1000000000000000000'); // 1 MORBIUS
export const HOT_WITHDRAW_CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;
export const HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS = 30_000;
export const PENDING_DEPOSIT_CONFIRM_WORKER_INTERVAL_MS = 10_000;
export const HOT_WITHDRAW_QUEUE_INTERVAL_MS_DEFAULT = 3000;

export interface WithdrawSignaturePayload {
  amount: string;
  nonce: string;
  expiryTimestamp: string;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

// Must match contract: keccak256("WithdrawApproval(address player,uint256 amount,uint256 nonce,uint256 expiryTimestamp)")
const WITHDRAW_APPROVAL_TYPE_STRING =
  'WithdrawApproval(address player,uint256 amount,uint256 nonce,uint256 expiryTimestamp)';

export function resolveDepositConfirmationsRequired(rawValue?: string): number {
  const parsed = Number(rawValue ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return Math.floor(parsed);
}

export function resolveHotWithdrawQueueIntervalMs(rawValue?: string): number {
  const parsed = Number(rawValue ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return HOT_WITHDRAW_QUEUE_INTERVAL_MS_DEFAULT;
  return Math.floor(parsed);
}

/**
 * Build EIP-712 digest exactly as BlackjackV2 contract does, then sign it.
 * When domainSeparatorHex is provided (read from contract), the signature is guaranteed
 * to verify on-chain. Use this when signTypedData produces a different encoding.
 */
export async function signWithdrawApproval(
  player: string,
  amount: bigint,
  nonce: bigint,
  expiryTimestamp: number,
  contractAddress: `0x${string}`,
  chainId: number,
  privateKey: `0x${string}`,
  domainSeparatorHex?: `0x${string}`
): Promise<WithdrawSignaturePayload> {
  const account = privateKeyToAccount(privateKey);
  const expiryBig = BigInt(expiryTimestamp);

  // Normalize player to lowercase 0x + 40 hex (contract uses msg.sender, same 20 bytes)
  const playerNorm =
    player.toLowerCase().startsWith('0x') ? player.toLowerCase() : `0x${player.toLowerCase()}`;

  let digest: `0x${string}`;

  if (domainSeparatorHex) {
    // Build digest exactly as contract: digest = keccak256("\x19\x01" || domainSeparator || structHash)
    // Ensure 32-byte domain separator (RPC may return shortened hex)
    const domainSep32 = padHex(domainSeparatorHex, { size: 32, dir: 'left' });
    const typeHash = keccak256(stringToHex(WITHDRAW_APPROVAL_TYPE_STRING));
    const encodedStruct = encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [typeHash, playerNorm as `0x${string}`, amount, nonce, expiryBig]
    );
    const structHash = keccak256(encodedStruct);
    const prefix = '0x1901' as const;
    digest = keccak256(concat([prefix, domainSep32, structHash]));
  } else {
    // Fallback: use signTypedData (may differ from contract if viem encoding differs)
    const domain = {
      name: 'Blackjack',
      version: '1',
      chainId,
      verifyingContract: (contractAddress.slice(0, 2) + contractAddress.slice(2).toLowerCase()) as `0x${string}`,
    };
    const types = {
      WithdrawApproval: [
        { name: 'player', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expiryTimestamp', type: 'uint256' },
      ],
    };
    const message = { player: playerNorm as `0x${string}`, amount, nonce, expiryTimestamp: expiryBig };
    digest = (await import('viem')).hashTypedData({
      domain,
      types,
      primaryType: 'WithdrawApproval',
      message,
    });
  }

  const signature = await sign({
    hash: digest,
    privateKey,
  });

  const r = signature.r;
  const s = signature.s;
  // ecrecover expects v = 27 or 28; some signers return recovery id 0/1
  let v = Number(signature.v);
  if (v < 27) v += 27;

  return {
    amount: amount.toString(),
    nonce: nonce.toString(),
    expiryTimestamp: String(expiryTimestamp),
    v,
    r,
    s,
  };
}
