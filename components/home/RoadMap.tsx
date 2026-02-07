'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useOutsideClick } from '@/hooks/use-outside-click';

type CardItem = {
  title: string;
  description: string;
  src: string;
  ctaText: string;
  ctaLink: string;
  content: () => React.ReactNode;
};

const ROADMAP_CARDS: CardItem[] = [
  {
    title: 'Tournaments',
    description: 'Fully automated, verifiable, and built for communities.',
    src: '/BlackJack/Tournament-Promo/EnterNow.jpg',
    ctaText: 'Enter now',
    ctaLink: '/BLACKJACK',
    content: () => (
      <>
        <p className="text-white/90 text-sm leading-relaxed">
          We give founders and communities an extra tool to keep engagement high and curate events that matter. Add your own images and branding so your tournaments keep your community&apos;s identity front and center — and stay number one when it counts.
        </p>
        <p className="text-white/90 text-sm leading-relaxed">
          Everything runs fully automated with verifiable, on-chain proof. That means you can host with confidence: not just one tournament, but many more to come.
        </p>
        <p className="text-cyan-300/90 text-sm font-medium">
          Use your own token as prizes. Same automation, same verifiable proof — your token, your rules.
        </p>
      </>
    ),
  },
  {
    title: 'Custom Slot Machines',
    description: 'Built for communities.',
    src: '/morbius/Slots.png',
    ctaText: 'Learn more',
    ctaLink: '/slot-machines',
    content: () => (
      <p className="text-white/90 text-sm leading-relaxed">
        Custom slot experiences designed for communities. Branded reels, themes, and mechanics that keep your audience engaged and coming back. Fully on-chain and provably fair.
      </p>
    ),
  },
  {
    title: 'Texas Hold’em Live',
    description: 'Live poker, on-chain.',
    src: '/morbius/Poker.png',
    ctaText: 'Coming soon',
    ctaLink: '#',
    content: () => (
      <p className="text-white/90 text-sm leading-relaxed">
        Live Texas Hold’em at the Morbius table. Play against others with verifiable hands and payouts. Built for communities that want real poker action with real stakes and real proof.
      </p>
    ),
  },
  {
    title: 'Sponsorship & Advertising',
    description: 'Real revenue and brand development.',
    src: '/morbius/Sponsorship.png',
    ctaText: 'Get in touch',
    ctaLink: '#',
    content: () => (
      <p className="text-white/90 text-sm leading-relaxed">
        Sponsorship and advertising opportunities to create real revenue and further brand development. Partner with Morbius to reach engaged gaming communities and grow your presence on-chain.
      </p>
    ),
  },
];

function CloseIcon() {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.05 } }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-white"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </motion.svg>
  );
}

export function RoadMap() {
  const [active, setActive] = useState<CardItem | null>(null);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActive(null);
    }
    if (active) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  useOutsideClick(ref, () => setActive(null));

  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-cyan-500 mb-2">
          Roadmap
        </h2>
        <p className="text-white/50 text-sm">
          What we’re building for communities.
        </p>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 h-full w-full z-10"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active ? (
          <div className="fixed inset-0 grid place-items-center z-[100] p-4">
            <motion.button
              type="button"
              key={`button-${active.title}-${id}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="flex absolute top-4 right-4 lg:hidden items-center justify-center bg-slate-800 border border-cyan-500/30 rounded-full h-10 w-10 text-white z-[101]"
              onClick={() => setActive(null)}
              aria-label="Close"
            >
              <CloseIcon />
            </motion.button>
            <motion.div
              layoutId={`card-${active.title}-${id}`}
              ref={ref}
              className="w-full max-w-lg flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl overflow-hidden shadow-2xl"
              style={{
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(6, 182, 212, 0.2)',
              }}
            >
              <motion.div layoutId={`image-${active.title}-${id}`} className="relative w-full aspect-[3/2] max-h-64 shrink-0">
                <Image
                  src={active.src}
                  alt={active.title}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 512px) 100vw, 512px"
                />
              </motion.div>
              <div className="p-4 flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <motion.h3
                      layoutId={`title-${active.title}-${id}`}
                      className="font-russo-one text-lg text-white"
                    >
                      {active.title}
                    </motion.h3>
                    <motion.p
                      layoutId={`description-${active.description}-${id}`}
                      className="text-white/60 text-sm mt-0.5"
                    >
                      {active.description}
                    </motion.p>
                  </div>
                  <Link
                    href={active.ctaLink}
                    onClick={() => setActive(null)}
                    className="px-4 py-2.5 text-sm rounded-full font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 transition-colors shrink-0"
                  >
                    {active.ctaText}
                  </Link>
                </div>
                <motion.div
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-3 overflow-auto max-h-48 [mask:linear-gradient(to_bottom,white,white,transparent)]"
                >
                  {active.content()}
                </motion.div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <ul className="grid grid-cols-2 gap-4">
        {ROADMAP_CARDS.map((card) => (
          <motion.li
            key={card.title}
            layoutId={`card-${card.title}-${id}`}
            onClick={() => setActive(card)}
            className="cursor-pointer rounded-2xl overflow-hidden border-2 border-cyan-500/30 hover:border-cyan-400/50 transition-colors bg-gradient-to-br from-slate-900/90 to-slate-800/80 shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.05),0_1px_3px_rgba(0,0,0,0.5)]"
          >
            <div className="flex flex-col">
              <motion.div layoutId={`image-${card.title}-${id}`} className="relative w-full aspect-[3/2] max-h-44 shrink-0">
                <Image
                  src={card.src}
                  alt={card.title}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </motion.div>
              <div className="p-4 flex flex-col gap-1">
                <motion.h3
                  layoutId={`title-${card.title}-${id}`}
                  className="font-russo-one text-base text-white"
                >
                  {card.title}
                </motion.h3>
                <motion.p
                  layoutId={`description-${card.description}-${id}`}
                  className="text-white/60 text-sm"
                >
                  {card.description}
                </motion.p>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
