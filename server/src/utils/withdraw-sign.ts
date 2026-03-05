import { privateKeyToAccount } from 'viem/accounts';

const DOMAIN_NAME = 'Blackjack';
const DOMAIN_VERSION = '1';

export const MIN_WITHDRAWAL_WEI = BigInt('1000000000000000000'); // 1 MORBIUS

export interface WithdrawSignaturePayload {
  amount: string;
  nonce: string;
  expiryTimestamp: string;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

/**
 * Sign a withdrawal approval (EIP-712) for the Blackjack contract.
 * expiryTimestamp: Unix seconds; contract will revert if block.timestamp > expiryTimestamp.
 * Returns amount, nonce, expiryTimestamp, and signature components (v, r, s).
 */
export async function signWithdrawApproval(
  player: string,
  amount: bigint,
  nonce: bigint,
  expiryTimestamp: number,
  contractAddress: `0x${string}`,
  chainId: number,
  privateKey: `0x${string}`
): Promise<WithdrawSignaturePayload> {
  const account = privateKeyToAccount(privateKey);

  const domain = {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract: contractAddress,
  } as const;

  const types = {
    WithdrawApproval: [
      { name: 'player', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiryTimestamp', type: 'uint256' },
    ],
  } as const;

  const message = {
    player: player as `0x${string}`,
    amount,
    nonce,
    expiryTimestamp: BigInt(expiryTimestamp),
  };

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'WithdrawApproval',
    message,
  });

  // Signature is 0x + r (32 bytes) + s (32 bytes) + v (1 byte) = 130 hex chars + 0x
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    amount: amount.toString(),
    nonce: nonce.toString(),
    expiryTimestamp: String(expiryTimestamp),
    v,
    r,
    s,
  };
}
