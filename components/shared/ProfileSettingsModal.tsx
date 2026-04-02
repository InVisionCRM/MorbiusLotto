'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useProfile } from '@/hooks/use-player-profile'
import { useQueryClient } from '@tanstack/react-query'
import { AvatarView } from '@/components/avatar'
import { DEFAULT_AVATAR_CONFIG } from '@/components/avatar'
import { ProfileAvatarModal } from '@/components/shared/ProfileAvatarModal'

const DISPLAY_NAME_MIN = 3
const DISPLAY_NAME_MAX = 32
const BIO_MAX = 200

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.9))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(34, 211, 238, 0.3)',
}


export interface ProfileSettingsModalProps {
  open: boolean
  onClose: () => void
  displayName: string
  profileImageUrl: string | null
  bio?: string | null
  xHandle?: string | null
  tgHandle?: string | null
  onSave: (displayName: string, profileImageUrl: string | null, bio: string | null, xHandle: string | null, tgHandle: string | null) => Promise<void>
}

export default function ProfileSettingsModal({
  open,
  onClose,
  displayName: initialDisplayName,
  profileImageUrl: initialProfileImageUrl,
  bio: initialBio = null,
  xHandle: initialXHandle = null,
  tgHandle: initialTgHandle = null,
  onSave,
}: ProfileSettingsModalProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(initialProfileImageUrl)
  const [bio, setBio] = useState(initialBio ?? '')
  const [xHandle, setXHandle] = useState(initialXHandle ?? '')
  const [tgHandle, setTgHandle] = useState(initialTgHandle ?? '')
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const { avatarConfig } = useProfile()
  const queryClient = useQueryClient()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (open) {
      setDisplayName(initialDisplayName)
      setProfileImageUrl(initialProfileImageUrl)
      setBio(initialBio ?? '')
      setXHandle(initialXHandle ?? '')
      setTgHandle(initialTgHandle ?? '')
    }
  }, [open, initialDisplayName, initialProfileImageUrl, initialBio, initialXHandle, initialTgHandle])

  const sanitizeName = (raw: string): string => {
    return raw.replace(/[^\w\s-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX)
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))
  }

  const handleSave = async () => {
    const name = sanitizeName(displayName)
    if (name.length < DISPLAY_NAME_MIN) {
      toast.error(`Display name must be at least ${DISPLAY_NAME_MIN} characters.`)
      return
    }
    setSaving(true)
    try {
      await onSave(
        name,
        profileImageUrl,
        bio.trim().slice(0, BIO_MAX) || null,
        xHandle.trim().replace(/^@/, '').slice(0, 50) || null,
        tgHandle.trim().replace(/^@/, '').slice(0, 50) || null,
      )
      toast.success('Profile updated.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted || !open) return null

  const modal = (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-settings-title"
    >
      <div
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
        style={PANEL_STYLE}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-2">
          <h2 id="profile-settings-title" className="text-sm font-semibold text-white">
            Profile settings
          </h2>
        </div>
        <div className="p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={handleNameChange}
              placeholder="3–32 characters"
              maxLength={DISPLAY_NAME_MAX}
              className="w-full rounded-lg bg-slate-800/80 border border-cyan-500/30 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-cyan-500/30 bg-slate-800 shrink-0">
              <AvatarView
                config={avatarConfig ?? DEFAULT_AVATAR_CONFIG}
                emotion="neutral"
                compact
                className="w-full h-full"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-300 mb-1">Avatar</p>
              <button
                type="button"
                onClick={() => setAvatarModalOpen(true)}
                className="px-3 py-1 rounded-lg text-xs font-medium text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors"
              >
                Edit Avatar
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Bio <span className="text-gray-500 font-normal">({bio.length}/{BIO_MAX})</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="A short bio about yourself…"
              rows={2}
              className="w-full rounded-lg bg-slate-800/80 border border-cyan-500/30 px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                <span style={{ fontSize: 11 }}>𝕏</span> X / Twitter
              </label>
              <div className="flex items-center rounded-lg overflow-hidden bg-slate-800/80 border border-cyan-500/30 focus-within:ring-2 focus-within:ring-cyan-500/50">
                <span className="px-2 text-gray-500 text-xs select-none">@</span>
                <input
                  type="text"
                  value={xHandle}
                  onChange={(e) => setXHandle(e.target.value.replace(/^@/, '').slice(0, 50))}
                  placeholder="handle"
                  className="flex-1 bg-transparent py-1.5 pr-2 text-white placeholder-gray-500 focus:outline-none text-xs min-w-0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                <span style={{ fontSize: 11 }}>✈️</span> Telegram
              </label>
              <div className="flex items-center rounded-lg overflow-hidden bg-slate-800/80 border border-cyan-500/30 focus-within:ring-2 focus-within:ring-cyan-500/50">
                <span className="px-2 text-gray-500 text-xs select-none">@</span>
                <input
                  type="text"
                  value={tgHandle}
                  onChange={(e) => setTgHandle(e.target.value.replace(/^@/, '').slice(0, 50))}
                  placeholder="username"
                  className="flex-1 bg-transparent py-1.5 pr-2 text-white placeholder-gray-500 focus:outline-none text-xs min-w-0"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="px-3 pb-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 text-gray-300 hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {createPortal(modal, document.body)}
      <ProfileAvatarModal
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        onSave={() => queryClient.invalidateQueries({ queryKey: ['playerProfile'] })}
      />
    </>
  )
}
