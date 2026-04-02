"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoneyDatabaseAdapter = void 0;
class MoneyDatabaseAdapter {
    dbService;
    constructor(dbService) {
        this.dbService = dbService;
    }
    getExpiredPendingWithdrawals() {
        return this.dbService.getExpiredPendingWithdrawals();
    }
    markPendingWithdrawalCompleted(walletAddress, nonce, txHash) {
        return this.dbService.markPendingWithdrawalCompleted(walletAddress, nonce, txHash);
    }
    expireSinglePendingWithdrawal(walletAddress, nonce, amount) {
        return this.dbService.expireSinglePendingWithdrawal(walletAddress, nonce, amount);
    }
    getExpiredPendingForWallet(walletAddress) {
        return this.dbService.getExpiredPendingForWallet(walletAddress);
    }
    insertPendingDeposit(walletAddress, amountWei, txHash, blockNumber, confirmationsRequired) {
        return this.dbService.insertPendingDeposit(walletAddress, amountWei, txHash, blockNumber, confirmationsRequired);
    }
    getCreditedPendingDepositByTxHash(txHash) {
        return this.dbService.getCreditedPendingDepositByTxHash(txHash);
    }
    addPlayerBalance(walletAddress, amount) {
        return this.dbService.addPlayerBalance(walletAddress, amount);
    }
    getActivePendingWithdrawal(walletAddress) {
        return this.dbService.getActivePendingWithdrawal(walletAddress);
    }
    getPlayerBalance(walletAddress) {
        return this.dbService.getPlayerBalance(walletAddress);
    }
    enqueueHotWithdrawal(walletAddress, amountWei, netToUserWei, feeWei) {
        return this.dbService.enqueueHotWithdrawal(walletAddress, amountWei, netToUserWei, feeWei);
    }
    getHotWithdrawalJobById(jobId) {
        return this.dbService.getHotWithdrawalJobById(jobId);
    }
    getActiveHotWithdrawalJob(walletAddress) {
        return this.dbService.getActiveHotWithdrawalJob(walletAddress);
    }
    claimNextHotWithdrawalJob() {
        return this.dbService.claimNextHotWithdrawalJob();
    }
    updateHotWithdrawalJob(jobId, updates) {
        return this.dbService.updateHotWithdrawalJob(jobId, updates);
    }
    getHotWithdrawalJobsPendingConfirmation() {
        return this.dbService.getHotWithdrawalJobsPendingConfirmation();
    }
    addToBlackjackWithdrawnTotal(amount) {
        return this.dbService.addToBlackjackWithdrawnTotal(amount);
    }
    recordHotWalletWithdrawal(walletAddress, amount, txHash) {
        return this.dbService.recordHotWalletWithdrawal(walletAddress, amount, txHash);
    }
    getPendingDepositsForConfirmation() {
        return this.dbService.getPendingDepositsForConfirmation();
    }
    updatePendingDepositBlockNumber(jobId, blockNumber) {
        return this.dbService.updatePendingDepositBlockNumber(jobId, blockNumber);
    }
    creditPendingDeposit(jobId) {
        return this.dbService.creditPendingDeposit(jobId);
    }
    listPendingDeposits(limit, offset) {
        return this.dbService.listPendingDeposits(limit, offset);
    }
    listPendingWithdrawals(limit, offset) {
        return this.dbService.listPendingWithdrawals(limit, offset);
    }
    getPlayerTransactionHistory(walletAddress, limit, offset) {
        return this.dbService.getPlayerTransactionHistory(walletAddress, limit, offset);
    }
}
exports.MoneyDatabaseAdapter = MoneyDatabaseAdapter;
//# sourceMappingURL=money-database.adapter.js.map