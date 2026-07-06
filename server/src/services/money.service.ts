import { createWalletClient, decodeEventLog, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { blackjackAbi } from '../abi/blackjack';
import { BLACKJACK_ADDRESS, MORBIUS_VAULT_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '../config/contracts';
import type {
  MoneyDatabasePort,
  PendingDepositAdminRow,
  PendingWithdrawalAdminRow,
  PlayerTransactionRow,
} from './money-database.port';
import { createPulsechainWalletClient, getPublicClient, readUsedWithdrawalNonce } from '../utils/chain-client';
import { logger } from '../utils/logger';
import {
  HOT_WITHDRAW_CONFIRMATION_TIMEOUT_MS,
  MIN_WITHDRAWAL_WEI,
  resolveDepositConfirmationsRequired,
} from '../utils/withdraw-sign';

const ERC20_BALANCE_OF_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

const ERC20_TRANSFER_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable' as const, inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const DEPOSIT_PLS_ABI = [
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'morbiusAmount', type: 'uint256', indexed: false },
      { name: 'plsAmount', type: 'uint256', indexed: false },
    ],
  },
] as const;

const DEPOSIT_MORBIUS_ABI = [
  { type: 'event', name: 'DepositMORBIUS', inputs: [{ name: 'player', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
] as const;

type HotWalletClient = ReturnType<typeof createWalletClient>;

interface FeeRecipients {
  distributionRecipient: `0x${string}`;
  burnAddress: `0x${string}`;
  platformFeeRecipient: `0x${string}`;
  lpDistributionRecipient: `0x${string}`;
}

export class MoneyService {
  private readonly publicClient = getPublicClient();
  private readonly blackjackContractAddress = BLACKJACK_ADDRESS;
  /**
   * Addresses a deposit tx may be sent to and still be credited: the current vault plus the V7
   * reserve contract (so in-flight deposits during migration still credit). Deduped — when the
   * vault env is unset, MORBIUS_VAULT_ADDRESS === BLACKJACK_ADDRESS and this is a single address.
   */
  private readonly depositTargetAddressesLower: ReadonlySet<string> = new Set(
    [MORBIUS_VAULT_ADDRESS, BLACKJACK_ADDRESS].map((a) => a.toLowerCase())
  );
  private feeRecipientsCache: { value: FeeRecipients; cachedAt: number } | null = null;

  constructor(private readonly dbService: MoneyDatabasePort) {}

  private getHotWalletClient(): HotWalletClient | null {
    const pk = process.env.HOT_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
    return createPulsechainWalletClient(pk) as HotWalletClient | null;
  }

  private normalizeAddress(rawAddress: string): string {
    const normalized = rawAddress.toLowerCase().startsWith('0x')
      ? rawAddress.toLowerCase()
      : `0x${rawAddress.toLowerCase()}`;

    if (normalized.length !== 42) {
      throw new Error('Invalid address');
    }

    return normalized;
  }

  private async isWithdrawalNonceUsed(nonce: bigint): Promise<boolean> {
    return readUsedWithdrawalNonce(this.blackjackContractAddress, nonce, this.publicClient);
  }

  private async getFeeRecipients(): Promise<FeeRecipients> {
    const now = Date.now();
    if (this.feeRecipientsCache && now - this.feeRecipientsCache.cachedAt < 60_000) {
      return this.feeRecipientsCache.value;
    }

    const [distributionRecipient, burnAddress, platformFeeRecipient, lpDistributionRecipient] = await Promise.all([
      this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjackAbi, functionName: 'distributionRecipient' }) as Promise<`0x${string}`>,
      this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjackAbi, functionName: 'burnAddress' }) as Promise<`0x${string}`>,
      this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjackAbi, functionName: 'platformFeeRecipient' }) as Promise<`0x${string}`>,
      this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjackAbi, functionName: 'lpDistributionRecipient' }) as Promise<`0x${string}`>,
    ]);

    const value = {
      distributionRecipient,
      burnAddress,
      platformFeeRecipient,
      lpDistributionRecipient,
    };
    this.feeRecipientsCache = { value, cachedAt: now };
    return value;
  }

  async verifySettlementSigner(): Promise<void> {
    const settlementKey = process.env.SETTLEMENT_PRIVATE_KEY as `0x${string}` | undefined;
    if (!settlementKey) {
      logger.info('SETTLEMENT_PRIVATE_KEY not set — hot-wallet withdrawals do not require it; legacy contract flows might');
      return;
    }

    try {
      const signerAccount = privateKeyToAccount(settlementKey);
      const onChainAuthorizedServer = await this.publicClient.readContract({
        address: this.blackjackContractAddress,
        abi: blackjackAbi,
        functionName: 'authorizedServer',
      }) as string;

      if (signerAccount.address.toLowerCase() !== onChainAuthorizedServer.toLowerCase()) {
        logger.error('CRITICAL: SETTLEMENT_PRIVATE_KEY does not match contract authorizedServer!', {
          signerAddress: signerAccount.address,
          contractAuthorizedServer: onChainAuthorizedServer,
          contract: this.blackjackContractAddress,
        });
        return;
      }

      logger.info('Withdrawal signer verified: matches contract authorizedServer', {
        signerAddress: signerAccount.address,
      });
    } catch (err) {
      logger.warn('Could not verify SETTLEMENT_PRIVATE_KEY against contract authorizedServer', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async reconcileExpiredPendingWithdrawals(reason: 'startup' | 'interval'): Promise<void> {
    const expired = await this.dbService.getExpiredPendingWithdrawals();
    if (expired.length === 0) return;

    let refundedCount = 0;
    let completedCount = 0;

    for (const row of expired) {
      try {
        const nonceUsed = await this.isWithdrawalNonceUsed(BigInt(row.nonce));
        if (nonceUsed) {
          await this.dbService.markPendingWithdrawalCompleted(row.wallet_address, BigInt(row.nonce));
          completedCount++;
          logger.warn(`${reason}: pending withdrawal was completed on-chain — marked completed (no refund)`, {
            address: row.wallet_address,
            nonce: row.nonce,
            amount: row.amount,
          });
          continue;
        }

        await this.dbService.expireSinglePendingWithdrawal(row.wallet_address, BigInt(row.nonce), BigInt(row.amount));
        refundedCount++;
      } catch (error) {
        logger.error(`${reason}: failed to check pending withdrawal nonce on-chain — skipping`, {
          address: row.wallet_address,
          nonce: row.nonce,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (refundedCount > 0) {
      logger.info(`${reason}: refunded ${refundedCount} expired pending withdrawal(s)`);
    }
    if (completedCount > 0) {
      logger.info(`${reason}: marked ${completedCount} pending withdrawal(s) as completed`);
    }
  }

  async refundExpiredPendingWithdrawal(rawAddress: string, force: boolean): Promise<{
    ok: true;
    refunded?: string;
    address: string;
    status: 'refunded' | 'marked_completed';
    message?: string;
  }> {
    const normalizedAddress = this.normalizeAddress(rawAddress);
    const pending = await this.dbService.getExpiredPendingForWallet(normalizedAddress);
    if (!pending) {
      throw new Error('No expired pending withdrawal found for this address. Wait until the signature has expired (~15 min) or the balance was already refunded.');
    }

    if (!force) {
      try {
        const nonceUsed = await this.isWithdrawalNonceUsed(BigInt(pending.nonce));
        if (nonceUsed) {
          await this.dbService.markPendingWithdrawalCompleted(normalizedAddress, BigInt(pending.nonce));
          return {
            ok: true,
            address: normalizedAddress,
            status: 'marked_completed',
            message: 'This withdrawal was already completed on-chain (nonce used). Balance was not refunded; it was marked completed.',
          };
        }
      } catch (rpcErr) {
        throw new Error(
          `Could not verify on-chain whether the withdrawal was used. If you have verified no tx exists, retry with force=true. Detail: ${rpcErr instanceof Error ? rpcErr.message : String(rpcErr)}`,
        );
      }
    } else {
      logger.warn('Admin force-refund expired pending (on-chain check skipped)', {
        address: normalizedAddress,
        nonce: pending.nonce,
        amount: pending.amount,
      });
    }

    await this.dbService.expireSinglePendingWithdrawal(normalizedAddress, BigInt(pending.nonce), BigInt(pending.amount));
    logger.info('Admin refunded expired pending withdrawal', { address: normalizedAddress, nonce: pending.nonce, amount: pending.amount });
    return {
      ok: true,
      refunded: pending.amount,
      address: normalizedAddress,
      status: 'refunded',
    };
  }

  async recordPendingDeposit(walletAddress: string, txHash: string): Promise<void> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      throw new Error('Invalid wallet address');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new Error('Invalid tx hash');
    }

    const confirmationsRequired = resolveDepositConfirmationsRequired(process.env.DEPOSIT_CONFIRMATIONS_REQUIRED);
    const hash = txHash as `0x${string}`;
    const walletLower = walletAddress.toLowerCase();

    let receipt: Awaited<ReturnType<typeof this.publicClient.getTransactionReceipt>>;
    try {
      receipt = await this.publicClient.getTransactionReceipt({ hash });
    } catch {
      throw new Error('Transaction not found or not yet mined');
    }

    if (receipt.status !== 'success') {
      throw new Error('Transaction reverted on-chain');
    }

    let txTo: `0x${string}`;
    try {
      const tx = await this.publicClient.getTransaction({ hash });
      if (!tx.to) {
        throw new Error('Invalid transaction (no contract target)');
      }
      txTo = getAddress(tx.to);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid transaction')) {
        throw error;
      }
      throw new Error('Could not load transaction');
    }

    if (!this.depositTargetAddressesLower.has(txTo.toLowerCase())) {
      throw new Error('Transaction not sent to the deposit contract');
    }

    let amountBigInt: bigint | null = null;
    for (const log of receipt.logs) {
      if (!log.address || !this.depositTargetAddressesLower.has(log.address.toLowerCase())) continue;

      try {
        const decoded = decodeEventLog({
          abi: DEPOSIT_MORBIUS_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'DepositMORBIUS') {
          const args = decoded.args as { player: string; amount: bigint };
          if (args.player?.toLowerCase() === walletLower) {
            amountBigInt = args.amount;
            break;
          }
        }
      } catch {
        // Try the legacy mixed PLS/MORBIUS deposit event next.
      }

      try {
        const decoded = decodeEventLog({
          abi: DEPOSIT_PLS_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'Deposit') {
          const args = decoded.args as { player: string; morbiusAmount: bigint; plsAmount: bigint };
          if (args.player?.toLowerCase() === walletLower) {
            amountBigInt = args.morbiusAmount;
            break;
          }
        }
      } catch {
        // Not a supported deposit log.
      }
    }

    if (amountBigInt == null || amountBigInt <= 0n) {
      throw new Error('Could not verify deposit amount on-chain (no matching Deposit or DepositMORBIUS for this wallet)');
    }

    await this.dbService.insertPendingDeposit(walletAddress, amountBigInt, txHash, receipt.blockNumber, confirmationsRequired);
  }

  async creditDepositShortfall(txHash: string, correctAmountWei: string): Promise<{ wallet: string; shortfallCredited: string }> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new Error('Invalid tx hash');
    }

    let correctBigInt: bigint;
    try {
      correctBigInt = BigInt(correctAmountWei);
    } catch {
      throw new Error('Invalid correctAmountWei');
    }

    if (correctBigInt <= 0n) {
      throw new Error('correctAmountWei must be positive');
    }

    const row = await this.dbService.getCreditedPendingDepositByTxHash(txHash);
    if (!row) {
      throw new Error('No credited deposit found for this tx hash');
    }

    const creditedWei = BigInt(row.amount_wei);
    const shortfall = correctBigInt - creditedWei;
    if (shortfall <= 0n) {
      throw new Error('No shortfall; correctAmountWei must be greater than already credited amount');
    }

    await this.dbService.addPlayerBalance(row.wallet_address, shortfall);
    logger.info('Deposit shortfall credited', {
      txHash,
      wallet: row.wallet_address,
      creditedBefore: row.amount_wei,
      shortfallAdded: shortfall.toString(),
    });

    return {
      wallet: row.wallet_address,
      shortfallCredited: shortfall.toString(),
    };
  }

  async getAuthoritativeBalance(rawAddress: string): Promise<string> {
    const normalizedAddress = this.normalizeAddress(rawAddress);
    const pending = await this.dbService.getActivePendingWithdrawal(normalizedAddress);

    if (pending) {
      try {
        const nonceUsed = await this.isWithdrawalNonceUsed(BigInt(pending.nonce));
        if (nonceUsed) {
          await this.dbService.markPendingWithdrawalCompleted(normalizedAddress, BigInt(pending.nonce));
          logger.info('Resolved pending withdrawal during balance read', {
            address: normalizedAddress,
            nonce: pending.nonce,
          });
        }
      } catch (error) {
        logger.warn('Could not check pending withdrawal nonce during balance read', {
          address: normalizedAddress,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const balance = await this.dbService.getPlayerBalance(normalizedAddress);
    return balance.toString();
  }

  async enqueueWithdrawal(rawAddress: string, amount: string | number | bigint | null | undefined): Promise<{ jobId: string; status: 'queued'; message: string }> {
    const normalizedAddress = this.normalizeAddress(rawAddress);
    const amountBigInt = amount != null ? BigInt(String(amount)) : 0n;
    if (amountBigInt < MIN_WITHDRAWAL_WEI) {
      throw new Error(`Amount required (min ${MIN_WITHDRAWAL_WEI.toString()} wei)`);
    }

    const walletClient = this.getHotWalletClient();
    if (!walletClient?.account) {
      logger.error('Hot wallet not configured (HOT_WALLET_PRIVATE_KEY)');
      throw new Error('Withdrawals temporarily unavailable');
    }

    const feeBps = 500n;
    const feeAmount = (amountBigInt * feeBps) / 10000n;
    const netToUser = amountBigInt - feeAmount;
    const hotMorbiusBalance = await this.publicClient.readContract({
      address: MORBIUS_TOKEN_ADDRESS,
      abi: ERC20_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [walletClient.account.address],
    }) as bigint;

    if (hotMorbiusBalance < netToUser) {
      throw new Error('Withdrawals are temporarily limited (hot wallet liquidity). Try a smaller amount or later.');
    }

    const jobId = await this.dbService.enqueueHotWithdrawal(
      normalizedAddress,
      amountBigInt,
      netToUser,
      feeAmount,
    );

    return {
      jobId,
      status: 'queued',
      message: 'Queued',
    };
  }

  async getWithdrawalStatus(jobId: string): Promise<{ jobId: string; status: string; txHash?: string; error?: string; netToUser?: string } | null> {
    const job = await this.dbService.getHotWithdrawalJobById(jobId);
    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status,
      txHash: job.tx_hash ?? undefined,
      error: job.error_message ?? undefined,
      netToUser: job.net_to_user_wei ?? undefined,
    };
  }

  async getPendingWithdrawal(rawAddress: string): Promise<{ jobId: string; status: string; txHash?: string; error?: string; netToUser?: string } | null> {
    const normalizedAddress = this.normalizeAddress(rawAddress);
    const job = await this.dbService.getActiveHotWithdrawalJob(normalizedAddress);
    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status,
      txHash: job.tx_hash ?? undefined,
      error: job.error_message ?? undefined,
      netToUser: job.net_to_user_wei ?? undefined,
    };
  }

  async listPendingTransfers(
    type: 'deposits' | 'withdrawals',
    limit: number,
    offset: number,
  ): Promise<PendingDepositAdminRow[] | PendingWithdrawalAdminRow[]> {
    if (type === 'deposits') {
      return this.dbService.listPendingDeposits(limit, offset);
    }
    return this.dbService.listPendingWithdrawals(limit, offset);
  }

  async getPlayerTransactions(rawAddress: string, limit: number, offset: number): Promise<PlayerTransactionRow[]> {
    const normalizedAddress = this.normalizeAddress(rawAddress);
    return this.dbService.getPlayerTransactionHistory(normalizedAddress, limit, offset);
  }

  async processHotWithdrawalQueue(): Promise<void> {
    const walletClient = this.getHotWalletClient();
    if (!walletClient?.account) return;

    const job = await this.dbService.claimNextHotWithdrawalJob();
    if (!job) return;

    try {
      const txHash = await walletClient.writeContract({
        account: walletClient.account,
        chain: pulsechain,
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [job.wallet_address as `0x${string}`, BigInt(job.net_to_user_wei)],
      });
      await this.dbService.updateHotWithdrawalJob(job.id, { status: 'pending_confirmation', tx_hash: txHash });
      logger.info('Hot withdrawal broadcast', { jobId: job.id, txHash, address: job.wallet_address });
    } catch (error: any) {
      const errMsg = error?.message?.slice(0, 500) ?? String(error);
      await this.dbService.updateHotWithdrawalJob(job.id, { status: 'failed', error_message: errMsg });
      logger.error('Hot withdrawal broadcast failed (no refund — contact support)', { jobId: job.id, error: errMsg });
    }
  }

  private async distributeWithdrawalFee(jobId: string, feeWei: bigint, walletClient: HotWalletClient): Promise<void> {
    if (!walletClient.account || feeWei <= 0n) return;

    try {
      const recipients = await this.getFeeRecipients();
      const payouts = [
        { to: recipients.distributionRecipient, amount: (feeWei * 125n) / 500n, label: 'distributionRecipient' },
        { to: recipients.burnAddress, amount: (feeWei * 50n) / 500n, label: 'burnAddress' },
        { to: recipients.platformFeeRecipient, amount: (feeWei * 175n) / 500n, label: 'platformFeeRecipient' },
        { to: recipients.lpDistributionRecipient, amount: (feeWei * 150n) / 500n, label: 'lpDistributionRecipient' },
      ];

      for (const payout of payouts) {
        if (payout.amount <= 0n || payout.to === '0x0000000000000000000000000000000000000000') continue;
        try {
          await walletClient.writeContract({
            account: walletClient.account,
            chain: pulsechain,
            address: MORBIUS_TOKEN_ADDRESS,
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [payout.to, payout.amount],
          });
          logger.info('Hot withdrawal fee sent', { jobId, to: payout.label, amount: payout.amount.toString() });
        } catch (error) {
          logger.error('Hot withdrawal fee transfer failed', { jobId, to: payout.label, error });
        }
      }
    } catch (error) {
      logger.error('Hot withdrawal fee distribution failed (reading recipients)', { jobId, error });
    }
  }

  async confirmHotWithdrawals(): Promise<void> {
    const jobs = await this.dbService.getHotWithdrawalJobsPendingConfirmation();
    const timeoutMs = HOT_WITHDRAW_CONFIRMATION_TIMEOUT_MS;

    for (const job of jobs) {
      const ageMs = Date.now() - new Date(job.updated_at).getTime();
      const markDropped = async () => {
        await this.dbService.updateHotWithdrawalJob(job.id, {
          status: 'failed',
          error_message: 'Transaction not found after 15 minutes (dropped?) — contact support',
        });
        logger.warn('Hot withdrawal dropped/timeout (no refund — contact support)', { jobId: job.id, txHash: job.tx_hash });
      };

      try {
        const receipt = await this.publicClient.getTransactionReceipt({ hash: job.tx_hash as `0x${string}` });
        if (!receipt) {
          if (ageMs > timeoutMs) await markDropped();
          continue;
        }

        if (receipt.status !== 'success') {
          await this.dbService.updateHotWithdrawalJob(job.id, {
            status: 'failed',
            error_message: 'Transaction reverted on-chain — contact support',
          });
          logger.warn('Hot withdrawal reverted on-chain (no refund — contact support)', { jobId: job.id, txHash: job.tx_hash });
          continue;
        }

        await this.dbService.updateHotWithdrawalJob(job.id, { status: 'completed' });
        await this.dbService.addToBlackjackWithdrawnTotal(BigInt(job.amount_wei));
        await this.dbService.recordHotWalletWithdrawal(job.wallet_address, BigInt(job.amount_wei), job.tx_hash);
        logger.info('Hot withdrawal confirmed', { jobId: job.id, txHash: job.tx_hash });

        const walletClient = this.getHotWalletClient();
        const feeWei = (BigInt(job.amount_wei) * 500n) / 10000n;
        if (walletClient) {
          await this.distributeWithdrawalFee(job.id, feeWei, walletClient);
        }
      } catch {
        if (ageMs > timeoutMs) {
          await markDropped();
        }
      }
    }
  }

  async confirmPendingDeposits(): Promise<void> {
    const currentBlock = await this.publicClient.getBlockNumber();
    const pending = await this.dbService.getPendingDepositsForConfirmation();

    for (const row of pending) {
      let blockNumber = row.block_number != null ? BigInt(row.block_number) : null;
      if (blockNumber == null) {
        try {
          const receipt = await this.publicClient.getTransactionReceipt({ hash: row.tx_hash as `0x${string}` });
          if (receipt?.blockNumber != null) {
            blockNumber = receipt.blockNumber;
            await this.dbService.updatePendingDepositBlockNumber(row.id, blockNumber);
          }
        } catch {
          continue;
        }
      }

      if (blockNumber == null) continue;
      const confirmations = Number(currentBlock - blockNumber);
      if (confirmations < row.confirmations_required) continue;

      const credited = await this.dbService.creditPendingDeposit(row.id);
      if (credited) {
        logger.info('Deposit confirmed and credited', {
          wallet: row.wallet_address,
          txHash: row.tx_hash,
          confirmations,
        });
      }
    }
  }
}
