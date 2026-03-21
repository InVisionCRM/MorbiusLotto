'use client'

import { ExternalLink } from 'lucide-react'
import { CopyButton } from '@/components/ui/copy-button'

interface ContractAddressProps {
  address: string
  label: string
  explorerUrl?: string
  className?: string
}

export function ContractAddress({
  address,
  label,
  explorerUrl = 'https://scan.pulsechain.box/address/',
  className = ''
}: ContractAddressProps) {
  return (
    <div className={`flex items-center gap-2 text-xs text-white/60 ${className}`}>
      <span className="font-medium">{label}:</span>
      <code className="bg-white/10 px-2 py-1 rounded text-xs font-mono">
        {`${address.slice(0, 6)}...${address.slice(-4)}`}
      </code>
      <CopyButton
        content={address}
        copyToast={`${label} address copied!`}
        variant="ghost"
        size="sm"
        className="h-6 w-6 min-h-6 min-w-6 p-0 hover:bg-white/10"
        title={`Copy ${label} address`}
        aria-label={`Copy ${label} address`}
      />
      <a
        href={`${explorerUrl}${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-white/80 transition-colors"
        title={`View on PulseChain Explorer`}
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
