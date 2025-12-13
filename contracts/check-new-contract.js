const ethers = require('ethers')

const RPC = 'https://rpc.pulsechain.com'
const CONTRACT_ADDRESS = '0x91fFE6630f15E91Ad23160D17F103FFb88442806'

const ABI = [
  'function getCurrentRoundInfo() view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 totalPssh, uint256 totalTickets, uint256 uniquePlayers, uint256 timeRemaining, bool isMegaMillionsRound, uint8 state)',
  'function getRound(uint256 roundId) view returns (tuple(uint256 roundId, uint256 startTime, uint256 endTime, uint256 closingBlock, uint256 drawBlock, uint8[6] winningNumbers, uint256 totalMorbiusCollected, uint256 totalTickets, uint256 uniquePlayers, tuple(uint256 matchCount, uint256 poolAmount, uint256 winnerCount, uint256 payoutPerWinner, uint256[] winningTicketIds)[6] brackets, uint256 megaBankContribution, bool isMegaMillionsRound, uint8 state))'
]

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC)
  const lottery = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider)

  console.log('Checking new contract:', CONTRACT_ADDRESS)
  
  const currentInfo = await lottery.getCurrentRoundInfo()
  console.log('\n=== CURRENT ROUND ===')
  console.log('Round ID:', currentInfo[0].toString())
  console.log('State:', ['OPEN', 'FINALIZED'][Number(currentInfo[8])] || currentInfo[8].toString())
  console.log('Tickets:', currentInfo[4].toString())
  console.log('Time Remaining:', currentInfo[6].toString(), 'seconds')

  // Check previous rounds
  const currentRoundId = Number(currentInfo[0])
  for (let i = 1; i < currentRoundId && i <= 3; i++) {
    console.log(`\n=== ROUND ${i} ===`)
    try {
      const round = await lottery.getRound(i)
      console.log('State:', ['OPEN', 'FINALIZED'][Number(round.state)] || round.state.toString(), `(${Number(round.state)})`)
      console.log('Total Tickets:', round.totalTickets.toString())
      console.log('Winning Numbers:', Array.from(round.winningNumbers).map(n => Number(n)).join(', '))
      console.log('Closing Block:', round.closingBlock.toString())
    } catch (err) {
      console.log('Error:', err.message)
    }
  }
}

main().catch(console.error)
