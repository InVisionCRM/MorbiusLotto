import { privateKeyToAccount, sign } from 'viem/accounts';
import { keccak256, concat, encodeAbiParameters, stringToHex } from 'viem';

export const MIN_WITHDRAWAL_WEI = BigInt('1000000000000000000'); // 1 MORBIUS

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
    digest = keccak256(concat([prefix, domainSeparatorHex, structHash]));
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
    to: 'hex',
  });

  const r = (`0x${signature.slice(2, 66)}`) as `0x${string}`;
  const s = (`0x${signature.slice(66, 130)}`) as `0x${string}`;
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
