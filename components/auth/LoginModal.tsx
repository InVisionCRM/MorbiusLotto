import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Shield, Clock } from 'lucide-react'
import { WalletIcon } from '@/components/shared/WalletIcon'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSignIn: () => Promise<boolean>
  isSigning: boolean
  address?: string
}

export function LoginModal({ open, onOpenChange, onSignIn, isSigning, address }: LoginModalProps) {
  const handleSignIn = async () => {
    const success = await onSignIn()
    if (success) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black border-white/20 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            Sign In to Morbius.io
          </DialogTitle>
          <DialogDescription className="text-white/70 text-center">
            Authenticate with your wallet to access enhanced features and secure your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Wallet Info */}
          {address && (
            <div className="bg-white/5 p-4 rounded border border-white/10">
              <div className="flex items-center gap-3">
                <WalletIcon size={20} />
                <div>
                  <p className="text-sm text-white/70">Connected Wallet</p>
                  <p className="text-sm font-mono text-cyan-400">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Security Benefits */}
          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              Security Benefits
            </h4>

            <div className="space-y-2 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                <span>Cryptographic authentication</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                <span>Secure session management</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                <span>Protection against unauthorized access</span>
              </div>
            </div>
          </div>

          {/* Session Info */}
          <div className="bg-blue-950/20 p-3 rounded border border-blue-400/20">
            <div className="flex items-center gap-2 text-sm text-blue-200">
              <Clock className="w-4 h-4" />
              <span>Session lasts 24 hours</span>
            </div>
          </div>

          {/* Sign In Button */}
          <Button
            onClick={handleSignIn}
            disabled={isSigning || !address}
            className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-semibold py-3"
          >
            {isSigning ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                Signing...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Sign In with Wallet
              </>
            )}
          </Button>

          {/* Footer */}
          <p className="text-xs text-white/50 text-center">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}