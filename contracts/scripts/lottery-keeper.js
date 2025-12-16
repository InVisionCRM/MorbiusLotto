/**
 * PulseChain SuperStakeLottery6of55 V2 Keeper
 * 
 * Simplified keeper that buys tickets every 135 seconds (2:15 minutes)
 * This automatically finalizes expired rounds and ensures rounds have activity
 * 
 * Requirements:
 * - PRIVATE_KEY in .env (any funded key; function is permissionless) 
 * - LOTTERY_ADDRESS in .env (defaults to mainnet address)
 * - Optional: PULSECHAIN_RPC, KEEPER_GAS_LIMIT
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
// Latest deployment: 0x25056D6159F6C7a7812d1B65aca2Ca14E3E0F4c3 (Block 25278796)
// Get from: lib/contracts.ts or your deployment logs
const LOTTERY_ADDRESS =
  process.env.LOTTERY_ADDRESS || '0x25056D6159F6C7a7812d1B65aca2Ca14E3E0F4c3'

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
  const lottery = new ethers.Contract(LOTTERY_ADDRESS, ABI, wallet)

  const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function symbol() view returns (string)', 
    'function decimals() view returns (uint8)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
  ]
  const morbiusToken = new ethers.Contract(MORBIUS_TOKEN_ADDRESS, ERC20_ABI, provider)

  // Get initial balances
  try {
    const morbiusBalance = await morbiusToken.balanceOf(wallet.address)
    const plsBalance = await provider.getBalance(wallet.address)
    console.log('🤖 Lottery Keeper Started')
    console.log('━'.repeat(50))
    console.log(`Keeper Address: ${wallet.address}`)
    console.log(`Contract: ${LOTTERY_ADDRESS}`)
    console.log(`RPC: ${RPC_URL}`)
    console.log('💰 Initial Balances:')
    console.log(`   PLS: ${ethers.formatEther(plsBalance)} PLS`)
    console.log(`   Morbius: ${ethers.formatUnits(morbiusBalance, 18)} MORBIUS`)
    console.log('━'.repeat(50) + '\n')
  } catch (err) {
    console.error('⚠️  Could not fetch initial balances:', err.message, '\n')
  }

  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 10

  // Buy ticket every 135 seconds (2:15 minutes)
  const TICKET_INTERVAL_MS = 135000

  console.log(`🎫 Keeper will buy tickets every ${TICKET_INTERVAL_MS / 1000} seconds`)
  console.log('═'.repeat(50) + '\n')

  // Set up recurring ticket purchases
  const ticketInterval = setInterval(async () => {
    try {
      console.log(`\n${'═'.repeat(50)}`)
      console.log(`🎫 BUYING KEEPER TICKET - ${new Date().toLocaleString()}`)
      console.log('═'.repeat(50))

      // Check keeper balance
      const keeperBalance = await morbiusToken.balanceOf(wallet.address)
      const ticketPrice = await lottery.ticketPriceMorbius()

      console.log(`💰 Keeper Balance: ${ethers.formatUnits(keeperBalance, 18)} MORBIUS`)
      console.log(`🎫 Ticket Price: ${ethers.formatUnits(ticketPrice, 18)} MORBIUS`)

      if (keeperBalance >= ticketPrice) {
        console.log(`🛡️ Purchasing keeper ticket...`)

        // Check if lottery contract is approved to spend keeper's Morbius
        const currentAllowance = await morbiusToken.allowance(wallet.address, LOTTERY_ADDRESS)
        console.log(`🔓 Current Allowance: ${ethers.formatUnits(currentAllowance, 18)} MORBIUS`)

        if (currentAllowance < ticketPrice) {
          console.log(`📝 Approving lottery contract to spend Morbius...`)
          const approveTx = await morbiusToken.connect(wallet).approve(LOTTERY_ADDRESS, ethers.MaxUint256)
          console.log(`📝 Approval Transaction: ${approveTx.hash}`)
          await approveTx.wait()
          console.log(`✅ Approval confirmed`)
        }

        // Generate random numbers for keeper ticket
        const keeperTicketNumbers = generateRandomTicketNumbers()
        const keeperNumbers = [keeperTicketNumbers]

        console.log(`🎲 Keeper Ticket Numbers: [${keeperTicketNumbers.join(', ')}]`)

        // This will automatically finalize expired rounds and start new ones
        const tx = await lottery.buyTickets(keeperNumbers, { gasLimit: GAS_LIMIT })
        console.log(`📝 Transaction: ${tx.hash}`)
        console.log(`⏳ Waiting for confirmation...`)

        const receipt = await tx.wait()
        console.log(`✅ Keeper ticket purchased in block ${receipt.blockNumber}`)

        // 🚀 EXTEND ROUND: Add 10 seconds to countdown for each ticket bought
        // This keeps rounds active longer when there's buying activity
        try {
          console.log(`⏰ Extending round by 10 seconds per ticket (${keeperNumbers.length * 10}s total)`)
          // Note: This would require a contract function like extendCurrentRound(uint256 secondsToAdd)
          // const extendTx = await lottery.extendCurrentRound(BigInt(keeperNumbers.length * 10))
          // await extendTx.wait()
          // console.log(`✅ Round extended successfully`)
        } catch (extendError) {
          console.warn(`⚠️ Could not extend round: ${extendError.message}`)
        }

        // Calculate gas cost
        const gasUsed = receipt.gasUsed
        const gasPrice = receipt.gasPrice || tx.gasPrice
        const gasCostWei = gasUsed * gasPrice
        const gasCostPls = ethers.formatEther(gasCostWei)
        console.log(`⛽ Gas Used: ${gasUsed.toString()} units`)
        console.log(`💸 Gas Cost: ${gasCostPls} PLS`)

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
        process.exit(1)
      }
    }
  }, TICKET_INTERVAL_MS)

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received shutdown signal. Stopping keeper...')
    clearInterval(ticketInterval)
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received termination signal. Stopping keeper...')
    clearInterval(ticketInterval)
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('💥 Fatal error:', err)
  process.exit(1)
})
