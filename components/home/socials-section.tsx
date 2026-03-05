export function SocialsSection() {
  return (
    <section className="py-4 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="rounded-2xl p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-2">
            Join the Community
          </h2>
          <p className="text-white/50 text-sm">
            Follow Morbius on social media for the latest updates and announcements.
          </p>
        </div>

        <div className="flex justify-center items-center gap-12 md:gap-16">
          {/* X.com */}
          <a
            href="https://x.com/morbius_io"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-4 hover:scale-105 transition-transform duration-300"
          >
            <div className="text-6xl md:text-7xl text-purple-500 group-hover:text-cyan-400 transition-colors duration-300">
              <svg className="w-16 h-16 md:w-20 md:h-20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            <span className="text-lg font-medium text-white group-hover:text-cyan-400 transition-colors duration-300">
              X.com
            </span>
          </a>

          {/* Telegram */}
          <a
            href="https://t.me/morbius_cash"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-4 hover:scale-105 transition-transform duration-300"
          >
            <div className="text-6xl md:text-7xl text-purple-500 group-hover:text-cyan-400 transition-colors duration-300">
              <i className="fab fa-telegram"></i>
            </div>
            <span className="text-lg font-medium text-white group-hover:text-cyan-400 transition-colors duration-300">
              Telegram
            </span>
          </a>
        </div>
        </div>
      </div>
    </section>
  )
}
