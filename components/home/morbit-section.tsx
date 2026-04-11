'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { IconBrandTelegram } from '@tabler/icons-react'
import {
  homeSectionHeading2Class,
  homeSectionSubtitleClass,
  homeSectionTitleClass,
  homeSectionTitleGradientClass,
} from '@/lib/home-section-typography'

const fadeIn = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
}

export function MorbItSection() {
  return (
    <section className="relative py-24 px-4 overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 pointer-events-none" />

      <div className="container mx-auto max-w-4xl relative z-10">
        {/* Header — matches other home sections */}
        <motion.div
          className="text-center mb-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeIn}
        >
          <h2 className="text-4xl font-russo-one font-normal text-cyan-500 md:text-5xl lg:text-6xl mb-2">
            The MORB NATION
          </h2>
          <p className="text-white/50 text-sm">
            Community Tools
          </p>
        </motion.div>

        {/* Main Content Card */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeIn}
        >
          <div className="p-8 md:p-12 rounded-2xl">
              {/* Community Message */}
              <div className="text-center mb-10">
                <h3 className={cn(homeSectionHeading2Class, 'mb-6')}>
                  <span className="text-white">Without Our Community, </span>
                  <span className={homeSectionTitleGradientClass}>We Are Nothing</span>
                </h3>
                <p className="text-lg text-white/80 font-prosto-one max-w-2xl mx-auto leading-relaxed mb-6">
                  In crypto, projects come and go. Without a loyal community, even the best ideas fade to dust.
                  We&apos;ve seen it happen countless times - great potential, zero community, forgotten forever.
                </p>
                <p className="text-lg text-white/80 font-prosto-one max-w-2xl mx-auto leading-relaxed">
                  That&apos;s why we want to thank YOU - our loyal community members. We will always support you
                  and continue building tools that give you an edge. Your success is our success.
                </p>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent my-10" />

              {/* Meme Generator Feature */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 mb-6">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>

                <h4 className={cn('text-xl md:text-2xl lg:text-3xl font-bold mb-4 tracking-tight')}>
                  <span className={homeSectionTitleGradientClass}>Memes Are Power</span>
                </h4>
                <p className="text-lg text-white/80 font-prosto-one max-w-xl mx-auto mb-8">
                  Memes move markets. They spread ideas faster than any whitepaper ever could.
                  That&apos;s why <span className="text-purple-400 font-bold">Morbius Entertainment</span> has
                  created a brand new Meme Generator that lets you create and share directly to all social media platforms!
                </p>

                {/* Social Icons */}
                <div className="flex justify-center items-center gap-6 mb-8">
                  <div className="flex items-center gap-2 text-white/60">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span className="text-sm">X / Twitter</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/60">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                    <span className="text-sm">Instagram</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/60">
                    <IconBrandTelegram size={20} />
                    <span className="text-sm">Telegram</span>
                  </div>
                </div>

                {/* CTA Button */}
                <Link href="/Morb-It">
                  <motion.button
                    className="inline-flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 px-10 rounded-xl text-lg transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Launch Meme Generator
                  </motion.button>
                </Link>
              </div>
          </div>
        </motion.div>

        {/* Bottom tagline */}
        <motion.p
          className="text-center text-white/60 mt-10 text-lg font-prosto-one"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          Create. Share. <span className="text-purple-400">MORB.</span>
        </motion.p>
      </div>
    </section>
  )
}
