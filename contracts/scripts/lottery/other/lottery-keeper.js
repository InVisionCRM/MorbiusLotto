/**
 * PulseChain SuperStakeLottery6of55 V2 Keeper
 * 
 * Simplified keeper that buys tickets every 315 seconds (5:15 minutes)
 * This automatically finalizes expired rounds and ensures rounds have activity
 * 
 * Requirements:
 * - PRIVATE_KEY in .env (any funded key; function is permissionless) 
 * - LOTTERY_INSTANT_ADDRESS in .env (defaults to mainnet address)
 * - Optional: PULSECHAIN_RPC, KEEPER_GAS_LIMIT
 * 
 * Usage: node scripts/lottery-keeper.js
 */

import 'dotenv/config'
import { ethers } from '../../node_modules/ethers/lib.commonjs/index.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Config
const RPC_URL = process.env.PULSECHAIN_RPC || 'https://rpc.pulsechain.com'
const PRIVATE_KEY = process.env.PRIVATE_KEY

// ⚠️ IMPORTANT: Set your deployed lottery contract address here or in .env
// Original deployment: 0xD66b4489fbfF99A8d62f969203899840F2ec69c5
// Get from: lib/contracts.ts or your deployment logs
const LOTTERY_INSTANT_ADDRESS =
  process.env.LOTTERY_INSTANT_ADDRESS || '0xD66b4489fbfF99A8d62f969203899840F2ec69c5'

const GAS_LIMIT = parseInt(process.env.KEEPER_GAS_LIMIT || '2000000', 10)

if (!PRIVATE_KEY) {
  console.error('❌ Missing PRIVATE_KEY in .env')
  process.exit(1)
}

console.log('🔑 Private key loaded:', PRIVATE_KEY ? '✅ Yes' : '❌ No')
console.log('📧 Using address:', PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY).address : 'N/A')

// Load ABI (supports Hardhat artifact shape)
const abiPath = path.join(__dirname, '../../abi/lottery6of55-v2.json')
let ABI
try {
  const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'))
  ABI = Array.isArray(artifact) ? artifact : artifact.abi
  console.log(`🔍 Loaded ABI with ${ABI.length} entries`)
  console.log(`🔍 First ABI entry:`, JSON.stringify(ABI[0], null, 2).substring(0, 200) + '...')
} catch (err) {
  console.error('❌ Failed to load lottery ABI:', err.message)
  console.error('   Expected at:', abiPath)
  process.exit(1)
}

