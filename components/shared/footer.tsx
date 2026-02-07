'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ContractAddress } from '@/components/ui/contract-address'
import { DisclaimerModal } from '@/components/footer/disclaimer-modal'
import { WhatPulseChainModal } from '@/components/footer/what-pulsechain'
import { PrivacyPolicyModal } from '@/components/footer/privacy-policy'
import { TermsOfServiceModal } from '@/components/footer/terms-of-service'
import { AboutUsModal } from '@/components/footer/about-us'
import { UserAgreementModal } from '@/components/footer/user-agreement'
import { FAQModal } from '@/components/footer/faq-modal'
import { LOTTERY_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { toast } from 'sonner'

export function Footer() {
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [morbiusCopied, setMorbiusCopied] = useState(false)
  const copyMorbius = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(MORBIUS_TOKEN_ADDRESS)
      setMorbiusCopied(true)
      toast.success('MORBIUS address copied')
      setTimeout(() => setMorbiusCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }, [])
  const [showPulseChain, setShowPulseChain] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showUserAgreement, setShowUserAgreement] = useState(false)
  const [showFAQ, setShowFAQ] = useState(false)

  return (
    <>
      <footer className="w-full border-t border-white/10 py-6 mt-16">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col items-center gap-6">
            {/* Navigation Links */}
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <Link href="/home" className="text-white/60 hover:text-white/90 transition-colors">
                Home
              </Link>
              <Link href="/" className="text-white/60 hover:text-white/90 transition-colors">
                Lottery
              </Link>
              <Link href="/keno" className="text-white/60 hover:text-white/90 transition-colors">
                Keno
              </Link>
              <Link href="/PLINKO" className="text-white/60 hover:text-white/90 transition-colors">
                Plinko
              </Link>
              <Link href="/plinko-dashboard" className="text-white/60 hover:text-white/90 transition-colors">
                Dashboard
              </Link>
              <Link href="/plinko-verifier" className="text-white/60 hover:text-white/90 transition-colors">
                Verifier
              </Link>
              <Link href="/donate" className="text-white/60 hover:text-white/90 transition-colors">
                Donate
              </Link>
              <Link href="/swap" className="text-white/60 hover:text-white/90 transition-colors">
                Buy Morbius
              </Link>
            </div>

            {/* Legal Links */}
            <div className="flex flex-wrap justify-center gap-4 text-xs">
              <button
                onClick={() => setShowPulseChain(true)}
                className="text-white/50 hover:text-white/80 transition-colors underline"
              >
                What is PulseChain?
              </button>
              <button
                onClick={() => setShowFAQ(true)}
                className="text-white/50 hover:text-white/80 transition-colors underline"
              >
                FAQ
              </button>
              <button
                onClick={() => setShowPrivacy(true)}
                className="text-white/50 hover:text-white/80 transition-colors underline"
              >
                Privacy Policy
              </button>
              <button
                onClick={() => setShowTerms(true)}
                className="text-white/50 hover:text-white/80 transition-colors underline"
              >
                Terms of Service
              </button>
              <button
                onClick={() => setShowUserAgreement(true)}
                className="text-white/50 hover:text-white/80 transition-colors underline"
              >
                User Agreement
              </button>
              <button
                onClick={() => setShowAbout(true)}
                className="text-white/50 hover:text-white/80 transition-colors underline"
              >
                About Us
              </button>
            </div>

            {/* Contract Address */}
            <ContractAddress
              address={LOTTERY_ADDRESS}
              label="Morbius Games"
            />

            {/* Disclaimer Button */}
            <button
              onClick={() => setShowDisclaimer(true)}
              className="text-white/60 hover:text-white/90 text-sm underline transition-colors"
            >
              Important Disclaimer
            </button>

            {/* Morbius token address — click to copy */}
            <button
              type="button"
              onClick={copyMorbius}
              className="text-white font-bold font-poppins text-sm cursor-pointer hover:opacity-90 transition-opacity select-all"
              title="Click to copy MORBIUS address"
            >
              {MORBIUS_TOKEN_ADDRESS}
              {morbiusCopied && <span className="ml-2 text-cyan-400">Copied!</span>}
            </button>
          </div>
        </div>
      </footer>

      {/* All Footer Modals */}
      <DisclaimerModal open={showDisclaimer} onOpenChange={setShowDisclaimer} />
      <WhatPulseChainModal open={showPulseChain} onOpenChange={setShowPulseChain} />
      <PrivacyPolicyModal open={showPrivacy} onOpenChange={setShowPrivacy} />
      <TermsOfServiceModal open={showTerms} onOpenChange={setShowTerms} />
      <AboutUsModal open={showAbout} onOpenChange={setShowAbout} />
      <UserAgreementModal open={showUserAgreement} onOpenChange={setShowUserAgreement} />
      <FAQModal open={showFAQ} onOpenChange={setShowFAQ} />
    </>
  )
}