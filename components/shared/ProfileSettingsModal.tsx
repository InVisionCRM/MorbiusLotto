'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

const DISPLAY_NAME_MIN = 3
const DISPLAY_NAME_MAX = 32
const BIO_MAX = 200
const AVATAR_MAX_PX = 256
const AVATAR_JPEG_QUALITY = 0.85

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.9))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(34, 211, 238, 0.3)',
}

/** Resize and compress image to a small data URL (any input size accepted). */
async function resizeImageToDataUrl(
  file: File,
  maxPx: number = AVATAR_MAX_PX,
  quality: number = AVATAR_JPEG_QUALITY
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        if (width > height) {
          height = Math.round((height * maxPx) / width)
          width = maxPx
        } else {
          width = Math.round((width * maxPx) / height)
          height = maxPx
        }
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas not supported'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      try {
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
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
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim()
    setProfileImageUrl(v === '' ? null : v)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPEG, GIF, WebP).')
      return
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      setProfileImageUrl(dataUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process image.')
    }
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
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        style={PANEL_STYLE}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3">
          <h2 id="profile-settings-title" className="text-lg font-bold text-white">
            Profile settings
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={handleNameChange}
              placeholder="3–32 characters"
              maxLength={DISPLAY_NAME_MAX}
              className="w-full rounded-lg bg-slate-800/80 border border-cyan-500/30 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Profile picture</label>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-14 h-14 rounded-full bg-slate-700 border border-cyan-500/30 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {profileImageUrl ? (
                  <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-500 text-xl">?</span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  type="url"
                  value={profileImageUrl ?? ''}
                  onChange={handleUrlChange}
                  placeholder="Image URL (or upload below)"
                  className="w-full rounded-lg bg-slate-800/80 border border-cyan-500/30 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                  aria-label="Upload profile image"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-cyan-400 hover:text-cyan-300"
                >
                  Upload image
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Bio <span className="text-gray-500 font-normal">({bio.length}/{BIO_MAX})</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              placeholder="A short bio about yourself…"
              rows={3}
              className="w-full rounded-lg bg-slate-800/80 border border-cyan-500/30 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-1.5">
                <span style={{ fontSize: 13 }}>𝕏</span> X / Twitter
              </label>
              <div className="flex items-center rounded-lg overflow-hidden bg-slate-800/80 border border-cyan-500/30 focus-within:ring-2 focus-within:ring-cyan-500/50">
                <span className="px-2 text-gray-500 text-sm select-none">@</span>
                <input
                  type="text"
                  value={xHandle}
                  onChange={(e) => setXHandle(e.target.value.replace(/^@/, '').slice(0, 50))}
                  placeholder="handle"
                  className="flex-1 bg-transparent py-2 pr-3 text-white placeholder-gray-500 focus:outline-none text-sm min-w-0"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-1.5">
                <span style={{ fontSize: 13 }}>✈️</span> Telegram
              </label>
              <div className="flex items-center rounded-lg overflow-hidden bg-slate-800/80 border border-cyan-500/30 focus-within:ring-2 focus-within:ring-cyan-500/50">
                <span className="px-2 text-gray-500 text-sm select-none">@</span>
                <input
                  type="text"
                  value={tgHandle}
                  onChange={(e) => setTgHandle(e.target.value.replace(/^@/, '').slice(0, 50))}
                  placeholder="username"
                  className="flex-1 bg-transparent py-2 pr-3 text-white placeholder-gray-500 focus:outline-none text-sm min-w-0"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 text-gray-300 hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
