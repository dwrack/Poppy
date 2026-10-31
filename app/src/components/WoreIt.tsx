import { useEffect, useRef, useState } from 'react'
import { loadWoreIt, markWoreIt, woreItOpen, type Round, type WoreIt as WoreItRow } from '../lib/game'

/**
 * "I wore it for real." Lives under the podium of the last round, only on a
 * round she entered. Opens the day after the runway, stays open a week.
 * Optional photo goes in her own closet folder and only the lookbook shows
 * it. One star, and a streak the squad ladder counts.
 */
export function WoreIt({ round, userId, entered, now, onDone }: { round: Round; userId: string; entered: boolean; now: number; onDone: () => void }) {
  const [rows, setRows] = useState<WoreItRow[]>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadWoreIt(round.id).then(setRows) }, [round.id])

  if (!entered || !rows) return null
  const mine = rows.find((r) => r.user_id === userId)
  const open = woreItOpen(round, now)
  const opensOn = (() => { const d = new Date(round.reveal_at); d.setDate(d.getDate() + 1); return d.toLocaleDateString(undefined, { weekday: 'long' }) })()

  async function send(photo?: File) {
    if (!navigator.onLine) { setErr('You’re offline. Try again when you’re back on wifi.'); return }
    setBusy(true); setErr(undefined)
    try { await markWoreIt(round.id, userId, photo); setRows(await loadWoreIt(round.id)); onDone() }
    catch (x) { setErr((x as Error).message) }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }

  const others = rows.filter((r) => r.user_id !== userId)

  return (
    <div className="mt-4 rounded-2xl bg-cream p-3">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void send(e.target.files?.[0])} />
      {mine ? (
        <div className="flex items-center gap-3">
          {mine.photoUrl
            ? <img src={mine.photoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
            : <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-2xl">👗</span>}
          <div className="min-w-0 flex-1">
            <div className="font-bold">You wore it for real ✓ <span className="text-sage">+1 ⭐</span></div>
            <div className="text-xs text-mute">{mine.photoUrl ? 'Photo’s in the lookbook, not the runway.' : 'Want a photo of it in the lookbook?'}</div>
          </div>
          {!mine.photoUrl && open && (
            <button onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold ring-1 ring-black/10 disabled:opacity-50">{busy ? '…' : '📸 Add'}</button>
          )}
        </div>
      ) : open ? (
        <>
          <div className="font-bold">Did you wear it for real?</div>
          <p className="text-xs text-mute">One star, and it keeps your streak going. Photo is optional and only the squad’s lookbook sees it.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => void send()} disabled={busy} className="flex-1 rounded-full bg-ink py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? '…' : '👗 I wore it'}</button>
            <button onClick={() => inputRef.current?.click()} disabled={busy} className="flex-1 rounded-full bg-white py-2.5 text-sm font-bold ring-1 ring-black/10 disabled:opacity-50">📸 Wore it, with a pic</button>
          </div>
        </>
      ) : (
        <p className="text-center text-xs font-semibold text-mute">
          {now < Date.parse(round.reveal_at) + 8 * 86_400_000 ? `Wear it for real and tap here from ${opensOn} for +1 ⭐` : 'The wore-it window for this round has closed.'}
        </p>
      )}
      {others.length > 0 && (
        <p className="mt-2 text-xs text-mute">Also wore it: {others.map((o) => `${o.emoji} ${o.display_name}`).join(', ')}</p>
      )}
      {err && <p className="mt-2 text-center text-sm text-poppy">{err}</p>}
    </div>
  )
}
