import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db'
import { presetsToLook } from '../lib/avatarSync'
import { useObjectUrl } from '../lib/useObjectUrl'
import {
  garmentOf, OUTFIT_SLOTS, SLOT_CATEGORY, SLOT_LABEL, slotOf, type Item, type Outfit, type OutfitSlot,
} from '../types'
import { Chip } from '../components/Chip'
import AvatarScene from './AvatarScene'
import { MOVE_LABEL, MOVES, type Move } from './anim'

const NONE: Item[] = []
const MOVE_EMOJI: Record<Move, string> = { idle: '🧍', walk: '🚶', sit: '🪑', twirl: '💫', runway: '✨' }

/**
 * Dress me: her avatar, her closet, tap a piece to put it on. Reached from
 * the Closet tab. Pieces come from Dexie (active only), the look from her
 * avatar presets, height from her profile.
 */
export default function DressMe({ onClose }: { onClose: () => void }) {
  const items = useLiveQuery(() => db.items.where('status').equals('active').toArray(), []) ?? NONE
  const presets = useLiveQuery(() => db.avatar.get('me'), [])
  const profile = useLiveQuery(() => db.profile.get('me'), [])
  const look = useMemo(() => presetsToLook(presets), [presets])
  const [worn, setWorn] = useState<Partial<Record<OutfitSlot, string>>>({})
  const [slot, setSlot] = useState<OutfitSlot>('top')
  const [move, setMove] = useState<Move>('idle')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const outfit = useMemo<Outfit>(() => {
    const o: Outfit = {}
    for (const s of OUTFIT_SLOTS) { const it = worn[s] && byId.get(worn[s]!); if (it) o[s] = garmentOf(it) }
    return o
  }, [worn, byId])

  function toggle(item: Item) {
    const s = slotOf(item.category)
    if (!s) return
    setWorn((w) => {
      const next = { ...w }
      if (next[s] === item.id) { delete next[s]; return next }
      next[s] = item.id
      // a dress replaces top and bottom, and the other way round
      if (s === 'dress') { delete next.top; delete next.bottom }
      if (s === 'top' || s === 'bottom') delete next.dress
      return next
    })
  }

  const inSlot = items.filter((i) => i.category === SLOT_CATEGORY[slot])
  const wornItems = OUTFIT_SLOTS.map((s) => ({ slot: s, item: worn[s] ? byId.get(worn[s]!) : undefined })).filter((x) => x.item)
  const counts = Object.fromEntries(OUTFIT_SLOTS.map((s) => [s, items.filter((i) => i.category === SLOT_CATEGORY[s]).length])) as Record<OutfitSlot, number>

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-cream" data-testid="dress-me">
      <header className="safe-top flex items-center justify-between px-4 pt-3 pb-1">
        <button onClick={onClose} className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-black/10">‹ Closet</button>
        <h1 className="text-xl font-extrabold">Dress me</h1>
        <button onClick={() => setWorn({})} className="text-sm font-semibold text-mute" disabled={wornItems.length === 0}>Clear</button>
      </header>

      <div className="relative mx-3 h-[44vh] min-h-[280px] overflow-hidden rounded-blob bg-gradient-to-b from-white to-butter/50 ring-1 ring-black/5">
        {!failed && (
          <AvatarScene look={look} outfit={outfit} move={move} heightIn={profile?.heightIn} onReady={() => setReady(true)} onError={() => setFailed(true)} />
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-mute" data-testid="avatar-loading">Getting dressed…</div>
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-mute">
            The avatar couldn’t load on this phone. Your closet still works.
          </div>
        )}
        <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] font-semibold text-mute">drag to spin her</p>
        {/* the real pieces, as cards beside her */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          {wornItems.map(({ slot: s, item }) => <WornCard key={s} slot={s} item={item!} onRemove={() => toggle(item!)} />)}
        </div>
      </div>

      <div className="flex justify-between gap-1.5 px-3 pt-3" data-testid="moves">
        {MOVES.map((m) => (
          <button key={m} onClick={() => setMove(m)} className={'flex flex-1 flex-col items-center rounded-2xl py-1.5 text-[11px] font-bold ' + (move === m ? 'bg-poppy text-white shadow-md shadow-poppy/30' : 'bg-white ring-1 ring-black/10')}>
            <span className="text-lg leading-tight">{MOVE_EMOJI[m]}</span>{MOVE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto px-3 pt-3 pb-1 [scrollbar-width:none]">
        {OUTFIT_SLOTS.map((s) => (
          <Chip key={s} on={slot === s} onClick={() => setSlot(s)}>{SLOT_LABEL[s]}{worn[s] ? ' ✓' : ''} {counts[s] ? counts[s] : ''}</Chip>
        ))}
      </div>

      <div className="safe-bottom flex-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none]" data-testid="pieces">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-mute">Add pieces to your closet first.</p>
        ) : inSlot.length === 0 ? (
          <p className="py-6 text-center text-sm text-mute">No {SLOT_LABEL[slot].toLowerCase()} in your closet yet.</p>
        ) : (
          <div className="flex gap-2 pt-1">
            {inSlot.map((i) => <Piece key={i.id} item={i} on={worn[slot] === i.id} onClick={() => toggle(i)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function Piece({ item, on, onClick }: { item: Item; on: boolean; onClick: () => void }) {
  const url = useObjectUrl(item.cutout)
  return (
    <button onClick={onClick} className="w-[88px] shrink-0 text-left active:scale-95" data-testid="piece">
      <div className={'checker aspect-square overflow-hidden rounded-2xl ' + (on ? 'ring-[3px] ring-poppy' : 'ring-1 ring-black/10')}>
        {url && <img src={url} alt={item.name} className="h-full w-full object-contain p-1" />}
      </div>
      <div className="mt-1 truncate px-0.5 text-[11px] font-semibold">{item.name || item.colours.join(' ')}</div>
    </button>
  )
}

function WornCard({ slot, item, onRemove }: { slot: OutfitSlot; item: Item; onRemove: () => void }) {
  const url = useObjectUrl(item.cutout)
  return (
    <button onClick={onRemove} className="checker relative h-14 w-14 overflow-hidden rounded-xl shadow ring-1 ring-black/10 active:scale-95" title={`Take off ${SLOT_LABEL[slot]}`}>
      {url && <img src={url} alt="" className="h-full w-full object-contain p-0.5" />}
      <span className="absolute bottom-0 left-0 right-0 bg-ink/70 text-center text-[9px] font-bold text-white">{SLOT_LABEL[slot]}</span>
    </button>
  )
}
