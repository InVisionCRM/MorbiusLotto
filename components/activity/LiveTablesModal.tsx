'use client'

/**
 * Open and close the shared multiplayer tables, without leaving the dashboard.
 *
 * Craps and Ultimate Hold'em are the two games that need a table to exist
 * before anyone can play them — a player can't create one, so until an admin
 * opens one the lobby is simply empty. That made opening a table a database
 * job, which is the wrong shape for something done this often.
 *
 * Everything here is refused server-side for anyone outside ADMIN_WALLETS. The
 * wallet gate on the page is a courtesy so the buttons don't appear; it is not
 * the thing keeping non-admins out.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'
import {
  Dices,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Shuffle,
  Spade,
  Trash2,
  X,
} from 'lucide-react'

import { getWebSocketUrlOptional } from '@/lib/api-urls'
import { BlackjackWebSocketClient } from '@/lib/websocket-client'
import {
  createCrapsTable,
  deleteCrapsTable,
  listCrapsTables,
  rotateCrapsMultiSeed,
  type CrapsMultiTableSummary,
} from '@/lib/craps-multi-client'
import {
  createUthTable,
  deleteUthTable,
  listUthTables,
  rotateUthSeed,
  type UthMultiTableSummary,
} from '@/lib/uth-multi-client'

// Defaults mirror the server's registry (server/src/lib/game-limits.ts). They
// only prefill the form — the server still decides what an empty field means.
const CRAPS_DEFAULTS = { min: '5', max: '10000' }
const UTH_DEFAULTS = { min: '100', max: '5000' }

type GameKey = 'craps' | 'uth'

const GAMES: Record<GameKey, { label: string; felt: string; icon: React.ReactNode; blurb: string }> = {
  craps: {
    label: 'Craps',
    felt: '/craps/multi',
    icon: <Dices className="h-4 w-4" />,
    blurb: 'Eight seats. Limits are per betting zone, not per throw.',
  },
  uth: {
    label: "Ultimate Hold'em",
    felt: '/ultimate-holdem/multi',
    icon: <Spade className="h-4 w-4" />,
    blurb: 'Six seats. Limits are the ante; Blind matches it and Play is a multiple of it.',
  },
}

function errText(err: unknown): string {
  const m = (err as Error)?.message
  if (!m) return 'Something went wrong.'
  // The server answers an unauthenticated socket with its own wording; this is
  // the one case worth translating, because "not an admin" reads as a bug.
  if (/admin/i.test(m)) return 'That wallet is not on the admin allowlist.'
  return m
}

export default function LiveTablesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()

  const [ws, setWs] = useState<BlackjackWebSocketClient | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [craps, setCraps] = useState<CrapsMultiTableSummary[]>([])
  const [uth, setUth] = useState<UthMultiTableSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Keyed by table id (or the game key while opening) so one row's spinner
  // never freezes the whole panel.
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)

  const [crapsMin, setCrapsMin] = useState(CRAPS_DEFAULTS.min)
  const [crapsMax, setCrapsMax] = useState(CRAPS_DEFAULTS.max)
  const [uthMin, setUthMin] = useState(UTH_DEFAULTS.min)
  const [uthMax, setUthMax] = useState(UTH_DEFAULTS.max)

  const wsRef = useRef<BlackjackWebSocketClient | null>(null)

  const refresh = useCallback(async (client: BlackjackWebSocketClient) => {
    // Listing is unauthenticated on both games, so this half still works even
    // if the admin handshake failed — which makes the failure legible.
    const [c, u] = await Promise.all([listCrapsTables(client), listUthTables(client)])
    setCraps(c)
    setUth(u)
  }, [])

  // Connect only while the modal is open. A dashboard left open all day should
  // not hold a socket for a panel nobody is looking at.
  useEffect(() => {
    if (!open) return

    const url = getWebSocketUrlOptional()
    if (!url) {
      setError('No WebSocket URL is configured, so the game server cannot be reached.')
      return
    }

    const client = address
      ? new BlackjackWebSocketClient(url, address, signTypedDataAsync as never)
      : new BlackjackWebSocketClient(url)

    let cancelled = false
    setConnecting(true)
    setError(null)

    client
      .connect()
      .then(async () => {
        if (cancelled) return
        wsRef.current = client
        setWs(client)
        await refresh(client)
      })
      .catch((err) => {
        if (!cancelled) setError(errText(err))
      })
      .finally(() => {
        if (!cancelled) setConnecting(false)
      })

    return () => {
      cancelled = true
      wsRef.current = null
      setWs(null)
      try {
        ;(client as unknown as { disconnect?: () => void }).disconnect?.()
      } catch {
        /* nothing to unwind */
      }
    }
  }, [open, address, signTypedDataAsync, refresh])

  // Close on Escape, matching every other overlay in the app.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const run = useCallback(
    async (key: string, fn: (client: BlackjackWebSocketClient) => Promise<string | null>) => {
      const client = wsRef.current
      if (!client) return
      setBusy(key)
      setError(null)
      setNotice(null)
      try {
        const msg = await fn(client)
        if (msg) setNotice(msg)
        await refresh(client)
      } catch (err) {
        setError(errText(err))
      } finally {
        setBusy(null)
        setConfirmClose(null)
      }
    },
    [refresh],
  )

  const parseLimit = (raw: string): number | undefined => {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
  }

  const openCraps = () =>
    run('new:craps', async (c) => {
      await createCrapsTable(c, parseLimit(crapsMin), parseLimit(crapsMax))
      return 'Craps table open.'
    })

  const openUth = () =>
    run('new:uth', async (c) => {
      await createUthTable(c, parseLimit(uthMin), parseLimit(uthMax))
      return "Hold'em table open."
    })

  const total = craps.length + uth.length

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:p-8">
      {/* Clicking the backdrop closes; clicks inside the panel must not. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0a0e18] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Live tables</h2>
            <p className="mt-0.5 text-xs text-white/45">
              {total === 0
                ? 'No tables are open — until one is, both lobbies are empty.'
                : `${total} open · players join from the lobby`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => ws && run('refresh', async () => null)}
              disabled={!ws || busy !== null}
              className="rounded-lg border border-white/10 p-2 text-white/50 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {notice}
            </p>
          )}

          {connecting ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting to the game server…
            </div>
          ) : (
            <div className="space-y-5">
              <GameSection
                game="craps"
                rows={craps.map((t) => ({
                  id: t.id,
                  status: t.status,
                  limits: `${t.minBet.toLocaleString()} – ${t.maxBet.toLocaleString()}`,
                  seats: `${t.seatedCount}/${t.seatedCount + t.emptySeats}`,
                  detail: t.phase === 'POINT' ? `point ${t.point}` : 'come out',
                }))}
                min={crapsMin}
                max={crapsMax}
                onMin={setCrapsMin}
                onMax={setCrapsMax}
                onOpen={openCraps}
                onRotate={(id) =>
                  run(`rot:${id}`, async (c) => {
                    const r = await rotateCrapsMultiSeed(c, id)
                    // Craps refuses mid-point on purpose — a live point was bet
                    // against the seed that established it.
                    if (!r.ok) throw new Error(r.error ?? 'Could not rotate the seed.')
                    return 'New seed committed.'
                  })
                }
                onDelete={(id) =>
                  run(`del:${id}`, async (c) => {
                    await deleteCrapsTable(c, id)
                    return 'Craps table closed and bets refunded.'
                  })
                }
                busy={busy}
                disabled={!ws}
                confirmClose={confirmClose}
                onConfirmClose={setConfirmClose}
              />

              <GameSection
                game="uth"
                rows={uth.map((t) => ({
                  id: t.id,
                  status: t.status,
                  limits: `${t.minBet.toLocaleString()} – ${t.maxBet.toLocaleString()}`,
                  seats: `${t.seatedCount}/${t.seatedCount + t.emptySeats}`,
                  detail: t.stage ?? 'idle',
                }))}
                min={uthMin}
                max={uthMax}
                onMin={setUthMin}
                onMax={setUthMax}
                onOpen={openUth}
                onRotate={(id) =>
                  run(`rot:${id}`, async (c) => {
                    const r = await rotateUthSeed(c, id)
                    if (!r.ok) throw new Error(r.error ?? 'Could not rotate the seed.')
                    return 'New seed committed.'
                  })
                }
                onDelete={(id) =>
                  run(`del:${id}`, async (c) => {
                    await deleteUthTable(c, id)
                    return "Hold'em table closed and antes refunded."
                  })
                }
                busy={busy}
                disabled={!ws}
                confirmClose={confirmClose}
                onConfirmClose={setConfirmClose}
              />
            </div>
          )}

          <p className="mt-5 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/30">
            Closing a table refunds every live bet rather than settling it, so nobody loses a stake
            to a table disappearing. Rotating a seed retires the current one — past rounds stay
            verifiable — and craps refuses while a point is on, because that point was bet against
            the seed that established it.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── One game's tables ────────────────────────────────────────────────────────

interface Row {
  id: string
  status: string
  limits: string
  seats: string
  detail: string
}

function GameSection({
  game,
  rows,
  min,
  max,
  onMin,
  onMax,
  onOpen,
  onRotate,
  onDelete,
  busy,
  disabled,
  confirmClose,
  onConfirmClose,
}: {
  game: GameKey
  rows: Row[]
  min: string
  max: string
  onMin: (v: string) => void
  onMax: (v: string) => void
  onOpen: () => void
  onRotate: (id: string) => void
  onDelete: (id: string) => void
  busy: string | null
  disabled: boolean
  confirmClose: string | null
  onConfirmClose: (id: string | null) => void
}) {
  const meta = GAMES[game]
  const opening = busy === `new:${game}`

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          {meta.icon}
          <span className="text-sm font-bold">{meta.label}</span>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-white/60">
            {rows.length}
          </span>
        </div>
        <a
          href={meta.felt}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
        >
          Open lobby <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="divide-y divide-white/5">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-white/35">None open.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
              <span className="font-mono text-[11px] text-white/35" title={r.id}>
                {r.id.slice(0, 8)}
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  r.status === 'waiting'
                    ? 'bg-white/10 text-white/50'
                    : 'bg-emerald-400/15 text-emerald-300'
                }`}
              >
                {r.status}
              </span>
              <span className="text-xs tabular-nums text-white/60">{r.limits}</span>
              <span className="text-xs text-white/40">{r.seats} seats</span>
              <span className="text-xs text-white/30">{r.detail}</span>

              <div className="ml-auto flex items-center gap-1">
                <a
                  href={`${meta.felt}/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
                  title="Open this felt"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => onRotate(r.id)}
                  disabled={disabled || busy !== null}
                  className="rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                  title="Rotate the server seed"
                >
                  {busy === `rot:${r.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Shuffle className="h-3.5 w-3.5" />
                  )}
                </button>
                {confirmClose === r.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      disabled={busy !== null}
                      className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-[11px] font-bold text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-40"
                    >
                      {busy === `del:${r.id}` ? 'Closing…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onConfirmClose(null)}
                      className="px-1.5 text-[11px] text-white/40 transition hover:text-white"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConfirmClose(r.id)}
                    disabled={disabled || busy !== null}
                    className="rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40"
                    title="Close this table"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-white/10 px-4 py-3">
        <LimitField label="Min bet" value={min} onChange={onMin} />
        <LimitField label="Max bet" value={max} onChange={onMax} />
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled || busy !== null}
          className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-400/12 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-40"
        >
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Open a table
        </button>
        <p className="w-full text-[11px] text-white/30">{meta.blurb}</p>
      </div>
    </section>
  )
}

function LimitField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className="w-28 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm tabular-nums text-white outline-none transition focus:border-cyan-400/50"
      />
    </div>
  )
}
