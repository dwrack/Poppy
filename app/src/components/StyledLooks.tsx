import { useState } from 'react'
import { answerStyledLook, type StyledLook } from '../lib/borrowStyle'
import { CHIP_LABEL } from '../lib/game'
import { LocalStack } from './Stack'

/**
 * Looks a friend built for me this round. Each one can become my entry with
 * one tap, or be waved off. Nothing here is free text: the message is a chip.
 */
export function StyledLooks({ looks, wornId, onWear }: { looks: StyledLook[]; wornId: string | null; onWear: (look: StyledLook) => Promise<void> }) {
  const shown = looks.filter((l) => l.status !== 'declined')
  if (shown.length === 0) return null
  return (
    <section className="mt-4">
      <h3 className="text-lg font-extrabold">Styled for you ✨</h3>
      <p className="mb-2 text-xs text-mute">Someone in your squad built this from your closet. Wear it as your look, or not.</p>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {shown.map((l) => <LookCard key={l.id} look={l} worn={l.id === wornId} onWear={onWear} />)}
      </div>
    </section>
  )
}

function LookCard({ look, worn, onWear }: { look: StyledLook; worn: boolean; onWear: (look: StyledLook) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(undefined)
    try { await fn() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className={'w-48 shrink-0 rounded-2xl bg-white p-3 ring-1 ' + (worn ? 'ring-2 ring-poppy' : 'ring-black/5')}>
      <LocalStack ids={look.item_ids} className="h-48 w-full" />
      <div className="mt-2 text-sm font-bold">by {look.from_name}</div>
      <div className="mt-0.5 inline-block rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold">{CHIP_LABEL[look.message_chip]}</div>
      {worn ? (
        <p className="mt-2 text-center text-xs font-bold text-poppy">You’re wearing it ✓</p>
      ) : (
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => run(() => onWear(look))} disabled={busy} className="flex-1 rounded-full bg-poppy py-1.5 text-xs font-bold text-white disabled:opacity-50">Wear it</button>
          <button onClick={() => run(() => answerStyledLook(look.id, 'declined'))} disabled={busy} className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-mute disabled:opacity-50">Nah</button>
        </div>
      )}
      {err && <p className="mt-1 text-center text-[11px] text-poppy">{err}</p>}
    </div>
  )
}
