'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  BLACKJACK_IMAGE_BACKGROUNDS,
  BLACKJACK_VIDEO_BACKGROUNDS,
} from '@/app/BLACKJACK/constants'
import type { BlackjackThemeKind } from '@/app/BLACKJACK/constants'
import type { TableOption } from '@/hooks/use-blackjack-tables'

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.9))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(34, 211, 238, 0.3)',
}

export interface ThemeSelectionModalProps {
  open: boolean
  onClose: () => void
  theme: BlackjackThemeKind
  imageSource: string
  videoSource: string
  onThemeChange: (theme: BlackjackThemeKind) => void
  onImageSourceChange: (id: string) => void
  onVideoSourceChange: (id: string) => void
  videoSyncToClock?: boolean
  onVideoSyncToClockChange?: (sync: boolean) => void
  videoPosition?: number
  onVideoPositionChange?: (position: number) => void
  /** When provided, use these instead of static constants (e.g. from API). */
  imageOptions?: TableOption[]
  videoOptions?: TableOption[]
}

export default function ThemeSelectionModal({
  open,
  onClose,
  theme,
  imageSource,
  videoSource,
  onThemeChange,
  onImageSourceChange,
  onVideoSourceChange,
  videoSyncToClock = true,
  onVideoSyncToClockChange,
  videoPosition = 50,
  onVideoPositionChange,
  imageOptions: imageOptionsProp,
  videoOptions: videoOptionsProp,
}: ThemeSelectionModalProps) {
  const [activeTab, setActiveTab] = useState<'images' | 'videos'>('images')
  const [expandSrc, setExpandSrc] = useState<string | null>(null)
  const [expandVideo, setExpandVideo] = useState<boolean>(false)
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'a-z' | 'z-a'>('a-z')
  useEffect(() => setMounted(true), [])

  const imageList = imageOptionsProp ?? BLACKJACK_IMAGE_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src }))
  const videoList = videoOptionsProp ?? BLACKJACK_VIDEO_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src }))

  const filteredImages = React.useMemo(() => {
    let list = [...imageList]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((img) => img.label.toLowerCase().includes(q) || img.id.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      const cmp = a.label.localeCompare(b.label)
      return sortOrder === 'a-z' ? cmp : -cmp
    })
    return list
  }, [imageList, search, sortOrder])

  const filteredVideos = React.useMemo(() => {
    let list = [...videoList]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((v) => v.label.toLowerCase().includes(q) || v.id.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      const cmp = a.label.localeCompare(b.label)
      return sortOrder === 'a-z' ? cmp : -cmp
    })
    return list
  }, [videoList, search, sortOrder])

  const handleSelectImage = (id: string) => {
    onThemeChange('image')
    onImageSourceChange(id)
    const label = imageList.find((img) => img.id === id)?.label ?? id
    toast.success(`Table background applied: ${label}`)
  }

  const handleSelectVideo = (id: string) => {
    onThemeChange('video')
    onVideoSourceChange(id)
    const label = videoList.find((v) => v.id === id)?.label ?? id
    toast.success(`Table background applied: ${label}`)
  }

  if (!open || !mounted) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      >
        <div
          className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col"
          style={PANEL_STYLE}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-lg font-semibold text-cyan-300">Table theme</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('images')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'images'
                  ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/10'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Images
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('videos')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'videos'
                  ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/10'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Videos
            </button>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/10 bg-black/20">
            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search themes..."
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-800/80 border border-white/20 rounded text-white placeholder-white/40 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                aria-label="Search themes"
              />
            </div>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'a-z' | 'z-a')}
              className="px-3 py-1.5 text-sm bg-slate-800/80 border border-white/20 rounded text-white focus:outline-none focus:border-cyan-500/50"
              aria-label="Sort order"
            >
              <option value="a-z">Name A–Z</option>
              <option value="z-a">Name Z–A</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'images' && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-0">
                {filteredImages.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-white/50 text-sm">
                    No themes match &quot;{search}&quot;
                  </div>
                ) : (
                filteredImages.map((img) => {
                  const isSelected = theme === 'image' && imageSource === img.id
                  return (
                    <div
                      key={img.id}
                      className="relative aspect-[4/3] overflow-hidden bg-black/40 border-2 border-transparent transition-all group"
                      style={isSelected ? { borderColor: 'rgba(34, 211, 238, 0.6)' } : undefined}
                    >
                      <Image
                        src={img.src}
                        alt={img.label}
                        fill
                        className="object-cover pointer-events-none"
                        sizes="(max-width: 640px) 50vw, 20vw"
                      />
                      <button
                        type="button"
                        onClick={() => handleSelectImage(img.id)}
                        className="absolute inset-0 z-[5] cursor-pointer"
                        aria-label={`Select ${img.label}`}
                        title="Select and apply"
                      />
                      <div
                        className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-white border border-black border-2 pointer-events-none"
                        aria-hidden
                      >
                        {isSelected ? (
                          <svg className="w-4 h-4 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <span className="w-4 h-4 border border-slate-400 rounded" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandSrc(img.src)
                        }}
                        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Expand"
                        aria-label={`Expand ${img.label}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1v4m0 0h-4m4 0l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                      <span className="absolute bottom-0 left-0 right-0 py-1 px-2 text-[10px] font-medium text-white bg-black/70 truncate pointer-events-none">
                        {img.label}
                      </span>
                    </div>
                  )
                })
                )}
              </div>
            )}

            {activeTab === 'videos' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {filteredVideos.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-white/50 text-sm">
                      No videos match &quot;{search}&quot;
                    </div>
                  ) : (
                  filteredVideos.map((v) => {
                    const isSelected = theme === 'video' && videoSource === v.id
                    return (
                      <div
                        key={v.id}
                        className="relative aspect-video rounded-lg overflow-hidden bg-black/60 border-2 border-transparent transition-all"
                        style={isSelected ? { borderColor: 'rgba(34, 211, 238, 0.6)' } : undefined}
                      >
                        <video
                          src={v.src}
                          className="w-full h-full object-cover pointer-events-none"
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          poster=""
                        />
                        <button
                          type="button"
                          onClick={() => handleSelectVideo(v.id)}
                          className="absolute inset-0 z-[5] cursor-pointer"
                          aria-label={`Select ${v.label}`}
                          title="Select and apply"
                        />
                        <div
                          className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center w-4 h-4 rounded-full bg-white border border-cyan-400/60 pointer-events-none"
                          aria-hidden
                        >
                          {isSelected ? (
                            <svg className="w-4 h-4 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <span className="w-4 h-4 border border-slate-400 rounded-full" />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandSrc(v.src)
                            setExpandVideo(true)
                          }}
                          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Expand"
                          aria-label={`Expand ${v.label}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1v4m0 0h-4m4 0l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                        </button>
                        <span className="absolute bottom-0 left-0 right-0 py-1 px-2 text-[10px] font-medium text-white bg-black/70 truncate pointer-events-none">
                          {v.label}
                        </span>
                      </div>
                    )
                  })
                  )}
                </div>
                {onVideoSyncToClockChange !== undefined && onVideoPositionChange !== undefined && (
                  <div className="border-t border-white/10 space-y-0">
                    <label className="flex items-center gap-3 cursor-pointer text-white/90 text-sm">
                      <input
                        type="checkbox"
                        checked={videoSyncToClock}
                        onChange={(e) => onVideoSyncToClockChange(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-500 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
                      />
                      Sync to clock
                    </label>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-white/60">
                        <span>Background position</span>
                        <span>{videoSyncToClock ? '—' : `${videoPosition}%`}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={videoPosition}
                        onChange={(e) => onVideoPositionChange(Number(e.target.value))}
                        disabled={videoSyncToClock}
                        aria-label="Background position (0-100%)"
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer disabled:opacity-50 bg-slate-700 accent-cyan-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expand overlay */}
      {expandSrc && (
        <div
          className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/90"
          onClick={() => {
            setExpandSrc(null)
            setExpandVideo(false)
          }}
          aria-hidden
        >
          <div
            className="relative max-w-full max-h-full w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {expandVideo ? (
              <video
                src={expandSrc}
                className="max-w-full max-h-full object-contain rounded-lg"
                controls
                autoPlay
                loop
                muted={false}
              />
            ) : (
              <Image
                src={expandSrc}
                alt="Preview"
                width={1920}
                height={1080}
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={() => {
                  setExpandSrc(null)
                  setExpandVideo(false)
                }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setExpandSrc(null)
                setExpandVideo(false)
              }}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
