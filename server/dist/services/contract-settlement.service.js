"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractSettlementService = void 0;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const logger_1 = require("../utils/logger");
// Import contract ABI (we'll need to generate this)
const blackjack_1 = require("../abi/blackjack");
class ContractSettlementService {
    dbService;
    publicClient;
    walletClient;
    contractAddress;
    constructor(dbService, privateKey) {
        this.dbService = dbService;
        // Initialize Viem clients
        this.publicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com')
        });
        if (privateKey) {
            const account = (0, accounts_1.privateKeyToAccount)(privateKey);
            this.walletClient = (0, viem_1.createWalletClient)({
                account,
                chain: chains_1.pulsechain,
                transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com')
            });
        }
        this.contractAddress = (process.env.BLACKJACK_CONTRACT_ADDRESS || '0x444f0714Bd297B17FD717d0824B95cA1E48352dd');
        logger_1.logger.info('Contract settlement service initialized', {
            contractAddress: this.contractAddress,
            hasWallet: !!this.walletClient
        });
    }
    /**
     * Settle a game result on-chain
     */
    async settleGame(request) {
        try {
            if (!this.walletClient) {
                logger_1.logger.warn('No wallet configured for settlement, storing for manual processing');
                return await this.storeSettlementForManualProcessing(request);
            }
            logger_1.logger.info('Settling game on-chain', {
                gameId: request.gameId,
                playerAddress: request.playerAddress,
                amount: request.amount.toString()
            });
            // Prepare settlement data
            const settlementId = await this.dbService.createSettlement(request.gameId, request.playerAddress, request.amount);
            // Call settleGame on the contract
            const hash = await this.walletClient.writeContract({
                address: this.contractAddress,
                abi: blackjack_1.blackjackAbi,
                functionName: 'settleGame',
                args: [
                    request.playerAddress,
                    request.amount,
                    request.gameHash,
                    JSON.stringify(request.gameData)
                ]
            });
            logger_1.logger.info('Settlement transaction sent', {
                gameId: request.gameId,
                transactionHash: hash,
                settlementId
            });
            // Wait for confirmation
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status === 'success') {
                // Update settlement status
                await this.dbService.updateSettlementStatus(settlementId, hash, 'confirmed');
                logger_1.logger.info('Settlement confirmed', {
                    gameId: request.gameId,
                    transactionHash: hash,
                    blockNumber: receipt.blockNumber
                });
                return { success: true, transactionHash: hash };
            }
            else {
                // Update settlement status to failed
                await this.dbService.updateSettlementStatus(settlementId, hash, 'failed');
                logger_1.logger.error('Settlement transaction failed', {
                    gameId: request.gameId,
                    transactionHash: hash
                });
                return { success: false, transactionHash: hash, error: 'Transaction failed' };
            }
        }
        catch (error) {
            logger_1.logger.error('Error settling game on-chain:', error);
            // Store for manual processing
            return await this.storeSettlementForManualProcessing(request);
        }
    }
    /**
     * Store settlement for manual processing when automatic settlement fails
     */
    async storeSettlementForManualProcessing(request) {
        try {
            await this.dbService.createSettlement(request.gameId, request.playerAddress, request.amount);
            logger_1.logger.info('Settlement stored for manual processing', {
                gameId: request.gameId,
                playerAddress: request.playerAddress,
                amount: request.amount.toString()
            });
            return { success: true };
        }
        catch (error) {
            logger_1.logger.error('Error storing settlement for manual processing:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }
    /**
     * Check contract balance
     */
    async getContractBalance() {
        try {
            const balance = await this.publicClient.getBalance({
                address: this.contractAddress
            });
            return balance;
        }
        catch (error) {
            logger_1.logger.error('Error getting contract balance:', error);
            return 0n;
        }
    }
    /**
     * Get player reserve balance
     */
    async getPlayerReserve(playerAddress) {
        try {
            const reserve = await this.publicClient.readContract({
                address: this.contractAddress,
                abi: blackjack_1.blackjackAbi,
                functionName: 'getPlayerReserve',
                args: [playerAddress]
            });
            return reserve;
        }
        catch (error) {
            logger_1.logger.error('Error getting player reserve:', error);
            return 0n;
        }
    }
    /**
     * Check if settlement is valid (has enough balance for payout)
     */
    async validateSettlement(request) {
        try {
            if (request.amount <= 0) {
                // Loss or push - always valid
                return { valid: true };
            }
            // Win - check if contract has enough balance
            const contractBalance = await this.getContractBalance();
            const requiredAmount = request.amount;
            if (contractBalance < requiredAmount) {
                return {
                    valid: false,
                    reason: `Insufficient contract balance. Required: ${(0, viem_1.formatEther)(requiredAmount)} PLS, Available: ${(0, viem_1.formatEther)(contractBalance)} PLS`
                };
            }
            return { valid: true };
        }
        catch (error) {
            logger_1.logger.error('Error validating settlement:', error);
            return { valid: false, reason: 'Validation error' };
        }
    }
    /**
     * Process pending settlements (for manual processing)
     */
    async processPendingSettlements() {
        try {
            // This would be called periodically to process pending settlements
            // For now, just return stats
            const pendingSettlements = await this.dbService.withTransaction(async (client) => {
                const result = await client.query('SELECT COUNT(*) as count FROM settlements WHERE status = $1', ['pending']);
                return result.rows[0].count;
            });
            logger_1.logger.info('Pending settlements check', { count: pendingSettlements });
            return { processed: 0, failed: 0 };
        }
        catch (error) {
            logger_1.logger.error('Error processing pending settlements:', error);
            return { processed: 0, failed: 1 };
        }
    }
    /**
     * Emergency withdraw from contract (admin function)
     */
    async emergencyWithdraw(amount, toAddress) {
        try {
            if (!this.walletClient) {
                return { success: false, error: 'No wallet configured' };
            }
            const hash = await this.walletClient.writeContract({
                address: this.contractAddress,
                abi: blackjack_1.blackjackAbi,
                functionName: 'emergencyWithdraw',
                args: [amount]
            });
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status === 'success') {
                logger_1.logger.info('Emergency withdrawal successful', {
                    amount: amount.toString(),
                    toAddress,
                    transactionHash: hash
                });
                return { success: true, transactionHash: hash };
            }
            else {
                return { success: false, error: 'Transaction failed' };
            }
        }
        catch (error) {
            logger_1.logger.error('Error performing emergency withdrawal:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }
    /**
     * Get contract statistics
     */
    async getContractStats() {
        try {
            const [balance, totalReserves, emergencyPaused] = await Promise.all([
                this.getContractBalance(),
                this.publicClient.readContract({
                    address: this.contractAddress,
                    abi: blackjack_1.blackjackAbi,
                    functionName: 'totalReserves'
                }),
                this.publicClient.readContract({
                    address: this.contractAddress,
                    abi: blackjack_1.blackjackAbi,
                    functionName: 'emergencyPaused'
                })
            ]);
            return {
                balance,
                totalReserves: totalReserves,
                emergencyPaused: emergencyPaused
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting contract stats:', error);
            return {
                balance: 0n,
                totalReserves: 0n,
                emergencyPaused: false
            };
        }
    }
}
exports.ContractSettlementService = ContractSettlementService;
//# sourceMappingURL=contract-settlement.service.js.map