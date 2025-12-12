/**
 * PulseChain SuperStakeLottery6of55 V2 Keeper
 *
 * 2-Step keeper that:
 * 1. Locks rounds when they expire (finalizeRound)
 * 2. Draws winning numbers after blockDelay (drawNumbers)
 *
 * Requirements:
 * - PRIVATE_KEY in .env (any funded key; both functions are permissionless)
 * - LOTTERY_ADDRESS in .env (defaults to mainnet address)
 * - Optional: PULSECHAIN_RPC, KEEPER_POLL_MS, KEEPER_GAS_LIMIT
 *
 * Usage: node scripts/lottery-keeper.js
 */

require('dotenv').config()
const { ethers } = require('ethers')
const path = require('path')
const fs = require('fs')

// Config
const RPC_URL = process.env.PULSECHAIN_RPC || 'https://rpc.pulsechain.com'
const PRIVATE_KEY = process.env.PRIVATE_KEY

// ⚠️ IMPORTANT: Set your deployed lottery contract address here or in .env
// Latest deployment: 0xEa6F2C484B720103EF11c77f71BF07eC11640e29 (Block 25247554)
// Get from: lib/contracts.ts or your deployment logs
const LOTTERY_ADDRESS =
  process.env.LOTTERY_ADDRESS || '0xEa6F2C484B720103EF11c77f71BF07eC11640e29'

const POLL_MS = parseInt(process.env.KEEPER_POLL_MS || '15000', 10)
const GAS_LIMIT = parseInt(process.env.KEEPER_GAS_LIMIT || '2000000', 10)

if (!PRIVATE_KEY) {
  console.error('❌ Missing PRIVATE_KEY in .env')
  process.exit(1)
}

