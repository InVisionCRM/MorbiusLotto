import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { DatabaseService } from './database.service';
import { logger } from '../utils/logger';

// Import contract ABI (we'll need to generate this)
import { blackjackAbi } from '../abi/blackjack';

export interface SettlementRequest {
  gameId: string;
  playerAddress: string;
  amount: bigint; // Positive = win, negative = loss
  gameHash: string;
  gameData: any;
}

export class ContractSettlementService {
  private publicClient: any;
  private walletClient: any;
  private contractAddress: `0x${string}`;

  constructor(
    private dbService: DatabaseService,
    privateKey?: string
  ) {
    // Initialize Viem clients
    this.publicClient = createPublicClient({
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com')
    });

    if (privateKey) {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      this.walletClient = createWalletClient({
        account,
        chain: pulsechain,
        transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com')
      });
    }

    this.contractAddress = (process.env.BLACKJACK_CONTRACT_ADDRESS || '0x444f0714Bd297B17FD717d0824B95cA1E48352dd') as `0x${string}`;

    logger.info('Contract settlement service initialized', {
      contractAddress: this.contractAddress,
      hasWallet: !!this.walletClient
    });
  }

  /**
   * Settle a game result on-chain
   */
  async settleGame(request: SettlementRequest): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      if (!this.walletClient) {
        logger.warn('No wallet configured for settlement, storing for manual processing');
        return await this.storeSettlementForManualProcessing(request);
      }

      logger.info('Settling game on-chain', {
        gameId: request.gameId,
        playerAddress: request.playerAddress,
        amount: request.amount.toString()
      });

      // Prepare settlement data
      const settlementId = await this.dbService.createSettlement(
        request.gameId,
        request.playerAddress,
        request.amount
      );

      // Call settleGame on the contract
      const hash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: blackjackAbi,
        functionName: 'settleGame',
        args: [
          request.playerAddress as `0x${string}`,
          request.amount,
          request.gameHash as `0x${string}`,
          JSON.stringify(request.gameData)
        ]
      });

      logger.info('Settlement transaction sent', {
        gameId: request.gameId,
        transactionHash: hash,
        settlementId
      });

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        // Update settlement status
        await this.dbService.updateSettlementStatus(settlementId, hash, 'confirmed');

        logger.info('Settlement confirmed', {
          gameId: request.gameId,
          transactionHash: hash,
          blockNumber: receipt.blockNumber
        });

        return { success: true, transactionHash: hash };
      } else {
        // Update settlement status to failed
        await this.dbService.updateSettlementStatus(settlementId, hash, 'failed');

        logger.error('Settlement transaction failed', {
          gameId: request.gameId,
          transactionHash: hash
        });

        return { success: false, transactionHash: hash, error: 'Transaction failed' };
      }

    } catch (error) {
      logger.error('Error settling game on-chain:', error);

      // Store for manual processing
      return await this.storeSettlementForManualProcessing(request);
    }
  }

  /**
   * Store settlement for manual processing when automatic settlement fails
   */
  private async storeSettlementForManualProcessing(request: SettlementRequest): Promise<{ success: boolean; error?: string }> {
    try {
      await this.dbService.createSettlement(
        request.gameId,
        request.playerAddress,
        request.amount
      );

      logger.info('Settlement stored for manual processing', {
        gameId: request.gameId,
        playerAddress: request.playerAddress,
        amount: request.amount.toString()
      });

      return { success: true };
    } catch (error) {
      logger.error('Error storing settlement for manual processing:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check contract balance
   */
  async getContractBalance(): Promise<bigint> {
    try {
      const balance = await this.publicClient.getBalance({
        address: this.contractAddress
      });
      return balance;
    } catch (error) {
      logger.error('Error getting contract balance:', error);
      return 0n;
    }
  }

  /**
   * Get player reserve balance
   */
  async getPlayerReserve(playerAddress: string): Promise<bigint> {
    try {
      const reserve = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: blackjackAbi,
        functionName: 'getPlayerReserve',
        args: [playerAddress as `0x${string}`]
      });
      return reserve as bigint;
    } catch (error) {
      logger.error('Error getting player reserve:', error);
      return 0n;
    }
  }

  /**
   * Check if settlement is valid (has enough balance for payout)
   */
  async validateSettlement(request: SettlementRequest): Promise<{ valid: boolean; reason?: string }> {
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
          reason: `Insufficient contract balance. Required: ${formatEther(requiredAmount)} PLS, Available: ${formatEther(contractBalance)} PLS`
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error validating settlement:', error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * Process pending settlements (for manual processing)
   */
  async processPendingSettlements(): Promise<{ processed: number; failed: number }> {
    try {
      // This would be called periodically to process pending settlements
      // For now, just return stats
      const pendingSettlements = await this.dbService.withTransaction(async (client) => {
        const result = await client.query(
          'SELECT COUNT(*) as count FROM settlements WHERE status = $1',
          ['pending']
        );
        return result.rows[0].count;
      });

      logger.info('Pending settlements check', { count: pendingSettlements });

      return { processed: 0, failed: 0 };
    } catch (error) {
      logger.error('Error processing pending settlements:', error);
      return { processed: 0, failed: 1 };
    }
  }

  /**
   * Emergency withdraw from contract (admin function)
   */
  async emergencyWithdraw(amount: bigint, toAddress: string): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'No wallet configured' };
      }

      const hash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: blackjackAbi,
        functionName: 'emergencyWithdraw',
        args: [amount]
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        logger.info('Emergency withdrawal successful', {
          amount: amount.toString(),
          toAddress,
          transactionHash: hash
        });

        return { success: true, transactionHash: hash };
      } else {
        return { success: false, error: 'Transaction failed' };
      }
    } catch (error) {
      logger.error('Error performing emergency withdrawal:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get contract statistics
   */
  async getContractStats(): Promise<{
    balance: bigint;
    totalReserves: bigint;
    emergencyPaused: boolean;
  }> {
    try {
      const [balance, totalReserves, emergencyPaused] = await Promise.all([
        this.getContractBalance(),
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: blackjackAbi,
          functionName: 'totalReserves'
        }),
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: blackjackAbi,
          functionName: 'emergencyPaused'
        })
      ]);

      return {
        balance,
        totalReserves: totalReserves as bigint,
        emergencyPaused: emergencyPaused as boolean
      };
    } catch (error) {
      logger.error('Error getting contract stats:', error);
      return {
        balance: 0n,
        totalReserves: 0n,
        emergencyPaused: false
      };
    }
  }
}