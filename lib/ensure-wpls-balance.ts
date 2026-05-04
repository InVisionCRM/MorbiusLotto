import { erc20Abi, parseAbi } from 'viem';
import type { PublicClient } from 'viem';
import { WPLS_TOKEN_ADDRESS } from '@/lib/contracts';

const wplsDepositAbi = parseAbi(['function deposit() payable']);

/**
 * Ensures `owner` holds at least `requiredWei` WPLS by wrapping native PLS
 * for any shortfall. Returns the wrap tx hash if a wrap was performed,
 * otherwise null. Lets the wagmi popup gotcha be the caller's problem —
 * call this from the same user-gesture chain as the subsequent contract write.
 */
export async function ensureWplsBalance(params: {
  publicClient: PublicClient;
  writeContractAsync: (args: {
    address: `0x${string}`;
    abi: typeof wplsDepositAbi;
    functionName: 'deposit';
    value: bigint;
  }) => Promise<`0x${string}`>;
  owner: `0x${string}`;
  requiredWei: bigint;
}): Promise<`0x${string}` | null> {
  const { publicClient, writeContractAsync, owner, requiredWei } = params;
  const wpls = WPLS_TOKEN_ADDRESS as `0x${string}`;
  const balance = (await publicClient.readContract({
    address: wpls,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })) as bigint;

  if (balance >= requiredWei) return null;

  const shortfall = requiredWei - balance;
  const nativeBalance = await publicClient.getBalance({ address: owner });
  if (nativeBalance < shortfall) {
    throw new Error(
      `Insufficient PLS to wrap. Need ${shortfall.toString()} more beats but wallet has ${nativeBalance.toString()}.`,
    );
  }

  const hash = await writeContractAsync({
    address: wpls,
    abi: wplsDepositAbi,
    functionName: 'deposit',
    value: shortfall,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
