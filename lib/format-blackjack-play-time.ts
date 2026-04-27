/** US-style date + time for blackjack recent lists (mm/dd/yy, 12h). */
export function formatBlackjackPlayTime(isoOrMs: string | number | undefined | null): string {
  if (isoOrMs === undefined || isoOrMs === null || isoOrMs === '') return '—'
  const d = typeof isoOrMs === 'string' ? new Date(isoOrMs) : new Date(isoOrMs)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  let h = d.getHours()
  const mins = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  const minStr = String(mins).padStart(2, '0')
  return `${mm}/${dd}/${yy} ${h}:${minStr} ${ampm}`
}
