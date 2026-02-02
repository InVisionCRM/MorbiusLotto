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
    <div
      className="flex items-center justify-center gap-[1px] h-12 p-1 relative"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      {/* Radial gradient overlay */}
      <div className="relative z-10 flex items-center justify-center gap-[1px] h-full w-full">
      {bars.map((width, idx) => (
        <div
          key={idx}
          className="bg-white h-full"
          style={{
            width: `${width}px`,
            minWidth: '1px',
          }}
        />
      ))}
      </div>
    </div>
  )
}