function generateRandomTicketNumbers() {
  const numbers = new Set()
  while (numbers.size < 6) {
    // Generate random number between 1-55
    const num = Math.floor(Math.random() * 55) + 1
    numbers.add(num)
  }
  return Array.from(numbers).sort((a, b) => a - b)
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const lottery = new ethers.Contract(LOTTERY_INSTANT_ADDRESS, ABI, wallet)
  console.log('✅ Contract instance created')
  console.log(`🔍 Contract interface methods: ${lottery.interface?.functions ? Object.keys(lottery.interface.functions).length : 'N/A'}`)

  // Debug contract initialization
  console.log('🔍 Contract initialization check:')
  console.log(`   Lottery address: ${LOTTERY_INSTANT_ADDRESS}`)
  console.log(`   ABI loaded: ${ABI ? 'Yes' : 'No'} (${ABI?.length || 0} methods)`)
  console.log(`   Provider connected: ${provider ? 'Yes' : 'No'}`)
  console.log(`   Wallet address: ${wallet.address}`)

  // Test contract connection
  try {
    const code = await provider.getCode(LOTTERY_INSTANT_ADDRESS)
    console.log(`   Contract deployed: ${code !== '0x' ? 'Yes' : 'No'}`)
    if (code === '0x') {
      console.error('❌ Contract not found at address!')
      process.exit(1)
    }
  } catch (err) {
    console.error('❌ Failed to check contract:', err.message)
    process.exit(1)
  }

  const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function symbol() view returns (string)', 
    'function decimals() view returns (uint8)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
  ]
  const MORBIUSToken = new ethers.Contract(MORBIUS_TOKEN_ADDRESS, ERC20_ABI, provider)

  // Get initial balances
  try {
    const MORBIUSBalance = await MORBIUSToken.balanceOf(wallet.address)
    const plsBalance = await provider.getBalance(wallet.address)
    console.log('🤖 Lottery Keeper Started')
    console.log('━'.repeat(50))
    console.log(`Keeper Address: ${wallet.address}`)
    console.log(`Contract: ${LOTTERY_INSTANT_ADDRESS}`)
    console.log(`RPC: ${RPC_URL}`)
    console.log('💰 Initial Balances:')
    console.log(`   PLS: ${ethers.formatEther(plsBalance)} PLS`)
    console.log(`   MORBIUS: ${ethers.formatUnits(MORBIUSBalance, 18)} MORBIUS`)
    console.log('━'.repeat(50) + '\n')
  } catch (err) {
    console.error('⚠️  Could not fetch initial balances:', err.message, '\n')
  }

  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 10
  let countdownInterval = null // Track countdown timer

  // Tracking variables for enhanced logging
  let totalGasCostPls = 0
  let transactionCount = 0

  // Buy ticket every 160 seconds (2:40 minutes)
  const TICKET_INTERVAL_MS = 3600000
  const COUNTDOWN_UPDATE_MS = 30000 // Update countdown every 30 seconds

  console.log(`🎫 Keeper will buy tickets every ${TICKET_INTERVAL_MS / 1000} seconds`)
  console.log('═'.repeat(50) + '\n')

  // Start initial countdown
  startCountdown()

  // Countdown timer function
  function startCountdown() {
    // Clear any existing countdown
    if (countdownInterval) {
      clearInterval(countdownInterval)
    }

    let timeRemaining = Math.floor(TICKET_INTERVAL_MS / 1000) // Start with full interval in seconds

    countdownInterval = setInterval(() => {
      if (timeRemaining > 0) {
        // Update countdown on same line using ANSI escape sequence
        process.stdout.write(`\r⏰ Next ticket buy in ${timeRemaining}s...`)
        timeRemaining -= 30 // Decrease by 30 seconds (since we update every 30s)
      } else {
        // Clear countdown line when finished
        process.stdout.write('\r\x1b[K')
        if (countdownInterval) {
          clearInterval(countdownInterval)
          countdownInterval = null
        }
      }
    }, COUNTDOWN_UPDATE_MS)
  }

  // Set up recurring ticket purchases
  const ticketInterval = setInterval(async () => {
    try {
      console.log(`\n${'═'.repeat(50)}`)
      console.log(`🎫 BUYING KEEPER TICKET - ${new Date().toLocaleString()}`)
      console.log('═'.repeat(50))

      // Check keeper balance
      let keeperBalance, keeperPlsBalance, ticketPrice
      try {
        keeperBalance = await MORBIUSToken.balanceOf(wallet.address)
        keeperPlsBalance = await provider.getBalance(wallet.address)

        // Try to get ticket price from contract, fallback to default if it fails
        try {
          ticketPrice = await lottery.ticketPriceMORBIUS()
        } catch (priceError) {
          console.log(`⚠️ Could not get ticket price from contract (${priceError.message}), using default price`)
          ticketPrice = ethers.parseUnits('100', 18) // Default 100 MORBIUS
        }

        console.log(`💰 Keeper Balance: ${ethers.formatUnits(keeperBalance, 18)} MORBIUS`)
        console.log(`💰 Keeper PLS Balance: ${ethers.formatEther(keeperPlsBalance)} PLS`)
        console.log(`🎫 Ticket Price: ${ethers.formatUnits(ticketPrice, 18)} MORBIUS`)
      } catch (balanceError) {
        console.log(`❌ Failed to get balances: ${balanceError.message}`)
        console.log('═'.repeat(50) + '\n')
        consecutiveErrors++
        startCountdown()
        return
      }

      if (keeperBalance >= ticketPrice) {
        console.log(`🛡️ Purchasing keeper ticket...`)

        // Check if lottery contract is approved to spend keeper's MORBIUS
        let currentAllowance
        try {
          currentAllowance = await MORBIUSToken.allowance(wallet.address, LOTTERY_INSTANT_ADDRESS)
          console.log(`🔓 Current Allowance: ${ethers.formatUnits(currentAllowance, 18)} MORBIUS`)
        } catch (allowanceError) {
          console.log(`❌ Failed to check allowance: ${allowanceError.message}`)
          console.log('═'.repeat(50) + '\n')
          consecutiveErrors++
          startCountdown()
          return
        }

        if (currentAllowance < ticketPrice) {
          console.log(`📝 Approving lottery contract to spend MORBIUS...`)
          try {
            const approveTx = await MORBIUSToken.connect(wallet).approve(LOTTERY_INSTANT_ADDRESS, ethers.MaxUint256)
            console.log(`📝 Approval Transaction: ${approveTx.hash}`)
            await approveTx.wait()
            console.log(`✅ Approval confirmed`)
          } catch (approveError) {
            console.log(`❌ Approval failed: ${approveError.message}`)
            console.log('═'.repeat(50) + '\n')
            consecutiveErrors++
            startCountdown()
            return
          }
        }

        // Generate random numbers for keeper ticket
        const keeperTicketNumbers = generateRandomTicketNumbers()
        const keeperNumbers = [keeperTicketNumbers]

        console.log(`🎲 Keeper Ticket Numbers: [${keeperTicketNumbers.join(', ')}]`)

        // Test basic contract connectivity before proceeding
        try {
          console.log(`🔍 Testing contract connectivity...`)
          const testCall = await lottery.getCurrentRoundInfo()
          console.log(`✅ Contract connectivity test passed: ${testCall[0]}`)
        } catch (connectError) {
          console.log(`❌ Contract connectivity test failed: ${connectError.message}`)
          console.log('═'.repeat(50) + '\n')
          consecutiveErrors++
          startCountdown()
          return
        }

        // Validate ticket numbers
        const invalidNumbers = keeperTicketNumbers.filter(num => num < 1 || num > 55)
        if (invalidNumbers.length > 0) {
          console.log(`❌ Invalid ticket numbers found: ${invalidNumbers.join(', ')}`)
          console.log('═'.repeat(50) + '\n')
          consecutiveErrors++
          startCountdown()
          return
        }

        // Debug contract methods

        // Check gas price - skip if over 300,000 gwei (300 gwei)
        const feeData = await provider.getFeeData()
        const currentGasPrice = feeData.gasPrice
        const currentGasPriceGwei = parseFloat(ethers.formatUnits(currentGasPrice, 'gwei'))
        const MAX_GAS_PRICE_GWEI = 350000

        console.log(`⛽ Current Gas Price: ${currentGasPriceGwei.toFixed(2)} gwei`)

        if (currentGasPriceGwei > MAX_GAS_PRICE_GWEI) {
          console.log(`⚠️ Gas price too high (${currentGasPriceGwei.toFixed(2)} gwei > ${MAX_GAS_PRICE_GWEI} gwei). Skipping transaction.`)
          console.log('═'.repeat(50) + '\n')
          consecutiveErrors = 0
          // Start countdown timer for next purchase
          startCountdown()
          return
        }

        // Transaction Performance & Network Health
        const network = await provider.getNetwork()
        const blockNumber = await provider.getBlockNumber()
        const networkName = network.chainId === 369n ? 'PulseChain' : network.name
        console.log(`📡 Network: ${networkName} (Chain ID: ${network.chainId}) (Block: ${blockNumber})`)

        // Skip gas estimation for now since it's failing
        console.log(`⛽ Skipping gas estimation (not available on contract instance)`)

        // Contract State Tracking - Before purchase
        const roundInfoBefore = await lottery.getCurrentRoundInfo()
        const roundState = await lottery.currentRoundState()
        const roundStateNum = Number(roundState) // Convert to number in case it's BigInt
        console.log(`📊 Pre-Purchase Round: ${roundInfoBefore[0]} | Tickets: ${roundInfoBefore[4]} | Players: ${roundInfoBefore[5]}`)
        console.log(`📊 Round State: ${roundStateNum === 0 ? 'OPEN' : 'FINALIZED'} (raw: ${roundState}, type: ${typeof roundState})`)

        // Check if round is open (OPEN = 0, FINALIZED = 1)
        if (roundStateNum !== 0) {
          console.log(`⚠️ Round is not open (state: ${roundStateNum}). Cannot buy tickets.`)
          console.log('═'.repeat(50) + '\n')
          consecutiveErrors++
          startCountdown()
          return
        }

        // Balance Change Tracking - Before purchase
        const balanceBefore = await MORBIUSToken.balanceOf(wallet.address)
        const plsBalanceBefore = await provider.getBalance(wallet.address)

        // This will automatically finalize expired rounds and start new ones


        // Try the transaction with detailed error handling
        let tx
        try {
          console.log(`📤 Sending transaction...`)
          tx = await lottery.buyTickets(keeperNumbers, { gasLimit: GAS_LIMIT })
          console.log(`📝 Transaction sent: ${tx.hash}`)
        } catch (txError) {
          console.log(`❌ Transaction failed to send:`, txError.message)
          console.log(`   Error code: ${txError.code}`)
          console.log(`   Error data: ${txError.data}`)
          console.log(`   Error reason: ${txError.reason}`)
          if (txError.error) {
            console.log(`   Nested error:`, txError.error.message)
          }
          console.log('═'.repeat(50) + '\n')
          consecutiveErrors++
          startCountdown()
          return
        }
        console.log(`📝 Transaction: ${tx.hash}`)
        console.log(`⏳ Waiting for confirmation...`)

        const txStart = Date.now()
        const receipt = await tx.wait()
        const txDuration = Date.now() - txStart
        console.log(`✅ Keeper ticket purchased in block ${receipt.blockNumber}`)
        console.log(`⚡ Transaction completed in ${txDuration}ms`)

        // Start countdown timer for next purchase
        startCountdown()


        // Calculate gas cost with average tracking
        const gasUsed = receipt.gasUsed
        const gasPrice = receipt.gasPrice || tx.gasPrice
        const gasCostWei = gasUsed * gasPrice
        const gasCostPls = ethers.formatEther(gasCostWei)
        totalGasCostPls += parseFloat(gasCostPls)
        transactionCount++
        const averageGasCost = totalGasCostPls / transactionCount
        console.log(`⛽ Gas Used: ${gasUsed.toString()} units`)
        console.log(`💸 Gas Cost: ${gasCostPls} PLS (Avg: ${averageGasCost.toFixed(6)} PLS)`)

        // Balance Change Tracking - After purchase
        const balanceAfter = await MORBIUSToken.balanceOf(wallet.address)
        const plsBalanceAfter = await provider.getBalance(wallet.address)
        console.log(`💰 Balance Δ: ${ethers.formatUnits(balanceAfter - balanceBefore, 18)} MORBIUS`)
        console.log(`💰 PLS Δ: ${ethers.formatEther(plsBalanceAfter - plsBalanceBefore)} PLS`)

        // Get current round info to show what happened
        try {
          const info = await lottery.getCurrentRoundInfo()
          const roundId = info[0]
          const timeRemaining = Number(info[6])
          const totalTickets = Number(info[4])
          const uniquePlayers = Number(info[5])

          console.log(`📊 Current Round Status:`)
          console.log(`   Round ID: ${roundId.toString()}`)
          console.log(`   Time Remaining: ${timeRemaining}s`)
          console.log(`   Total Tickets: ${totalTickets}`)
          console.log(`   Unique Players: ${uniquePlayers}`)

          // Contract State Tracking - After purchase
          const roundInfoAfter = await lottery.getCurrentRoundInfo()
          console.log(`📊 Post-Purchase Round: ${roundInfoAfter[0]} | Tickets: ${roundInfoAfter[4]} | Players: ${roundInfoAfter[5]}`)
        } catch (infoErr) {
          console.log(`⚠️ Could not fetch round info: ${infoErr.message}`)
        }

      } else {
        console.log(`⚠️ Keeper low on funds - cannot buy ticket`)
        console.log(`   Required: ${ethers.formatUnits(ticketPrice, 18)} MORBIUS`)
        console.log(`   Available: ${ethers.formatUnits(keeperBalance, 18)} MORBIUS`)
      }

      console.log('═'.repeat(50) + '\n')
      consecutiveErrors = 0

    } catch (err) {
      console.error(`❌ Keeper ticket purchase failed:`, err.message)
      consecutiveErrors++
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`❌ Too many consecutive errors. Stopping keeper.`)
        clearInterval(ticketInterval)
        if (countdownInterval) {
          clearInterval(countdownInterval)
        }
        process.exit(1)
      }
    }
  }, TICKET_INTERVAL_MS)

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received shutdown signal. Stopping keeper...')
    clearInterval(ticketInterval)
    if (countdownInterval) {
      clearInterval(countdownInterval)
    }
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received termination signal. Stopping keeper...')
    clearInterval(ticketInterval)
    if (countdownInterval) {
      clearInterval(countdownInterval)
    }
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('💥 Fatal error:', err)
  process.exit(1)
})
