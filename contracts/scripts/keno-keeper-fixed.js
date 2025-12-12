/**
 * PulseChain Keno Keeper Bot
 *
 * Advanced keeper that handles round finalization and progressive jackpot management on PulseChain.
 *
 * Requirements:
 * - PRIVATE_KEY in .env (must be contract owner if START_NEXT=true)
 * - KENO_ADDRESS in .env
 * - Optional: PULSECHAIN_RPC, KEEPER_POLL_MS, KEEPER_START_NEXT, KEEPER_SEED_PROGRESSIVE
 *
 * Features:
 * - Automatic round finalization when rounds expire
 * - Automatic next round creation
 * - Progressive jackpot pool monitoring and seeding
 * - Comprehensive error handling and logging
 *
 * Usage: node scripts/keno-keeper-fixed.js
 */

require('dotenv').config()
const { ethers } = require('ethers')
const path = require('path')
const fs = require('fs')

// Config
const RPC_URL = process.env.PULSECHAIN_RPC || 'https://rpc.pulsechain.com'
const PRIVATE_KEY = process.env.PRIVATE_KEY
const KENO_ADDRESS = process.env.KENO_ADDRESS
const MORBIUS_TOKEN_ADDRESS = process.env.MORBIUS_TOKEN_ADDRESS
const POLL_MS = parseInt(process.env.KEEPER_POLL_MS || '15000', 10)
const START_NEXT = (process.env.KEEPER_START_NEXT || 'true').toLowerCase() === 'true'
const GAS_LIMIT = parseInt(process.env.KEEPER_GAS_LIMIT || '2000000', 10)
const SEED_PROGRESSIVE = (process.env.KEEPER_SEED_PROGRESSIVE || 'true').toLowerCase() === 'true'
const PROGRESSIVE_SEED_AMOUNT = process.env.KEEPER_PROGRESSIVE_SEED_AMOUNT || '0.1' // WPLS amount to seed

if (!PRIVATE_KEY) {
  console.error('❌ Missing PRIVATE_KEY in .env')
  process.exit(1)
}

if (!KENO_ADDRESS) {
  console.error('❌ Missing KENO_ADDRESS in .env')
  process.exit(1)
}

// Load full ABI to get proper struct parsing
const abiPath = path.join(__dirname, '../../abi/CryptoKeno.json')
let FULL_ABI
try {
  const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'))
  FULL_ABI = Array.isArray(artifact) ? artifact : artifact.abi // support Hardhat artifact shape
} catch (err) {
  console.error('❌ Failed to load CryptoKeno.json ABI:', err.message)
  console.error('   Expected at:', abiPath)
  process.exit(1)
}

// Extract only the functions we need (for cleaner interface)
const ABI = FULL_ABI.filter(item =>
  item.type === 'function' && [
    'currentRoundId',
    'getRound',
    'finalizeRound',
    'startNextRound',
    'owner',
    'paused',
    'getProgressiveStats',
    'seedProgressivePool',
    'feeBps',
    'feeRecipient',
    'progressiveFeeBps'
  ].includes(item.name)
)

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Helper function to get approximate ticket count for a round
async function getRoundTicketCount(roundId, contract) {
  try {
    // Get round data to see total wager amount (in WPLS equivalent)
    const roundData = await contract.getRound(roundId)
    const totalWager = Number(roundData.totalBaseWager) / 1e18

    // Estimate ticket count based on average wager (rough approximation)
    // This is not perfect but gives an idea of scale
    if (totalWager === 0) return 0

    // Assume average ticket costs ~0.01 WPLS/MORBIUS (adjust based on your game's pricing)
    const estimatedTickets = Math.round(totalWager / 0.01)
    return estimatedTickets
  } catch (err) {
    return 'Unknown'
  }
}

