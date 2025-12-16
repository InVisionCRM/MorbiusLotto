'use client'

import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

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
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success(`${label} address copied!`)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error('Failed to copy address')
    }
  }

  return (
    <div className={`flex items-center gap-2 text-xs text-white/60 ${className}`}>
      <span className="font-medium">{label}:</span>
      <code className="bg-white/10 px-2 py-1 rounded text-xs font-mono">
        {`${address.slice(0, 6)}...${address.slice(-4)}`}
      </code>
      <Button
        variant="ghost"
        size="sm"
        onClick={copyToClipboard}
        className="h-6 w-6 p-0 hover:bg-white/10"
        title={`Copy ${label} address`}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
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


