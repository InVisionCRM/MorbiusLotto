import type { Metadata } from 'next'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { Footer } from '@/components/shared/footer'
import '../home2.css'
import './ruby.css'

/**
 * /ruby — landing page for Ruby's Table, the private-beta AI live-dealer
 * blackjack game. The game itself is a separate app with its own password
 * gate; its session cookie is SameSite=Lax, so it can't run in a cross-site
 * iframe on iOS Safari. This page links out to it in the same tab instead.
 *
 * Server component: static markup only, no page-specific client JS. Styles
 * reuse the home2 tokens (scoped under .home2) plus ./ruby.css.
 */

const RUBY_URL = 'https://rubys-table.vercel.app/?from=morbius'

const TITLE = "Ruby's Table — Live AI Dealer Blackjack"
const DESCRIPTION =
  'Sit down with Ruby, a filmed live dealer with an AI voice. Talk to her, ask her to wave, shuffle or blow a kiss, and play blackjack one-on-one. Private beta.'

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
  { ic: '🎙️', t: 'Talk to her', d: 'hold the mic and chat, she answers out loud' },
  { ic: '👋', t: 'Ask for a move', d: 'wave, shuffle or blow you a kiss' },
  { ic: '🎥', t: 'Real filmed dealer', d: 'photoreal video, not a cartoon' },
  { ic: '🃏', t: 'One-on-one blackjack', d: 'hit, stand, double & split' },
]

export default function RubyPage() {
  return (
    <GlobalMainNav>
      <div className="home2 ruby-page">
        <section className="zone ruby-zone">
          <div className="ruby-panel">
            <div className="ruby-shot">
              <img
                src="/ruby/ruby-hero.webp"
                alt="Ruby standing behind the blackjack table, smiling, chips in the tray"
                width={1280}
                height={720}
                fetchPriority="high"
                decoding="async"
              />
              <div className="ruby-tags">
                <span className="ruby-tag new">New</span>
                <span className="ruby-tag live">
                  <i aria-hidden="true" /> AI Live Dealer
                </span>
              </div>
            </div>

            <div className="ruby-copy">
              <div className="ruby-kicker">BLACKJACK &middot; PRIVATE BETA</div>
              <h1>
                Ruby&rsquo;s <em>Table</em>
              </h1>
              <p className="ruby-tagline">Live AI dealer blackjack</p>
              <p className="ruby-lede">
                Ruby deals, reacts and talks back. Ask her how her night is going,
                tell her to shuffle up, or just play your hand &mdash; she&rsquo;s{' '}
                <b>listening</b>.
              </p>

              <ul className="ruby-feats">
                {FEATS.map((f) => (
                  <li key={f.t}>
                    <span className="fi" aria-hidden="true">
                      {f.ic}
                    </span>
                    <span className="ft">
                      <b>{f.t}</b>
                      <i>{f.d}</i>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="ruby-cta-row">
                <a className="ruby-cta" href={RUBY_URL}>
                  Take a seat <span aria-hidden="true">→</span>
                </a>
                <p className="ruby-note">
                  <span aria-hidden="true">🔒</span>
                  <span>
                    <b>Private beta &middot; password required.</b> Ruby&rsquo;s Table
                    opens in its own lobby. Best with sound on and the mic allowed.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    </GlobalMainNav>
  )
}
