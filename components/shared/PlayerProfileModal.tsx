'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Gift } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useInventory } from '@/hooks/use-cosmetics'
import { GiftItemModal } from '@/components/shared/GiftItemModal'
import {
  PlayerProfileDashboard,
  type PlayerProfileGame,
} from '@/components/shared/PlayerProfileDashboard'

export type { PlayerProfileGame }

interface PlayerProfileModalProps {
  isOpen: boolean
  onClose: () => void
  address: string | null
  /** Initial game to show; when opened from home (no arg), pass 'all' to show combined stats first. */
  game?: PlayerProfileGame
}

export function PlayerProfileModal({ isOpen, onClose, address, game = 'all' }: PlayerProfileModalProps) {
  const [giftOpen, setGiftOpen] = useState(false)

  const { address: myAddress } = useAccount()
  const { ownedSet, items: ownedItemKeys, refresh: refreshInventory } = useInventory(myAddress)
  const isOwnProfile = myAddress?.toLowerCase() === address?.toLowerCase()

  if (!address) return null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-gray-900 to-black border-cyan-500/30">
          <DialogHeader className="flex flex-row items-center justify-between gap-4">
            <DialogTitle className="text-xl font-bold text-white">
              Player Dashboard
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              {!isOwnProfile && myAddress && ownedItemKeys.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-pink-400 border-pink-500/40 hover:bg-pink-500/10 hover:text-pink-300 gap-1.5"
                  onClick={() => setGiftOpen(true)}
                >
                  <Gift size={14} />
                  Gift Item
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                className="text-xl font-semibold text-white border-white/50 hover:bg-white/10 hover:text-white px-6"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </DialogHeader>

          <PlayerProfileDashboard
            address={address}
            initialGame={game}
            modalOpen={isOpen}
            gameSelectId="player-dashboard-game-modal"
          />
        </DialogContent>
      </Dialog>

      {myAddress && address && (
        <GiftItemModal
          open={giftOpen}
          onClose={() => setGiftOpen(false)}
          fromAddress={myAddress}
          toAddress={address}
          ownedItems={ownedSet}
          onGifted={() => refreshInventory()}
        />
      )}
    </>
  )
}
