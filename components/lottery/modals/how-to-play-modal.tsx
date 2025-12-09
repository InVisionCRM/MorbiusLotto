'use client'

export function HowToPlayModal() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
      <div>
        <h4 className="font-semibold mb-3 text-base">How to Play</h4>
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li>Pick 6 unique numbers from 1 to 55</li>
          <li>Each ticket costs 1 Morbius (18 decimals)</li>
          <li>Buy up to 10 tickets per transaction</li>
          <li>Match more numbers to win bigger prizes</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold mb-3 text-base">Prize Distribution</h4>
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li>60% of ticket sales goes to winners (brackets)</li>
          <li>20% goes to MegaMorbius progressive jackpot</li>
          <li>20% is burned (supply reduction)</li>
          <li>Zero-winner bracket: 75% rolls to next round, 25% to MegaMorbius</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold mb-3 text-base">MegaMorbius</h4>
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li>Triggers every 5th round (current setting)</li>
          <li>Entire MegaMorbius bank distributed to all winning brackets</li>
          <li>Resets after distribution</li>
        </ul>
      </div>
      <div>
        <h4 className="font-semibold mb-3 text-base">Free Tickets</h4>
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li>Earn 1 credit per non-winning ticket</li>
          <li>Credits applied automatically at purchase</li>
          <li>Never expire</li>
        </ul>
      </div>
    </div>
  )
}

