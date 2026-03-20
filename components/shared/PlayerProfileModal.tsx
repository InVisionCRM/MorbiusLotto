'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Gift, UserPlus, UserCheck, Copy, Check } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useInventory } from '@/hooks/use-cosmetics'
import { useProfileForAddress } from '@/hooks/use-player-profile'
import { useFollowCounts, useIsFollowing, useFollowMutation } from '@/hooks/use-follow'
import { GiftItemModal } from '@/components/shared/GiftItemModal'
import {
  PlayerProfileDashboard,
  type PlayerProfileGame,
} from '@/components/shared/PlayerProfileDashboard'

export type { PlayerProfileGame }

function XLogo({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2H21.5l-7.112 8.129L22.75 22h-6.547l-5.126-6.705L5.21 22H1.95l7.606-8.694L1.25 2h6.713l4.633 6.118L18.244 2Zm-1.15 18h1.803L6.98 3.895H5.046L17.094 20Z" />
    </svg>
  )
}

function TelegramLogo({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M9.78 15.48 9.4 20.9c.54 0 .77-.23 1.05-.52l2.52-2.4 5.22 3.82c.96.53 1.64.25 1.9-.89l3.45-16.16h.01c.31-1.45-.52-2.02-1.45-1.67L1.79 10.8c-1.39.54-1.37 1.31-.24 1.66l5.2 1.62L18.82 6.5c.57-.38 1.09-.17.66.21L9.78 15.48Z" />
    </svg>
  )
}

interface PlayerProfileModalProps {
  isOpen: boolean
  onClose: () => void
  address: string | null
  /** Initial game to show; when opened from home (no arg), pass 'all' to show combined stats first. */
  game?: PlayerProfileGame
}

export function PlayerProfileModal({ isOpen, onClose, address, game = 'all' }: PlayerProfileModalProps) {
  const [giftOpen, setGiftOpen] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)

  const { address: myAddress } = useAccount()
  const me = myAddress?.toLowerCase() ?? null
  const { ownedSet, items: ownedItemKeys, refresh: refreshInventory } = useInventory(myAddress)
  const isOwnProfile = me === address?.toLowerCase()
  const { displayName, bio, xHandle, tgHandle } = useProfileForAddress(address)
  const { data: counts } = useFollowCounts(address)
  const { data: isFollowing, isLoading: isFollowingLoading } = useIsFollowing(me, address)
  const { follow, unfollow } = useFollowMutation(me, address)

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 1400)
    }).catch(() => {
      setCopiedAddress(false)
    })
  }

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

          <div className="rounded-xl border border-cyan-500/25 bg-slate-900/50 p-4 mb-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-white font-semibold text-base truncate">
                  {displayName?.trim() || `${address.slice(0, 6)}...${address.slice(-4)}`}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-white/70 text-xs font-mono break-all">{address}</div>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white transition-colors rounded px-1.5 py-0.5 border border-white/15 bg-white/5"
                    title="Copy wallet address"
                  >
                    {copiedAddress ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedAddress ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              {!isOwnProfile && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={isFollowing ? 'text-indigo-300 border-indigo-400/40' : 'text-emerald-300 border-emerald-500/40'}
                    disabled={!me || isFollowingLoading || follow.isPending || unfollow.isPending}
                    onClick={() => (isFollowing ? unfollow.mutate() : follow.mutate())}
                  >
                    {isFollowing ? <UserCheck className="w-3.5 h-3.5 mr-1" /> : <UserPlus className="w-3.5 h-3.5 mr-1" />}
                    {isFollowing ? 'Following' : 'Follow'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-pink-300 border-pink-500/40 hover:bg-pink-500/10"
                    disabled={!myAddress || ownedItemKeys.length === 0 || isOwnProfile}
                    onClick={() => setGiftOpen(true)}
                  >
                    <Gift className="w-3.5 h-3.5 mr-1" />
                    Give Gift
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-5 text-sm">
              <div className="text-white/90">
                <span className="font-semibold tabular-nums">{counts?.followerCount ?? 0}</span>
                <span className="text-white/60 ml-1">Followers</span>
              </div>
              <div className="text-white/90">
                <span className="font-semibold tabular-nums">{counts?.followingCount ?? 0}</span>
                <span className="text-white/60 ml-1">Following</span>
              </div>
            </div>

            {bio && <p className="text-sm text-white/80 leading-relaxed">{bio}</p>}

            {(xHandle || tgHandle) && (
              <div className="flex flex-wrap gap-2">
                {xHandle && (
                  <a
                    href={`https://x.com/${xHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/90 hover:bg-white/10 transition-colors text-xs"
                  >
                    <XLogo />
                    @{xHandle}
                  </a>
                )}
                {tgHandle && (
                  <a
                    href={`https://t.me/${tgHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/90 hover:bg-white/10 transition-colors text-xs"
                  >
                    <TelegramLogo />
                    @{tgHandle}
                  </a>
                )}
              </div>
            )}
          </div>

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
