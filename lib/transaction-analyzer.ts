import { PublicClient, parseAbiItem, keccak256, toHex } from 'viem'
import { KENO_ADDRESS, LOTTERY_INSTANT_ADDRESS, LOTTERY_DEPLOY_BLOCK, KENO_DEPLOY_BLOCK } from './contracts'

// Calculate function selectors for Keno
const BUY_TICKET_WITH_PLS_SELECTOR = keccak256(
  toHex('buyTicketWithPLS(uint256,uint8[],uint8,uint8,uint256)')
).slice(0, 10)

export type PaymentAnalysis = {
  paymentType: 'MORBIUS' | 'PLS'
  plsAmount?: bigint
  morbiusReceived?: bigint
}

/**
 * Analyze a Keno purchase transaction to detect payment method
 * Keno doesn't emit separate events for PLS vs MORBIUS, so we check the transaction input
 */
export async function analyzeKenoPurchase(
  txHash: string,
  publicClient: PublicClient
): Promise<PaymentAnalysis> {
  try {
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` })

    if (!tx) {
      return { paymentType: 'MORBIUS' }
    }

    const functionSelector = tx.input.slice(0, 10)

    // Check if it's a PLS purchase (either by function selector or msg.value > 0)
    if (functionSelector === BUY_TICKET_WITH_PLS_SELECTOR || tx.value > BigInt(0)) {
      return {
        paymentType: 'PLS',
        plsAmount: tx.value,
      }
    }

    return { paymentType: 'MORBIUS' }
  } catch (error) {
    console.error('Error analyzing Keno purchase:', error)
    return { paymentType: 'MORBIUS' }
  }
}

/**
 * Analyze a Lottery purchase transaction to detect payment method
 * Lottery emits WPLSSwappedForTickets event when PLS is used
 */
export async function analyzeLotteryPurchase(
  txHash: string,
  publicClient: PublicClient
): Promise<PaymentAnalysis> {
  try {
    // Check for WPLSSwappedForTickets event in the same transaction
    const event = parseAbiItem(
      'event WPLSSwappedForTickets(address indexed player, uint256 wplsSpent, uint256 MORBIUSReceived)'
    )

    // Get transaction to find its block number
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` })
    if (!tx || !tx.blockNumber) {
      return { paymentType: 'MORBIUS' }
    }

    // Query for WPLSSwappedForTickets events in the specific block
    const logs = await publicClient.getLogs({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      event,
      fromBlock: tx.blockNumber,
      toBlock: tx.blockNumber,
    })

    // Find the log that matches this transaction
    const plsLog = logs.find((log) => log.transactionHash === txHash)

    if (plsLog && plsLog.args) {
      return {
        paymentType: 'PLS',
        plsAmount: plsLog.args.wplsSpent,
        morbiusReceived: plsLog.args.MORBIUSReceived,
      }
    }

    return { paymentType: 'MORBIUS' }
  } catch (error) {
    console.error('Error analyzing Lottery purchase:', error)
    return { paymentType: 'MORBIUS' }
  }
}

/**
 * Batch analyze multiple transactions
 * Returns a Map of txHash -> PaymentAnalysis for quick lookup
 */
export async function batchAnalyzeTransactions(
  txHashes: string[],
  publicClient: PublicClient,
  game: 'Lottery' | 'Keno'
): Promise<Map<string, PaymentAnalysis>> {
  const uniqueTxs = [...new Set(txHashes)]
  const results = new Map<string, PaymentAnalysis>()

  await Promise.all(
    uniqueTxs.map(async (txHash) => {
      const analysis =
        game === 'Lottery'
          ? await analyzeLotteryPurchase(txHash, publicClient)
          : await analyzeKenoPurchase(txHash, publicClient)
      results.set(txHash, analysis)
    })
  )

  return results
}
