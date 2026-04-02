import type { MoneyDatabaseQueries } from './database.service';
import type { MoneyDatabasePort } from './money-database.port';

export class MoneyDatabaseAdapter implements MoneyDatabasePort {
  constructor(private readonly dbService: MoneyDatabaseQueries) {}

  getExpiredPendingWithdrawals() {
    return this.dbService.getExpiredPendingWithdrawals();
  }

  markPendingWithdrawalCompleted(walletAddress: string, nonce: bigint, txHash?: string) {
    return this.dbService.markPendingWithdrawalCompleted(walletAddress, nonce, txHash);
  }

  expireSinglePendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint) {
    return this.dbService.expireSinglePendingWithdrawal(walletAddress, nonce, amount);
  }

  getExpiredPendingForWallet(walletAddress: string) {
    return this.dbService.getExpiredPendingForWallet(walletAddress);
  }

  insertPendingDeposit(
    walletAddress: string,
    amountWei: bigint,
    txHash: string,
    blockNumber: bigint | null,
    confirmationsRequired?: number,
  ) {
    return this.dbService.insertPendingDeposit(walletAddress, amountWei, txHash, blockNumber, confirmationsRequired);
  }

  getCreditedPendingDepositByTxHash(txHash: string) {
    return this.dbService.getCreditedPendingDepositByTxHash(txHash);
  }

  addPlayerBalance(walletAddress: string, amount: bigint) {
    return this.dbService.addPlayerBalance(walletAddress, amount);
  }

  getActivePendingWithdrawal(walletAddress: string) {
    return this.dbService.getActivePendingWithdrawal(walletAddress);
  }

  getPlayerBalance(walletAddress: string) {
    return this.dbService.getPlayerBalance(walletAddress);
  }

  enqueueHotWithdrawal(walletAddress: string, amountWei: bigint, netToUserWei: bigint, feeWei: bigint) {
    return this.dbService.enqueueHotWithdrawal(walletAddress, amountWei, netToUserWei, feeWei);
  }

  getHotWithdrawalJobById(jobId: string) {
    return this.dbService.getHotWithdrawalJobById(jobId);
  }

  getActiveHotWithdrawalJob(walletAddress: string) {
    return this.dbService.getActiveHotWithdrawalJob(walletAddress);
  }

  claimNextHotWithdrawalJob() {
    return this.dbService.claimNextHotWithdrawalJob();
  }

  updateHotWithdrawalJob(jobId: string, updates: { status: string; tx_hash?: string | null; error_message?: string | null }) {
    return this.dbService.updateHotWithdrawalJob(jobId, updates);
  }

  getHotWithdrawalJobsPendingConfirmation() {
    return this.dbService.getHotWithdrawalJobsPendingConfirmation();
  }

  addToBlackjackWithdrawnTotal(amount: bigint) {
    return this.dbService.addToBlackjackWithdrawnTotal(amount);
  }

  recordHotWalletWithdrawal(walletAddress: string, amount: bigint, txHash: string) {
    return this.dbService.recordHotWalletWithdrawal(walletAddress, amount, txHash);
  }

  getPendingDepositsForConfirmation() {
    return this.dbService.getPendingDepositsForConfirmation();
  }

  updatePendingDepositBlockNumber(jobId: string, blockNumber: bigint) {
    return this.dbService.updatePendingDepositBlockNumber(jobId, blockNumber);
  }

  creditPendingDeposit(jobId: string) {
    return this.dbService.creditPendingDeposit(jobId);
  }

  listPendingDeposits(limit?: number, offset?: number) {
    return this.dbService.listPendingDeposits(limit, offset);
  }

  listPendingWithdrawals(limit?: number, offset?: number) {
    return this.dbService.listPendingWithdrawals(limit, offset);
  }

  getPlayerTransactionHistory(walletAddress: string, limit?: number, offset?: number) {
    return this.dbService.getPlayerTransactionHistory(walletAddress, limit, offset);
  }
}