// Load ABI (supports Hardhat artifact shape)
const abiPath = path.join(__dirname, '../../abi/lottery6of55-v2.json')
let ABI
try {
  const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'))
  ABI = Array.isArray(artifact) ? artifact : artifact.abi
} catch (err) {
  console.error('❌ Failed to load lottery ABI:', err.message)
  console.error('   Expected at:', abiPath)
  process.exit(1)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, wallet)

  console.log('🤖 Lottery Keeper Started')
  console.log('━'.repeat(50))
  console.log(`Keeper Address: ${wallet.address}`)
  console.log(`Contract: ${LOTTERY_ADDRESS}`)
  console.log(`RPC: ${RPC_URL}`)
  console.log(`Poll Interval: ${POLL_MS}ms`)
  console.log('━'.repeat(50))

  // Verify contract is accessible
  try {
    const code = await provider.getCode(LOTTERY_ADDRESS)
    if (code === '0x') {
      console.error('❌ No contract found at address:', LOTTERY_ADDRESS)
      process.exit(1)
    }
    console.log('✅ Contract verified at address\n')
  } catch (err) {
    console.error('❌ Failed to connect to contract:', err.message)
    process.exit(1)
  }

  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 10
  let lastRoundId = null
  let lastState = null

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Get current round info with better error handling
      let info
      try {
        info = await lottery.getCurrentRoundInfo()
      } catch (callErr) {
        console.error(`\n❌ Contract call failed:`, callErr.message)
        console.error(`   This usually means:`)
        console.error(`   1. Wrong contract address`)
        console.error(`   2. ABI mismatch with deployed contract`)
        console.error(`   3. RPC connection issue`)
        console.error(`   Verify the contract address and ABI are correct.\n`)
        consecutiveErrors++
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`❌ Too many consecutive call failures. Exiting.`)
          process.exit(1)
        }
        await sleep(POLL_MS * 2)
        continue
      }

      // getCurrentRoundInfo returns tuple:
      // roundId, startTime, endTime, totalPssh, totalTickets,
      // uniquePlayers, timeRemaining, isMegaMillionsRound, state
      const roundId = info[0]
      const startTime = Number(info[1])
      const endTime = Number(info[2])
      const totalPssh = info[3]
      const totalTickets = Number(info[4])
      const uniquePlayers = Number(info[5])
      const timeRemaining = Number(info[6])
      const isMegaMillions = info[7]
      const state = Number(info[8]) // 0=OPEN,1=LOCKED,2=FINALIZED
      const stateLabel = ['OPEN', 'LOCKED', 'FINALIZED'][state] || `UNKNOWN(${state})`

      // Detect round changes
      const roundChanged = lastRoundId !== null && roundId !== lastRoundId
      const stateChanged = lastState !== null && lastState !== state

      if (roundChanged || lastRoundId === null) {
        console.log('\n' + '═'.repeat(50))
        console.log(`🎰 NEW ROUND STARTED`)
        console.log('═'.repeat(50))
        console.log(`   Round ID: ${roundId.toString()}`)
        console.log(`   Type: ${isMegaMillions ? '⭐ MEGA MORBIUS' : 'Standard'}`)
        console.log(`   Start: ${new Date(startTime * 1000).toLocaleString()}`)
        console.log(`   End: ${new Date(endTime * 1000).toLocaleString()}`)
        console.log(`   Duration: ${Math.floor((endTime - startTime) / 60)} minutes`)
        console.log('═'.repeat(50) + '\n')
      } else if (stateChanged && state === 2) {
        console.log('\n' + '═'.repeat(50))
        console.log(`🏁 ROUND FINALIZED`)
        console.log('═'.repeat(50))
        console.log(`   Round ID: ${roundId.toString()}`)
        console.log(`   Total Tickets: ${totalTickets}`)
        console.log(`   Unique Players: ${uniquePlayers}`)
        console.log(`   Total Pool: ${ethers.formatUnits(totalPssh, 18)} pSSH`)
        console.log(`   Finalized: ${new Date().toLocaleString()}`)
        console.log('═'.repeat(50) + '\n')
      }

      // Regular status log
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
      console.log(
        `[${timestamp}] Round ${roundId.toString()} | ${stateLabel} | ⏱️  ${timeRemaining}s | 🎫 ${totalTickets} tickets | 👥 ${uniquePlayers} players`
      )

      const roundExpired = timeRemaining <= 0
      const roundOpen = state === 0

      if (roundOpen && roundExpired) {
        console.log(`\n🎫 Finalizing round ${roundId.toString()}...`)
        
        // Double-check contract state before attempting
        let shouldFinalize = false
        try {
          const currentBlock = await provider.getBlockNumber()
          const blockData = await provider.getBlock(currentBlock)
          const blockTimestamp = blockData.timestamp
          const contractState = await lottery.currentRoundState()
          const startTime = await lottery.currentRoundStartTime()
          const duration = await lottery.roundDuration()
          const currentTime = Math.floor(Date.now() / 1000)
          
          // Convert BigInt to number for comparison
          const stateNum = Number(contractState)
          const expiryTime = Number(startTime) + Number(duration)
          
          console.log(`   🔍 Pre-flight check:`)
          console.log(`      Block: ${currentBlock}`)
          console.log(`      Block timestamp: ${blockTimestamp} (blockchain time)`)
          console.log(`      System time: ${currentTime} (local time)`)
          console.log(`      Time diff: ${currentTime - Number(blockTimestamp)}s`)
          console.log(`      Contract state: ${stateNum} (0=OPEN, 1=LOCKED, 2=FINALIZED)`)
          console.log(`      Round start: ${startTime}`)
          console.log(`      Duration: ${duration}s`)
          console.log(`      Expires at: ${expiryTime}`)
          console.log(`      Expired (blockchain time): ${Number(blockTimestamp) >= expiryTime}`)
          console.log(`      Expired (system time): ${currentTime >= expiryTime}`)
          
          if (stateNum !== 0) {
            console.log(`   ⚠️  Round already finalized or locked. Skipping.`)
            consecutiveErrors = 0
          } else if (Number(blockTimestamp) < expiryTime) {
            console.log(`   ⚠️  Round not expired yet according to blockchain time. Skipping.`)
            consecutiveErrors = 0
          } else {
            console.log(`   ✅ Pre-flight passed, proceeding with finalization...`)
            shouldFinalize = true
          }
        } catch (checkErr) {
          console.error(`   ⚠️  Pre-flight check failed:`, checkErr.message)
          shouldFinalize = false
        }
        
        if (shouldFinalize) {
          try {
            const tx = await lottery.finalizeRound({ gasLimit: GAS_LIMIT })
            console.log(`   📝 Transaction: ${tx.hash}`)
            console.log(`   ⏳ Waiting for confirmation...`)
            const receipt = await tx.wait()
            console.log(`   ✅ Finalized in block ${receipt.blockNumber}`)
            console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`)
            consecutiveErrors = 0
          } catch (finalizeErr) {
            const reason = finalizeErr.reason || finalizeErr.message || finalizeErr
            console.error(`   ❌ Finalize error:`, reason)
            if (finalizeErr.receipt) {
              console.error(`   Status: ${finalizeErr.receipt.status} | Gas used: ${finalizeErr.receipt.gasUsed}`)
            }
            if (finalizeErr.data) {
              console.error(`   Error data:`, finalizeErr.data)
            }
            consecutiveErrors++
          }
        }
      }

      lastRoundId = roundId
      lastState = state

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n❌ Too many consecutive errors (${consecutiveErrors}). Stopping keeper.`)
        process.exit(1)
      }

      if (consecutiveErrors > 0) {
        const backoffMs = Math.min(POLL_MS * consecutiveErrors, 60000)
        console.log(`   ⏳ Backing off for ${backoffMs}ms due to ${consecutiveErrors} consecutive error(s)`)
        await sleep(backoffMs)
        continue
      }

      consecutiveErrors = 0
    } catch (err) {
      console.error(`\n💥 Unexpected error:`, err.message || err)
      console.error(`   Stack:`, err.stack)
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

