"use client"

interface KenoTicketBarcodeProps {
  value: string
}

export function KenoTicketBarcode({ value }: KenoTicketBarcodeProps) {
  // Generate a simple visual barcode pattern from the ticket ID
  const generateBars = () => {
    const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const bars: number[] = []
    
    for (let i = 0; i < 40; i++) {
      // Generate bar widths (1-4 pixels) - all bars same height
      const barWidth = ((hash + i * 7) % 4) + 1
      bars.push(barWidth)
    }
    
    return bars
  }

  const bars = generateBars()

  return (
    <div className="flex items-center justify-center gap-[1px] h-12 bg-white p-1">
      {bars.map((width, idx) => (
        <div
          key={idx}
          className="bg-black h-full"
          style={{
            width: `${width}px`,
            minWidth: '1px',
          }}
        />
      ))}
    </div>
  )
}

