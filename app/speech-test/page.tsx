'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

type GameMode = 'blackjack' | 'poker'

// Number words → digits
const NUMBER_WORDS: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
  'hundred': 100, 'thousand': 1000, 'k': 1000,
}

function parseAmount(text: string): number | null {
  const clean = text.replace(/,/g, '')
  const direct = parseFloat(clean)
  if (!isNaN(direct) && direct > 0) return direct
  let total = 0
  let current = 0
  const words = clean.split(/\s+/)
  for (const word of words) {
    const num = NUMBER_WORDS[word]
    if (num === undefined) continue
    if (num === 1000) { total += (current || 1) * 1000; current = 0 }
    else if (num === 100) { current = (current || 1) * 100 }
    else { current += num }
  }
  total += current
  return total > 0 ? total : null
}

interface LogEntry {
  time: string
  message: string
  type: 'action' | 'info' | 'error' | 'transcript'
}

// ── Blackjack ──────────────────────────────────────────────────────────────
type BJAction = 'hit' | 'stand' | 'double_down' | 'split' | 'bet' | 'rebet'
const BJ_KEYWORDS: { keywords: string[]; action: BJAction }[] = [
  { keywords: ['double down', 'double'], action: 'double_down' },
  { keywords: ['split'], action: 'split' },
  { keywords: ['hit'], action: 'hit' },
  { keywords: ['stand', 'stay'], action: 'stand' },
]
const BJ_REBET = ['run it back', 'same bet', 'bet again', 'rebet', 're-bet', 'again', 'go']

// ── Poker ──────────────────────────────────────────────────────────────────
type PokerAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in'
const POKER_KEYWORDS: { keywords: string[]; action: PokerAction }[] = [
  { keywords: ['all in', 'all-in', 'shove', 'jam', 'push'], action: 'all_in' },
  { keywords: ['fold', 'muck', 'give up'], action: 'fold' },
  { keywords: ['check', 'tap', 'knock'], action: 'check' },
  { keywords: ['call', 'i call', 'snap'], action: 'call' },
]