// Helper function to show fund distribution breakdown
async function showFundDistribution(contract, totalWageredWei) {
  try {
    const totalWagered = Number(totalWageredWei) / 1e18

    // Get fee configuration
    const [feeBps, feeRecipient, progressiveFeeBps, progressiveStats] = await Promise.all([
      contract.feeBps(),
      contract.feeRecipient(),
      contract.progressiveFeeBps(),
      contract.getProgressiveStats()
    ])

    const feeBpsValue = Number(feeBps)
    const progressiveFeeBpsValue = Number(progressiveFeeBps)

    // Calculate distribution (BPS = basis points, 10000 = 100%)
    const totalFeeBps = feeBpsValue + progressiveFeeBpsValue
    const feeAmount = (totalWagered * feeBpsValue) / 10000
    const progressiveAmount = (totalWagered * progressiveFeeBpsValue) / 10000
    const winnerPoolAmount = totalWagered - feeAmount - progressiveAmount

    console.log(`   💰 Fund Distribution for ${totalWagered.toFixed(6)} WPLS wagered:`)
    console.log(`      🏆 Winner Pool: ${winnerPoolAmount.toFixed(6)} WPLS (${((winnerPoolAmount / totalWagered) * 100).toFixed(2)}%)`)
    console.log(`      🟣 Progressive Pool: ${progressiveAmount.toFixed(6)} WPLS (${((progressiveAmount / totalWagered) * 100).toFixed(2)}%)`)
    console.log(`      💼 Deployer Fee: ${feeAmount.toFixed(6)} WPLS (${((feeAmount / totalWagered) * 100).toFixed(2)}%)`)
    console.log(`         📍 Fee Recipient: ${feeRecipient}`)
    console.log(`         📊 Fee Rate: ${(feeBpsValue / 100).toFixed(2)}%`)

  } catch (err) {
    console.log(`   💰 Fund Distribution: Unable to calculate (${err.message})`)
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const keno = new ethers.Contract(KENO_ADDRESS, ABI, wallet)

  console.log('🤖 Keno Keeper Started')
  console.log('━'.repeat(50))
  console.log(`Keeper Address: ${wallet.address}`)
  console.log(`Contract: ${KENO_ADDRESS}`)
  console.log(`Poll Interval: ${POLL_MS}ms`)
  console.log(`Auto-start Next: ${START_NEXT}`)
  console.log(`Seed Progressive: ${SEED_PROGRESSIVE}`)
  console.log('━'.repeat(50))

  // Verify ownership if START_NEXT is enabled
  if (START_NEXT) {
    try {
      const owner = await keno.owner()
      if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.warn(`⚠️  WARNING: Keeper wallet is NOT owner!`)
        console.warn(`   Owner: ${owner}`)
        console.warn(`   Keeper: ${wallet.address}`)
        console.warn(`   startNextRound() will fail. Set KEEPER_START_NEXT=false or use owner wallet.`)
      } else {
        console.log('✅ Keeper wallet is contract owner')
      }
    } catch (err) {
      console.warn('⚠️  Could not verify ownership:', err.message)
    }
  }

  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 10

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Check if contract is paused
      const isPaused = await keno.paused()
      if (isPaused) {
        console.log(`⏸️  Contract is paused. Waiting...`)
        await sleep(POLL_MS)
        continue
      }

      const currentRound = await keno.currentRoundId()
      const roundData = await keno.getRound(currentRound)
      const now = Math.floor(Date.now() / 1000)

      // With proper ABI, ethers returns a struct with named properties
      const round = {
        id: roundData.id,
        startTime: roundData.startTime,
        endTime: roundData.endTime,
        state: roundData.state,
        requestId: roundData.requestId,
        randomSeed: roundData.randomSeed,
        bullsEyeIndex: roundData.bullsEyeIndex,
        bullsEyeNumber: roundData.bullsEyeNumber,
        winningNumbers: roundData.winningNumbers,
        plus3Numbers: roundData.plus3Numbers,
        drawnMultiplier: roundData.drawnMultiplier,
        totalBaseWager: roundData.totalBaseWager,
        poolBalance: roundData.poolBalance,
        totalMultiplierAddon: roundData.totalMultiplierAddon,
        totalBullsEyeAddon: roundData.totalBullsEyeAddon,
        totalPlus3Addon: roundData.totalPlus3Addon,
      }

      const state = Number(round.state) // 0=OPEN, 1=CLOSED, 2=FINALIZED
      const stateLabel = ['OPEN', 'CLOSED', 'FINALIZED'][state] || `UNKNOWN(${state})`
      const timeRemaining = Number(round.endTime) - now
      const timeStr = timeRemaining > 0 ? `${timeRemaining}s remaining` : `expired ${-timeRemaining}s ago`

      // Get keeper balance and round statistics
      const [keeperBalance, ticketCount] = await Promise.all([
        provider.getBalance(wallet.address),
        getRoundTicketCount(round.id, keno)
      ])

      const keeperBalancePLS = ethers.formatEther(keeperBalance)
      const plsWagered = Number(round.totalBaseWager) / 1e18

      // Get keeper MORBIUS balance if token address is available
      let keeperBalanceMorbius = 'N/A'
      if (MORBIUS_TOKEN_ADDRESS) {
        try {
          const morbiusContract = new ethers.Contract(MORBIUS_TOKEN_ADDRESS, [
            'function balanceOf(address) view returns (uint256)'
          ], provider)
          const morbiusBalance = await morbiusContract.balanceOf(wallet.address)
          keeperBalanceMorbius = ethers.formatEther(morbiusBalance)
        } catch (err) {
          keeperBalanceMorbius = 'Error'
        }
      }

      // Log round statistics at start of each round check
      if (state === 0) { // OPEN round
        console.log(`\n📊 Round ${currentRound.toString()} Statistics:`)
        console.log(`   💰 Keeper PLS Balance: ${keeperBalancePLS} WPLS`)
        console.log(`   🟣 Keeper MORBIUS Balance: ${keeperBalanceMorbius} MORBIUS`)
        console.log(`   💵 WPLS Wagered: ${plsWagered.toFixed(4)} WPLS`)
        console.log(`   ✅ Contract Accepts: Both WPLS & MORBIUS tokens`)
        console.log(`   🎫 Tickets Purchased: ${ticketCount}`)
        console.log(`   ⏰ ${timeStr}`)
      }

      // Debug: Log state transition info (only when state changes or expired)
      if (state !== 2 && now >= Number(round.endTime)) {
        console.log('🎲 Round ready for finalization:', {
          roundId: round.id?.toString(),
          state: stateLabel,
          stateValue: state,
          endTime: Number(round.endTime),
          currentTime: now,
          expired: now - Number(round.endTime),
        })
      }

      console.log(`[${new Date().toISOString()}] Round ${currentRound.toString()} | ${stateLabel} | ${timeStr}`)

      // Main logic: finalize if expired and not finalized
      if (state !== 2 && now >= Number(round.endTime)) {
        console.log(`🎲 Finalizing round ${currentRound.toString()}...`)

        try {
          const tx = await keno.finalizeRound(currentRound, { gasLimit: GAS_LIMIT })
          console.log(`   📝 Tx: ${tx.hash}`)
          const receipt = await tx.wait()
          console.log(`   ✅ Finalized in block ${receipt.blockNumber}`)
          console.log(`   🏆 Round ${currentRound.toString()} Winners: Check contract events for winner count`)

          // Show fund distribution breakdown
          await showFundDistribution(keno, round.totalBaseWager)

          consecutiveErrors = 0 // Reset error counter on success

          // If START_NEXT enabled, start the next round
          if (START_NEXT) {
            await sleep(2000) // Brief delay
            console.log(`🚀 Starting next round...`)
            try {
              const tx2 = await keno.startNextRound({ gasLimit: GAS_LIMIT })
              console.log(`   📝 Tx: ${tx2.hash}`)
              const r2 = await tx2.wait()
              console.log(`   ✅ Started next round in block ${r2.blockNumber}`)
            } catch (startErr) {
              // This might fail if a user already triggered a new round
              const reason = startErr.reason || startErr.message || startErr
              if (reason.includes('round exists') || reason.includes('already open')) {
                console.log(`   ℹ️  Next round already started`)
              } else {
                console.error(`   ❌ Failed to start next round:`, reason)
              }
            }
          }
        } catch (finalizeErr) {
          const reason = finalizeErr.reason || finalizeErr.message || finalizeErr

          // Log transaction receipt if available
          if (finalizeErr.receipt) {
            console.error(`   ❌ Transaction REVERTED (status: ${finalizeErr.receipt.status})`)
            console.error(`   Gas used: ${finalizeErr.receipt.gasUsed}`)
            console.error(`   Block: ${finalizeErr.receipt.blockNumber}`)
          }

          // Handle expected errors gracefully
          if (reason.includes('RandomnessNotReady')) {
            console.error(`   ❌ Randomness provider blocking finalization!`)
            console.error(`   🔧 Action Required: Set randomnessProvider to address(0) in contract`)
            consecutiveErrors++
          } else if (reason.includes('RoundStillActive') || reason.includes('not expired')) {
            console.log(`   ℹ️  Round not yet expired (chain time might differ)`)
          } else if (reason.includes('RoundAlreadyFinalized') || reason.includes('already finalized')) {
            console.log(`   ℹ️  Round already finalized (race condition with another tx)`)
          } else if (finalizeErr.receipt && finalizeErr.receipt.status === 0) {
            console.error(`   ❌ Transaction reverted without specific reason`)
            console.error(`   Possible causes:`)
            console.error(`     - Round already finalized (race condition)`)
            console.error(`     - Randomness provider blocking`)
            console.error(`     - Contract state mismatch`)
            console.log(`   ℹ️  Will retry on next poll cycle`)
            // Don't increment consecutive errors for silent reverts - likely race conditions
          } else {
            console.error(`   ❌ Finalize error:`, reason)
            consecutiveErrors++
          }
        }
      } else if (state === 2) {
        // Round already finalized - check if next round needs starting
        if (START_NEXT) {
          const nextRoundId = currentRound + 1n
          try {
            const nextRound = await keno.getRound(nextRoundId)
            if (Number(nextRound.id) === 0) {
              console.log(`🚀 Round finalized but next round doesn't exist. Starting...`)
              const tx = await keno.startNextRound({ gasLimit: GAS_LIMIT })
              console.log(`   📝 Tx: ${tx.hash}`)
              const receipt = await tx.wait()
              console.log(`   ✅ Started round ${nextRoundId.toString()} in block ${receipt.blockNumber}`)
              consecutiveErrors = 0
            }
          } catch (err) {
            // Ignore - next round likely already exists or will be created by user interaction
            const reason = err.reason || err.message || err
            if (!reason.includes('already open') && !reason.includes('round exists')) {
              console.log(`   ℹ️  Next round check:`, reason)
            }
          }
        }
      } else {
        console.log(`   ⏳ Round still active, waiting...`)
      }

      // Check and seed progressive pool if needed
      if (SEED_PROGRESSIVE) {
        try {
          const progressiveStats = await keno.getProgressiveStats()
          const currentPool = Number(progressiveStats.currentPool) / 1e18 // Convert from wei

          // Seed progressive pool if it's below minimum threshold
          if (currentPool < 1.0) { // Less than 1 WPLS
            console.log(`🎰 Progressive pool low (${currentPool.toFixed(4)} WPLS). Seeding...`)
            const seedAmountWei = ethers.parseEther(PROGRESSIVE_SEED_AMOUNT)

            const tx = await keno.seedProgressivePool(seedAmountWei, { gasLimit: GAS_LIMIT })
            console.log(`   📝 Seeding tx: ${tx.hash}`)
            const receipt = await tx.wait()
            console.log(`   ✅ Seeded ${PROGRESSIVE_SEED_AMOUNT} WPLS in block ${receipt.blockNumber}`)
            consecutiveErrors = 0
          }
        } catch (seedErr) {
          const reason = seedErr.reason || seedErr.message || seedErr
          console.error(`   ❌ Progressive seeding error:`, reason)
          // Don't increment consecutive errors for seeding failures - not critical
        }
      }

      // Check for persistent errors
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n❌ Too many consecutive errors (${consecutiveErrors}). Stopping keeper.`)
        console.error(`   Please check contract configuration and try again.`)
        process.exit(1)
      }

      // Add exponential backoff if there are errors
      if (consecutiveErrors > 0) {
        const backoffMs = Math.min(POLL_MS * consecutiveErrors, 60000)
        console.log(`   ⏳ Backing off for ${backoffMs}ms due to ${consecutiveErrors} consecutive error(s)`)
        await sleep(backoffMs)
        continue
      }

    } catch (err) {
      console.error(`\n💥 Keeper error:`, err.message || err)
      consecutiveErrors++

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`❌ Too many errors. Exiting.`)
        process.exit(1)
      }
    }

    await sleep(POLL_MS)
  }
}

main().catch((err) => {
  console.error('💥 Fatal error:', err)
  process.exit(1)
})
