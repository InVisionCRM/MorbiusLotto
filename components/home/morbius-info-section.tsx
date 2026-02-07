'use client'

const GEICKO_IFRAME_URL = 'https://morbius.io/geicko?address=0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1&tab=chart'

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

export function MorbiusInfoSection() {
  return (
    <section className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-2">
          Morbius Token
        </h2>
        <p className="text-white/50 text-sm">
          The Morbius token was created on Pump.Tires on PulseChain on November 11th, 2025. Holders of Morbius may be see direct benefits from holding the token but it is not required to play any games on the site. 
        </p>
      </div>
      <div
        className="rounded-2xl border border-cyan-500/80 overflow-hidden"
        style={PANEL_STYLE}
      >
        <iframe
          src={GEICKO_IFRAME_URL}
          title="MORBIUS token chart and data"
          className="w-full h-[800px] border-2 border-cyan-500/30 bg-transparent"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </section>
  )
}
