/**
 * Predict winning numbers for InstantLottery6of55 for a given block.
 * Uses the same RNG logic as the contract: keccak256(blockhash(block.number-1), timestamp, sender, playNonce, gasprice).
 *
 * Usage (run from contracts/ directory):
 *   npx hardhat run scripts/lottery/predict-instant-lottery.js --network pulsechain
 *
 * Env / defaults:
 *   PREDICT_BLOCK=next   "next" (first play in next block) or a block number
 *   PREDICT_SENDER=0x... Your address (default: first Hardhat signer)
 *   PREDICT_PLAYNONCE=   Override play nonce (default: read from contract for "next", else 0)
 *   PREDICT_GASPRICE=40  Gas in gwei (default 40)
 *   LOTTERY_INSTANT_ADDRESS=0x...  Contract (default: 0xF9a5...)
 *
 * For "next": reads contract's playNonce so "first play in next block" is accurate. Use the same gas when submitting.
 * If your tx is the only play in the block, the contract will draw these numbers.
 *
 * Caveat: For PREDICT_BLOCK=next we assume next block's timestamp is current+1; validators can set it within range.
 */

const hre = require('hardhat')

const LOTTERY_INSTANT_DEFAULT = '0x884843787be5c0387F38722d9e4F2ab1E93c25D8'

const MAX_NUMBER = 55
const NUMBERS_PER_TICKET = 6

function toBytes32Hex(val) {
  const hex = typeof val === 'bigint' ? val.toString(16) : Number(val).toString(16)
  return '0x' + hex.padStart(64, '0').slice(-64)
}

function toAddressBytes20(addr) {
  const a = addr.startsWith('0x') ? addr.slice(2).toLowerCase() : addr.toLowerCase()
  return '0x' + a.padStart(40, '0').slice(-40)
}

function packedKeccak256(parts) {
  const concat = parts.map((p) => (p.startsWith('0x') ? p.slice(2) : p)).join('')
  const hash = hre.ethers.keccak256('0x' + concat)
  return BigInt(hash)
}

function ensureBytes32(blockHash) {
  const h = blockHash.startsWith('0x') ? blockHash.slice(2) : blockHash
  return '0x' + h.padStart(64, '0').slice(-64)
}

function generateWinningNumbers(prevBlockHash, blockTimestamp, sender, playNonce, gasPriceGwei) {
  const gasPriceWei = hre.ethers.parseUnits(String(gasPriceGwei), 'gwei')
  const seed = packedKeccak256([
    ensureBytes32(prevBlockHash),
    toBytes32Hex(blockTimestamp),
    toAddressBytes20(sender),
    toBytes32Hex(playNonce),
    toBytes32Hex(gasPriceWei),
  ])

  const used = new Set()
  const numbers = []
  let currentSeed = seed

  for (let i = 0; i < NUMBERS_PER_TICKET; i++) {
    let attempts = 0
    let num
    do {
      currentSeed = packedKeccak256([
        toBytes32Hex(currentSeed),
        toBytes32Hex(i),
        toBytes32Hex(attempts),
      ])
      num = Number(currentSeed % BigInt(MAX_NUMBER)) + 1
      attempts++
      if (attempts > 100) throw new Error('RNG failed (duplicate overflow)')
    } while (used.has(num))
    used.add(num)
    numbers.push(num)
  }

  numbers.sort((a, b) => a - b)
  return numbers
}

async function main() {
  const provider = hre.ethers.provider
  const [signer] = await hre.ethers.getSigners()
  const sender = process.env.PREDICT_SENDER || signer.address
  const gasPriceGwei = process.env.PREDICT_GASPRICE ?? '40'
  const contractAddress = process.env.LOTTERY_INSTANT_ADDRESS || process.env.NEXT_PUBLIC_LOTTERY_INSTANT_ADDRESS || LOTTERY_INSTANT_DEFAULT

  const blockOpt = process.env.PREDICT_BLOCK || 'next'
  let blockNumber, prevBlockHash, blockTimestamp
  let playNonce

  if (blockOpt === 'next') {
    const current = await provider.getBlock('latest')
    if (process.env.PREDICT_PLAYNONCE !== undefined && process.env.PREDICT_PLAYNONCE !== '') {
      playNonce = BigInt(process.env.PREDICT_PLAYNONCE)
    } else {
      const lottery = await hre.ethers.getContractAt('InstantLottery6of55', contractAddress)
      playNonce = await lottery.playNonce()
    }
    blockNumber = BigInt(current.number) + 1n
    prevBlockHash = current.hash
    blockTimestamp = BigInt(current.timestamp) + 1n
    console.log('Predicting for NEXT block (current:', String(current.number), ')')
  } else {
    playNonce = BigInt(process.env.PREDICT_PLAYNONCE ?? '0')
    const bn = BigInt(blockOpt)
    const block = await provider.getBlock(bn)
    if (!block) throw new Error('Block not found: ' + blockOpt)
    const prev = await provider.getBlock(bn - 1n)
    blockNumber = bn
    prevBlockHash = prev ? prev.hash : '0x' + '00'.repeat(32)
    blockTimestamp = BigInt(block.timestamp)
    console.log('Predicting for block', blockNumber.toString())
  }

  console.log('Prev block hash:', prevBlockHash)
  console.log('Timestamp:     ', blockTimestamp.toString())
  console.log('Sender:        ', sender)
  console.log('Play nonce:    ', playNonce.toString())
  console.log('Gas (gwei):    ', gasPriceGwei)

  const numbers = generateWinningNumbers(
    prevBlockHash,
    blockTimestamp,
    sender,
    playNonce,
    gasPriceGwei
  )

  console.log('\nPredicted winning numbers (sorted):', numbers.join(', '))
  console.log('Ticket to submit:                  [' + numbers.join(', ') + ']')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