export default function SpeechTestPage() {
  const [mode, setMode] = useState<GameMode>('blackjack')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<any>(null)

  // Blackjack availability toggles
  const [bjCan, setBjCan] = useState({ hit: true, stand: true, double_down: true, split: true, bet: true, rebet: true })
  // Poker availability toggles
  const [pkCan, setPkCan] = useState({ fold: true, check: true, call: true, bet: true, raise: true, all_in: true })

  useEffect(() => {
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      setSupported(false)
    }
  }, [])

  const addLog = useCallback((message: string, type: LogEntry['type']) => {
    const time = new Date().toLocaleTimeString()
    setLog(prev => [{ time, message, type }, ...prev].slice(0, 50))
  }, [])

  const fireAction = useCallback((label: string, available: boolean) => {
    if (!available) { addLog(`"${label}" not available right now`, 'error'); return }
    addLog(`Action fired: ${label.toUpperCase().replace('_', ' ')}`, 'action')
  }, [addLog])

  const processBlackjack = useCallback((text: string) => {
    // Rebet
    if (BJ_REBET.some(k => text.includes(k)) || text === 'go') {
      fireAction('rebet', bjCan.rebet); return
    }
    // Bet [amount]
    const betMatch = text.match(/\bbet\b(.*)/)
    if (betMatch) {
      const amount = parseAmount(betMatch[1].trim())
      if (amount !== null) { fireAction(`bet ${amount.toLocaleString()} MORBIUS`, bjCan.bet); return }
      addLog(`Heard "bet" but couldn't parse amount: "${betMatch[1].trim()}"`, 'error'); return
    }
    // Game actions
    for (const { keywords, action } of BJ_KEYWORDS) {
      if (keywords.some(k => text.includes(k))) { fireAction(action, bjCan[action]); return }
    }
  }, [bjCan, fireAction])

  const processPoker = useCallback((text: string) => {
    // Raise [amount]
    const raiseMatch = text.match(/\braise\b(.*)/)
    if (raiseMatch) {
      const amount = parseAmount(raiseMatch[1].trim())
      if (amount !== null) { fireAction(`raise to ${amount.toLocaleString()}`, pkCan.raise); return }
      // "raise" alone — fire without amount
      fireAction('raise', pkCan.raise); return
    }
    // Bet [amount]
    const betMatch = text.match(/\bbet\b(.*)/)
    if (betMatch) {
      const amount = parseAmount(betMatch[1].trim())
      if (amount !== null) { fireAction(`bet ${amount.toLocaleString()}`, pkCan.bet); return }
      fireAction('bet', pkCan.bet); return
    }
    // Other actions
    for (const { keywords, action } of POKER_KEYWORDS) {
      if (keywords.some(k => text.includes(k))) { fireAction(action, pkCan[action]); return }
    }
  }, [pkCan, fireAction])

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    const isStoppingRef = { current: false }

    const createRecognition = () => {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => setListening(true)

      recognition.onresult = (e: any) => {
        const results = Array.from(e.results as SpeechRecognitionResultList)
        const latest = results[results.length - 1]
        const text = (latest[0] as SpeechRecognitionAlternative).transcript.toLowerCase().trim()
        setTranscript(text)
        if (latest.isFinal) {
          addLog(`Heard: "${text}"`, 'transcript')
          if (mode === 'blackjack') processBlackjack(text)
          else processPoker(text)
        }
      }

      recognition.onerror = (e: any) => {
        if (e.error === 'no-speech') return
        addLog(`Error: ${e.error}`, 'error')
      }

      recognition.onend = () => {
        setTranscript('')
        if (!isStoppingRef.current) {
          recognitionRef.current = createRecognition()
          recognitionRef.current.start()
        } else {
          setListening(false)
        }
      }

      return recognition
    }

    isStoppingRef.current = false
    const recognition = createRecognition()
    recognitionRef.current = recognition
    ;(recognitionRef as any).isStoppingRef = isStoppingRef

    addLog(`Listening in ${mode} mode…`, 'info')
    recognition.start()
  }, [addLog, mode, processBlackjack, processPoker])

  const stopListening = useCallback(() => {
    ;(recognitionRef as any).isStoppingRef.current = true
    recognitionRef.current?.stop()
  }, [])

  const bjToggles = [
    { label: 'Hit',         key: 'hit' },
    { label: 'Stand',       key: 'stand' },
    { label: 'Double Down', key: 'double_down' },
    { label: 'Split',       key: 'split' },
    { label: 'Bet',         key: 'bet' },
    { label: 'Rebet',       key: 'rebet' },
  ] as const

  const pkToggles = [
    { label: 'Fold',    key: 'fold' },
    { label: 'Check',   key: 'check' },
    { label: 'Call',    key: 'call' },
    { label: 'Bet',     key: 'bet' },
    { label: 'Raise',   key: 'raise' },
    { label: 'All In',  key: 'all_in' },
  ] as const

  const bjKeywords = 'hit · stand · stay · double down · split · bet [amount] · run it back · same bet · again · go'
  const pkKeywords = 'fold · muck · give up · check · tap · knock · call · snap · bet [amount] · raise [amount] · all in · shove · jam · push'

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 font-mono">
      <h1 className="text-2xl font-bold text-cyan-400 mb-2">Speech → Action Test</h1>
      <p className="text-neutral-400 text-sm mb-6">Web Speech API — free, no API calls. Chrome/Edge only.</p>

      {!supported && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          Web Speech API not supported. Try Chrome or Edge.
        </div>
      )}

      {/* Mode switcher */}
      <div className="flex gap-2 mb-6">
        {(['blackjack', 'poker'] as GameMode[]).map(m => (
          <button
            key={m}
            onClick={() => { if (listening) stopListening(); setMode(m) }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
              mode === m
                ? 'bg-cyan-500 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Mic */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Microphone</h2>
          <button
            onClick={listening ? stopListening : startListening}
            disabled={!supported}
            className={`w-full py-3 rounded-lg font-semibold transition-all disabled:opacity-50 ${
              listening ? 'bg-red-500 hover:bg-red-400' : 'bg-cyan-500 hover:bg-cyan-400'
            } text-white`}
          >
            {listening ? 'Stop' : 'Start Listening'}
          </button>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${listening ? 'bg-green-400 animate-pulse' : 'bg-neutral-600'}`} />
            <span className="text-neutral-400">{listening ? 'Listening' : 'Idle'}</span>
          </div>
          {transcript && (
            <div className="mt-3 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300">
              <span className="text-neutral-500">Hearing: </span>{transcript}
            </div>
          )}
          <div className="mt-4 text-xs text-neutral-600 leading-relaxed">
            Keywords: <span className="text-neutral-400">{mode === 'blackjack' ? bjKeywords : pkKeywords}</span>
          </div>
        </div>

        {/* Toggles */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-1">Available Actions</h2>
          <p className="text-xs text-neutral-500 mb-3">Toggle off to simulate unavailable actions</p>
          <div className="grid grid-cols-2 gap-2">
            {mode === 'blackjack'
              ? bjToggles.map(({ label, key }) => (
                <button key={key}
                  onClick={() => setBjCan(p => ({ ...p, [key]: !p[key] }))}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                    bjCan[key] ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-neutral-700 bg-neutral-800 text-neutral-500'
                  }`}
                >
                  {bjCan[key] ? '✓' : '✗'} {label}
                </button>
              ))
              : pkToggles.map(({ label, key }) => (
                <button key={key}
                  onClick={() => setPkCan(p => ({ ...p, [key]: !p[key] }))}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                    pkCan[key] ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-neutral-700 bg-neutral-800 text-neutral-500'
                  }`}
                >
                  {pkCan[key] ? '✓' : '✗'} {label}
                </button>
              ))
            }
          </div>
        </div>
      </div>

      {/* Log */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Log</h2>
          {log.length > 0 && (
            <button onClick={() => setLog([])} className="text-xs text-neutral-600 hover:text-neutral-400">Clear</button>
          )}
        </div>
        {log.length === 0
          ? <p className="text-neutral-600 text-sm">No activity yet.</p>
          : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {log.map((entry, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-neutral-600 shrink-0">{entry.time}</span>
                  <span className={
                    entry.type === 'action' ? 'text-cyan-400' :
                    entry.type === 'error' ? 'text-red-400' :
                    entry.type === 'transcript' ? 'text-neutral-500 italic' :
                    'text-neutral-400'
                  }>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
