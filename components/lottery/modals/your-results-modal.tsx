'use client'

interface YourResultsModalProps {
  address?: `0x${string}`
  displayRoundId: number
  isLoadingTicketsFinal: boolean
  winningNumbers: readonly (number | bigint)[]
  roundState: number
  winningTickets: Array<{
    ticketId: bigint
    matches: number
    payout: bigint
    numbers: readonly (number | bigint)[]
  }>
  totalWinningPssh: bigint
  formatPssh: (amount: bigint) => string
}

export function YourResultsModal({
  address,
  displayRoundId,
  isLoadingTicketsFinal,
  winningNumbers,
  roundState,
  winningTickets,
  totalWinningPssh,
  formatPssh,
}: YourResultsModalProps) {
  return (
    <div className="space-y-4">
      {!address ? (
        <p className="text-sm text-white/60">Connect your wallet to see your results.</p>
      ) : isLoadingTicketsFinal ? (
        <p className="text-sm text-white/60">Loading your tickets...</p>
      ) : winningNumbers.length !== 6 || roundState !== 2 ? (
        <p className="text-sm text-white/60">Waiting for the round to finalize.</p>
      ) : winningTickets.length === 0 ? (
        <p className="text-sm text-white/60">No winning tickets last round.</p>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-white/80">
            Total Winnings: <span className="font-semibold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">{formatPssh(totalWinningPssh)} pSSH</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {winningTickets.map((t, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-white/10 bg-black/50 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded bg-white/10 text-white font-semibold">
                    Ticket #{t.ticketId.toString()}
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-pink-500/20 text-white font-semibold border border-white/10">
                    {t.matches} match{t.matches !== 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap text-sm text-white/60">
                  {t.numbers.map((n, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-white/10 text-white">
                      {Number(n)}
                    </span>
                  ))}
                </div>
                <div className="text-sm font-semibold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
                  +{formatPssh(t.payout)} pSSH
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

