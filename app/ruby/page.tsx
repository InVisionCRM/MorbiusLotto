import type { Metadata } from 'next'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { Footer } from '@/components/shared/footer'
import '../home2.css'
import './ruby.css'

/**
 * /ruby — landing page for Ruby's Table, the private-beta AI live-dealer
 * blackjack game. Port of the approved "Take a seat" intro screen
 * (Ruby's Table v7 mockups, 06-intro): Ruby full-bleed, her greeting bubble,
 * and the ruby-glass card with the gold Take a seat CTA.
 *
 * The game is a separate app behind its own password gate; its session
 * cookie is SameSite=Lax, so it can't run in a cross-site iframe on iOS
 * Safari. The CTA links out to it in the same tab instead.
 *
 * Server component: static markup only, no page-specific client JS. Styles
 * reuse the home2 tokens (scoped under .home2) plus ./ruby.css.
 */

const RUBY_URL = 'https://rubys-table.vercel.app/?from=morbius'

const TITLE = "Ruby's Table — Live AI Dealer Blackjack"
const DESCRIPTION =
  'Blackjack with a real, filmed dealer who talks back. Talk to Ruby, ask her for a wink, a shuffle or a blown kiss, and take a seat at her private table.'

export const metadata: Metadata = {
  metadataBase: new URL('https://morbius.io'),
  title: `${TITLE} | MORBIUS`,
  description: DESCRIPTION,
  alternates: { canonical: '/ruby' },
  openGraph: {
    type: 'website',
    url: '/ruby',
    siteName: 'MORBIUS',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/ruby/ruby-og.jpg', width: 1200, height: 630, alt: "Ruby, the dealer at Ruby's Table" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/ruby/ruby-og.jpg'],
  },
}

const FEATS = [
  { e: '🎙️', t: 'Talk', d: 'Voice · text' },
  { e: '💋', t: '53 moves', d: 'Just ask' },
  { e: '🃏', t: 'Side bets', d: 'PP · 21+3' },
]

const CHIPS = ['red', 'green', 'black', 'blue']

export default function RubyPage() {
  return (
    <GlobalMainNav>
      <div className="home2 ruby-page">
        <main className="rb-stage">
          <div className="rb-hero">
            <img
              className="rb-photo"
              src="/ruby/ruby-hero.webp"
              alt="Ruby standing behind her blackjack table, smiling"
              width={1280}
              height={720}
              fetchPriority="high"
              decoding="async"
            />
            <div className="rb-shade" aria-hidden="true" />
            <div className="rb-greet">
              <div className="rb-who">
                <i aria-hidden="true" />
                Ruby
              </div>
              Hey, you. I saved you the best seat in the house.
            </div>
          </div>

          <section className="rb-card" aria-labelledby="rb-title">
            <span className="rb-eyebrow">
              <i aria-hidden="true" />
              Live AI dealer · private table
            </span>
            <h1 id="rb-title">
              Ruby&rsquo;s <span>Table</span>
            </h1>
            <p className="rb-lead">
              Blackjack with a real, filmed dealer who talks back. Ask her for a wink, a shuffle, a
              little dance&hellip;
            </p>

            <ul className="rb-feats">
              {FEATS.map((f) => (
                <li key={f.t}>
                  <span className="rb-e" aria-hidden="true">
                    {f.e}
                  </span>
                  <span>
                    <b>{f.t}</b>
                    <small>{f.d}</small>
                  </span>
                </li>
              ))}
            </ul>

            <div className="rb-limits">
              <span>6 decks · S17 · BJ pays 3:2</span>
              <span className="rb-chips" aria-hidden="true">
                {CHIPS.map((c) => (
                  <img key={c} src={`/ruby/chip-${c}.webp`} alt="" width={26} height={26} />
                ))}
              </span>
            </div>

            <a className="rb-cta" href={RUBY_URL}>
              Take a seat
            </a>

            <p className="rb-fine">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 4.7 6.6 8.3a2 2 0 0 1-1.3.5H3.5a1 1 0 0 0-1 1v4.4a1 1 0 0 0 1 1h1.8a2 2 0 0 1 1.3.5L11 19.3a.6.6 0 0 0 1-.4V5.1a.6.6 0 0 0-1-.4Z" />
                <path d="M16 9a5 5 0 0 1 0 6" />
                <path d="M19.4 18.4a9 9 0 0 0 0-12.8" />
              </svg>
              Sound on — Ruby talks. Hold the chip to talk back.
            </p>
            <p className="rb-beta">
              <span aria-hidden="true">🔒</span> Private beta · password required
            </p>
          </section>
        </main>
        <Footer />
      </div>
    </GlobalMainNav>
  )
}
