"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoneyService = void 0;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const blackjack_1 = require("../abi/blackjack");
const contracts_1 = require("../config/contracts");
const chain_client_1 = require("../utils/chain-client");
const logger_1 = require("../utils/logger");
const withdraw_sign_1 = require("../utils/withdraw-sign");
const ERC20_BALANCE_OF_ABI = [
    { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
];
const ERC20_TRANSFER_ABI = [
    { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
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
];
const DEPOSIT_MORBIUS_ABI = [
    { type: 'event', name: 'DepositMORBIUS', inputs: [{ name: 'player', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
];
class MoneyService {
    dbService;
    publicClient = (0, chain_client_1.getPublicClient)();
    blackjackContractAddress = contracts_1.BLACKJACK_ADDRESS;
    feeRecipientsCache = null;
    constructor(dbService) {
        this.dbService = dbService;
    }
    getHotWalletClient() {
        const pk = process.env.HOT_WALLET_PRIVATE_KEY;
        return (0, chain_client_1.createPulsechainWalletClient)(pk);
    }
    normalizeAddress(rawAddress) {
        const normalized = rawAddress.toLowerCase().startsWith('0x')
            ? rawAddress.toLowerCase()
            : `0x${rawAddress.toLowerCase()}`;
        if (normalized.length !== 42) {
            throw new Error('Invalid address');
        }
        return normalized;
    }
    async isWithdrawalNonceUsed(nonce) {
        return (0, chain_client_1.readUsedWithdrawalNonce)(this.blackjackContractAddress, nonce, this.publicClient);
    }
    async getFeeRecipients() {
        const now = Date.now();
        if (this.feeRecipientsCache && now - this.feeRecipientsCache.cachedAt < 60_000) {
            return this.feeRecipientsCache.value;
        }
        const [distributionRecipient, burnAddress, platformFeeRecipient, lpDistributionRecipient] = await Promise.all([
            this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjack_1.blackjackAbi, functionName: 'distributionRecipient' }),
            this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjack_1.blackjackAbi, functionName: 'burnAddress' }),
            this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjack_1.blackjackAbi, functionName: 'platformFeeRecipient' }),
            this.publicClient.readContract({ address: this.blackjackContractAddress, abi: blackjack_1.blackjackAbi, functionName: 'lpDistributionRecipient' }),
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
    async verifySettlementSigner() {
        const settlementKey = process.env.SETTLEMENT_PRIVATE_KEY;
        if (!settlementKey) {
            logger_1.logger.info('SETTLEMENT_PRIVATE_KEY not set — hot-wallet withdrawals do not require it; legacy contract flows might');
            return;
        }
        try {
            const signerAccount = (0, accounts_1.privateKeyToAccount)(settlementKey);
            const onChainAuthorizedServer = await this.publicClient.readContract({
                address: this.blackjackContractAddress,
                abi: blackjack_1.blackjackAbi,
                functionName: 'authorizedServer',
            });
            if (signerAccount.address.toLowerCase() !== onChainAuthorizedServer.toLowerCase()) {
                logger_1.logger.error('CRITICAL: SETTLEMENT_PRIVATE_KEY does not match contract authorizedServer!', {
                    signerAddress: signerAccount.address,
                    contractAuthorizedServer: onChainAuthorizedServer,
                    contract: this.blackjackContractAddress,
                });
                return;
            }
            logger_1.logger.info('Withdrawal signer verified: matches contract authorizedServer', {
                signerAddress: signerAccount.address,
            });
        }
        catch (err) {
            logger_1.logger.warn('Could not verify SETTLEMENT_PRIVATE_KEY against contract authorizedServer', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    async reconcileExpiredPendingWithdrawals(reason) {
        const expired = await this.dbService.getExpiredPendingWithdrawals();
        if (expired.length === 0)
            return;
        let refundedCount = 0;
        let completedCount = 0;
        for (const row of expired) {
            try {
                const nonceUsed = await this.isWithdrawalNonceUsed(BigInt(row.nonce));
                if (nonceUsed) {
                    await this.dbService.markPendingWithdrawalCompleted(row.wallet_address, BigInt(row.nonce));
                    completedCount++;
                    logger_1.logger.warn(`${reason}: pending withdrawal was completed on-chain — marked completed (no refund)`, {
                        address: row.wallet_address,
                        nonce: row.nonce,
                        amount: row.amount,
                    });
                    continue;
                }
                await this.dbService.expireSinglePendingWithdrawal(row.wallet_address, BigInt(row.nonce), BigInt(row.amount));
                refundedCount++;
            }
            catch (error) {
                logger_1.logger.error(`${reason}: failed to check pending withdrawal nonce on-chain — skipping`, {
                    address: row.wallet_address,
                    nonce: row.nonce,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        if (refundedCount > 0) {
            logger_1.logger.info(`${reason}: refunded ${refundedCount} expired pending withdrawal(s)`);
        }
        if (completedCount > 0) {
            logger_1.logger.info(`${reason}: marked ${completedCount} pending withdrawal(s) as completed`);
        }
    }
    async refundExpiredPendingWithdrawal(rawAddress, force) {
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
            }
            catch (rpcErr) {
                throw new Error(`Could not verify on-chain whether the withdrawal was used. If you have verified no tx exists, retry with force=true. Detail: ${rpcErr instanceof Error ? rpcErr.message : String(rpcErr)}`);
            }
        }
        else {
            logger_1.logger.warn('Admin force-refund expired pending (on-chain check skipped)', {
                address: normalizedAddress,
                nonce: pending.nonce,
                amount: pending.amount,
            });
        }
        await this.dbService.expireSinglePendingWithdrawal(normalizedAddress, BigInt(pending.nonce), BigInt(pending.amount));
        logger_1.logger.info('Admin refunded expired pending withdrawal', { address: normalizedAddress, nonce: pending.nonce, amount: pending.amount });
        return {
            ok: true,
            refunded: pending.amount,
            address: normalizedAddress,
            status: 'refunded',
        };
    }
    async recordPendingDeposit(walletAddress, txHash) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
            throw new Error('Invalid wallet address');
        }
        if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
            throw new Error('Invalid tx hash');
        }
        const confirmationsRequired = (0, withdraw_sign_1.resolveDepositConfirmationsRequired)(process.env.DEPOSIT_CONFIRMATIONS_REQUIRED);
        const hash = txHash;
        const blackjackAddr = (0, viem_1.getAddress)(this.blackjackContractAddress);
        const walletLower = walletAddress.toLowerCase();
        let receipt;
        try {
            receipt = await this.publicClient.getTransactionReceipt({ hash });
        }
        catch {
            throw new Error('Transaction not found or not yet mined');
        }
        if (receipt.status !== 'success') {
            throw new Error('Transaction reverted on-chain');
        }
        let txTo;
        try {
            const tx = await this.publicClient.getTransaction({ hash });
            if (!tx.to) {
                throw new Error('Invalid transaction (no contract target)');
            }
            txTo = (0, viem_1.getAddress)(tx.to);
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith('Invalid transaction')) {
                throw error;
            }
            throw new Error('Could not load transaction');
        }
        if (txTo !== blackjackAddr) {
            throw new Error('Transaction not sent to the Blackjack contract');
        }
        let amountBigInt = null;
        for (const log of receipt.logs) {
            if (log.address?.toLowerCase() !== this.blackjackContractAddress.toLowerCase())
                continue;
            try {
                const decoded = (0, viem_1.decodeEventLog)({
                    abi: DEPOSIT_MORBIUS_ABI,
                    data: log.data,
                    topics: log.topics,
                });
                if (decoded.eventName === 'DepositMORBIUS') {
                    const args = decoded.args;
                    if (args.player?.toLowerCase() === walletLower) {
                        amountBigInt = args.amount;
                        break;
                    }
                }
            }
            catch {
                // Try the legacy mixed PLS/MORBIUS deposit event next.
            }
            try {
                const decoded = (0, viem_1.decodeEventLog)({
                    abi: DEPOSIT_PLS_ABI,
                    data: log.data,
                    topics: log.topics,
                });
                if (decoded.eventName === 'Deposit') {
                    const args = decoded.args;
                    if (args.player?.toLowerCase() === walletLower) {
                        amountBigInt = args.morbiusAmount;
                        break;
                    }
                }
            }
            catch {
                // Not a supported deposit log.
            }
        }
        if (amountBigInt == null || amountBigInt <= 0n) {
            throw new Error('Could not verify deposit amount on-chain (no matching Deposit or DepositMORBIUS for this wallet)');
        }
        await this.dbService.insertPendingDeposit(walletAddress, amountBigInt, txHash, receipt.blockNumber, confirmationsRequired);
    }
    async creditDepositShortfall(txHash, correctAmountWei) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
            throw new Error('Invalid tx hash');
        }
        let correctBigInt;
        try {
            correctBigInt = BigInt(correctAmountWei);
        }
        catch {
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
        logger_1.logger.info('Deposit shortfall credited', {
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
    async getAuthoritativeBalance(rawAddress) {
        const normalizedAddress = this.normalizeAddress(rawAddress);
        const pending = await this.dbService.getActivePendingWithdrawal(normalizedAddress);
        if (pending) {
            try {
                const nonceUsed = await this.isWithdrawalNonceUsed(BigInt(pending.nonce));
                if (nonceUsed) {
                    await this.dbService.markPendingWithdrawalCompleted(normalizedAddress, BigInt(pending.nonce));
                    logger_1.logger.info('Resolved pending withdrawal during balance read', {
                        address: normalizedAddress,
                        nonce: pending.nonce,
                    });
                }
            }
            catch (error) {
                logger_1.logger.warn('Could not check pending withdrawal nonce during balance read', {
                    address: normalizedAddress,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        const balance = await this.dbService.getPlayerBalance(normalizedAddress);
        return balance.toString();
    }
    async enqueueWithdrawal(rawAddress, amount) {
        const normalizedAddress = this.normalizeAddress(rawAddress);
        const amountBigInt = amount != null ? BigInt(String(amount)) : 0n;
        if (amountBigInt < withdraw_sign_1.MIN_WITHDRAWAL_WEI) {
            throw new Error(`Amount required (min ${withdraw_sign_1.MIN_WITHDRAWAL_WEI.toString()} wei)`);
        }
        const walletClient = this.getHotWalletClient();
        if (!walletClient?.account) {
            logger_1.logger.error('Hot wallet not configured (HOT_WALLET_PRIVATE_KEY)');
            throw new Error('Withdrawals temporarily unavailable');
        }
        const feeBps = 500n;
        const feeAmount = (amountBigInt * feeBps) / 10000n;
        const netToUser = amountBigInt - feeAmount;
        const hotMorbiusBalance = await this.publicClient.readContract({
            address: contracts_1.MORBIUS_TOKEN_ADDRESS,
            abi: ERC20_BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args: [walletClient.account.address],
        });
        if (hotMorbiusBalance < netToUser) {
            throw new Error('Withdrawals are temporarily limited (hot wallet liquidity). Try a smaller amount or later.');
        }
        const jobId = await this.dbService.enqueueHotWithdrawal(normalizedAddress, amountBigInt, netToUser, feeAmount);
        return {
            jobId,
            status: 'queued',
            message: 'Queued',
        };
    }
    async getWithdrawalStatus(jobId) {
        const job = await this.dbService.getHotWithdrawalJobById(jobId);
        if (!job)
            return null;
        return {
            jobId: job.id,
            status: job.status,
            txHash: job.tx_hash ?? undefined,
            error: job.error_message ?? undefined,
            netToUser: job.net_to_user_wei ?? undefined,
        };
    }
    async getPendingWithdrawal(rawAddress) {
        const normalizedAddress = this.normalizeAddress(rawAddress);
        const job = await this.dbService.getActiveHotWithdrawalJob(normalizedAddress);
        if (!job)
            return null;
        return {
            jobId: job.id,
            status: job.status,
            txHash: job.tx_hash ?? undefined,
            error: job.error_message ?? undefined,
            netToUser: job.net_to_user_wei ?? undefined,
        };
    }
    async listPendingTransfers(type, limit, offset) {
        if (type === 'deposits') {
            return this.dbService.listPendingDeposits(limit, offset);
        }
        return this.dbService.listPendingWithdrawals(limit, offset);
    }
    async getPlayerTransactions(rawAddress, limit, offset) {
        const normalizedAddress = this.normalizeAddress(rawAddress);
        return this.dbService.getPlayerTransactionHistory(normalizedAddress, limit, offset);
    }
    async processHotWithdrawalQueue() {
        const walletClient = this.getHotWalletClient();
        if (!walletClient?.account)
            return;
        const job = await this.dbService.claimNextHotWithdrawalJob();
        if (!job)
            return;
        try {
            const txHash = await walletClient.writeContract({
                account: walletClient.account,
                chain: chains_1.pulsechain,
                address: contracts_1.MORBIUS_TOKEN_ADDRESS,
                abi: ERC20_TRANSFER_ABI,
                functionName: 'transfer',
                args: [job.wallet_address, BigInt(job.net_to_user_wei)],
            });
            await this.dbService.updateHotWithdrawalJob(job.id, { status: 'pending_confirmation', tx_hash: txHash });
            logger_1.logger.info('Hot withdrawal broadcast', { jobId: job.id, txHash, address: job.wallet_address });
        }
        catch (error) {
            const errMsg = error?.message?.slice(0, 500) ?? String(error);
            await this.dbService.updateHotWithdrawalJob(job.id, { status: 'failed', error_message: errMsg });
            logger_1.logger.error('Hot withdrawal broadcast failed (no refund — contact support)', { jobId: job.id, error: errMsg });
        }
    }
    async distributeWithdrawalFee(jobId, feeWei, walletClient) {
        if (!walletClient.account || feeWei <= 0n)
            return;
        try {
            const recipients = await this.getFeeRecipients();
            const payouts = [
                { to: recipients.distributionRecipient, amount: (feeWei * 125n) / 500n, label: 'distributionRecipient' },
                { to: recipients.burnAddress, amount: (feeWei * 50n) / 500n, label: 'burnAddress' },
                { to: recipients.platformFeeRecipient, amount: (feeWei * 175n) / 500n, label: 'platformFeeRecipient' },
                { to: recipients.lpDistributionRecipient, amount: (feeWei * 150n) / 500n, label: 'lpDistributionRecipient' },
            ];
            for (const payout of payouts) {
                if (payout.amount <= 0n || payout.to === '0x0000000000000000000000000000000000000000')
                    continue;
                try {
                    await walletClient.writeContract({
                        account: walletClient.account,
                        chain: chains_1.pulsechain,
                        address: contracts_1.MORBIUS_TOKEN_ADDRESS,
                        abi: ERC20_TRANSFER_ABI,
                        functionName: 'transfer',
                        args: [payout.to, payout.amount],
                    });
                    logger_1.logger.info('Hot withdrawal fee sent', { jobId, to: payout.label, amount: payout.amount.toString() });
                }
                catch (error) {
                    logger_1.logger.error('Hot withdrawal fee transfer failed', { jobId, to: payout.label, error });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Hot withdrawal fee distribution failed (reading recipients)', { jobId, error });
        }
    }
    async confirmHotWithdrawals() {
        const jobs = await this.dbService.getHotWithdrawalJobsPendingConfirmation();
        const timeoutMs = withdraw_sign_1.HOT_WITHDRAW_CONFIRMATION_TIMEOUT_MS;
        for (const job of jobs) {
            const ageMs = Date.now() - new Date(job.updated_at).getTime();
            const markDropped = async () => {
                await this.dbService.updateHotWithdrawalJob(job.id, {
                    status: 'failed',
                    error_message: 'Transaction not found after 15 minutes (dropped?) — contact support',
                });
                logger_1.logger.warn('Hot withdrawal dropped/timeout (no refund — contact support)', { jobId: job.id, txHash: job.tx_hash });
            };
            try {
                const receipt = await this.publicClient.getTransactionReceipt({ hash: job.tx_hash });
                if (!receipt) {
                    if (ageMs > timeoutMs)
                        await markDropped();
                    continue;
                }
                if (receipt.status !== 'success') {
                    await this.dbService.updateHotWithdrawalJob(job.id, {
                        status: 'failed',
                        error_message: 'Transaction reverted on-chain — contact support',
                    });
                    logger_1.logger.warn('Hot withdrawal reverted on-chain (no refund — contact support)', { jobId: job.id, txHash: job.tx_hash });
                    continue;
                }
                await this.dbService.updateHotWithdrawalJob(job.id, { status: 'completed' });
                await this.dbService.addToBlackjackWithdrawnTotal(BigInt(job.amount_wei));
                await this.dbService.recordHotWalletWithdrawal(job.wallet_address, BigInt(job.amount_wei), job.tx_hash);
                logger_1.logger.info('Hot withdrawal confirmed', { jobId: job.id, txHash: job.tx_hash });
                const walletClient = this.getHotWalletClient();
                const feeWei = (BigInt(job.amount_wei) * 500n) / 10000n;
                if (walletClient) {
                    await this.distributeWithdrawalFee(job.id, feeWei, walletClient);
                }
            }
            catch {
                if (ageMs > timeoutMs) {
                    await markDropped();
                }
            }
        }
    }
    async confirmPendingDeposits() {
        const currentBlock = await this.publicClient.getBlockNumber();
        const pending = await this.dbService.getPendingDepositsForConfirmation();
        for (const row of pending) {
            let blockNumber = row.block_number != null ? BigInt(row.block_number) : null;
            if (blockNumber == null) {
                try {
                    const receipt = await this.publicClient.getTransactionReceipt({ hash: row.tx_hash });
                    if (receipt?.blockNumber != null) {
                        blockNumber = receipt.blockNumber;
                        await this.dbService.updatePendingDepositBlockNumber(row.id, blockNumber);
                    }
                }
                catch {
                    continue;
                }
            }
            if (blockNumber == null)
                continue;
            const confirmations = Number(currentBlock - blockNumber);
            if (confirmations < row.confirmations_required)
                continue;
            const credited = await this.dbService.creditPendingDeposit(row.id);
            if (credited) {
                logger_1.logger.info('Deposit confirmed and credited', {
                    wallet: row.wallet_address,
                    txHash: row.tx_hash,
                    confirmations,
                });
            }
        }
    }
}
exports.MoneyService = MoneyService;
//# sourceMappingURL=money.service.js.map