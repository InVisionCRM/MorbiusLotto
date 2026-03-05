'use client'

const SCAN_IFRAME_URL = 'https://scan.morbius.io/geicko?address=0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1&tab=chart'

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
}

export function MorbiusInfoSection() {
  return (
    <section id="what-is-morbius" className="w-full max-w-2xl mx-auto px-4 py-12 md:py-16 scroll-mt-20">
      <div className="text-center mb-12 md:mb-16">
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-5">
          What is Morbius?
        </h2>
        <p className="text-white/50 text-sm mt-4 max-w-2xl mx-auto leading-relaxed">
          The Morbius token was created on Pump.Tires on PulseChain on November 11th, 2025. Holders of Morbius may see direct benefits from holding the token but it is not required to play any games on the site.
        </p>
        <h2 className="text-2xl md:text-4xl font-russo-one font-normal mt-8 mb-4 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          Not just a game, but a tokenomics engine.
        </h2>
        <p className="text-white/90 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
          Morbius was created to prove the power of what a simple meme coin can become. The Morbius Platform is built for the community and to bring more utility to not only Morbius Token but anyones tokens, especially to those who are new to the space. Weones launched on Pump.Tires. We will try to garner the most utility possible through partnerships and building. Currently, $Morbius is the token used to play games on morbius.io and the rewards token given to holders and LP providers.
        </p>
      </div>

      <div className="text-center mb-10 md:mb-12">
        <h3 className="text-2xl md:text-3xl font-russo-one font-normal text-cyan-500 mb-4">
          The Morbius Token Analyzer!
        </h3>
        <p className="text-white/70 text-sm md:text-base max-w-xl mx-auto leading-relaxed mt-2">
          The top token analyzer on PulseChain, built for PulseChain users. Get everything you need to invest safely and make informed decisions—contract data, charts, holder info, and more in one place.
        </p>
      </div>

      <div
        className="rounded-2xl border border-cyan-500/80 overflow-hidden mt-4"
        style={PANEL_STYLE}
      >
        <iframe
          src={SCAN_IFRAME_URL}
          title="MORBIUS token chart and data"
          className="w-full h-[800px] border-2 border-cyan-500/30 bg-transparent"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </section>
  )
}
