import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { cleanFit, pieceNote } from '../lib/designer'
import { useActivePack } from '../lib/game'
import { STORES, storeImageUrl, storeMarker, storeRefOf, type Store, type StorePiece } from '../lib/stores'
import { patchItem, saveItem } from '../lib/sync'
import { CATEGORY_LABEL, closetOf, type Item } from '../types'
import { Chip } from './Chip'
import { DesignerNote, useMyName } from './ItemSheet'

/** Where a store piece stands for her: not added, on the wishlist, or already in her own closet. */
type PieceState = { kind: 'none' } | { kind: 'wish'; item: Item } | { kind: 'removed'; item: Item } | { kind: 'mine'; item: Item }

/** Season Drop packs and the month each one starts arriving (1 = January). */
const PACK_MONTH: Record<string, number> = { 'Winter Formal': 12, 'Spring Break': 3, Summer: 6, Halloween: 10 }

/** Season Drop packs in order: the one in play first, then the rest by which arrives next. */
function packOrder(active: string): string[] {
  const now = new Date().getMonth() + 1
  const byNext = Object.keys(PACK_MONTH).sort((a, b) => ((PACK_MONTH[a] - now + 12) % 12) - ((PACK_MONTH[b] - now + 12) % 12))
  return PACK_MONTH[active] ? [active, ...byNext.filter((p) => p !== active)] : byNext
}

export function StoreBrowser({ onClose }: { onClose: () => void }) {
  const liveItems = useLiveQuery(() => db.items.toArray(), [])
  const [storeId, setStoreId] = useState(STORES[0].id)
  const [openId, setOpenId] = useState<string>()
  // Pieces being added right now, by piece id: each add runs on its own, so quick taps on three pieces all land.
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  // Store keys with an add in flight, read synchronously (state from the last render can be stale on a fast double tap).
  const adding = useRef(new Set<string>())
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(undefined), 4000)
    return () => clearTimeout(t)
  }, [error])
  const activePack = useActivePack()
  const myName = useMyName()
  const store = STORES.find((s) => s.id === storeId) ?? STORES[0]

  // Her pieces that came from a store, keyed by "store/piece".
  const byRef = useMemo(() => {
    const out = new Map<string, Item>()
    for (const i of liveItems ?? []) {
      const ref = storeRefOf(i.notes)
      if (!ref) continue
      const key = ref.join('/')
      // Prefer the live one if the same piece somehow got added twice.
      const had = out.get(key)
      if (!had || (had.status === 'archived' && i.status !== 'archived')) out.set(key, i)
    }
    return out
  }, [liveItems])

  const stateOf = (s: Store, p: StorePiece): PieceState => {
    const item = byRef.get(`${s.id}/${p.id}`)
    if (!item) return { kind: 'none' }
    if (closetOf(item) === 'mine') return { kind: 'mine', item }
    return item.status === 'archived' ? { kind: 'removed', item } : { kind: 'wish', item }
  }

  async function toggle(s: Store, p: StorePiece) {
    const key = `${s.id}/${p.id}`
    const st = stateOf(s, p)
    if (st.kind === 'mine' || busy.has(p.id) || adding.current.has(key)) return
    setError(undefined)
    if (st.kind === 'wish') return void patchItem(st.item.id, { status: 'archived' })
    if (st.kind === 'removed') return void patchItem(st.item.id, { status: 'active' })
    adding.current.add(key)
    setBusy((b) => new Set(b).add(p.id))
    try {
      // Already there (added a moment ago, before the screen caught up): bring it back, never a second copy.
      const had = await db.items.filter((i) => storeRefOf(i.notes)?.join('/') === key).first()
      if (had) {
        if (had.status === 'archived' && closetOf(had) === 'wish') await patchItem(had.id, { status: 'active' })
        return
      }
      const res = await fetch(storeImageUrl(p.id))
      if (!res.ok) throw new Error(`image ${res.status}`)
      const blob = await res.blob()
      const now = Date.now()
      await saveItem({
        name: p.name, category: p.category, colours: p.colours, pattern: p.pattern, fabric: p.fabric, fit: p.fit, feel: p.feel,
        warmth: p.warmth, formality: p.formality, seasons: p.seasons,
        closet: 'wish', brand: s.name, notes: storeMarker(s.id, p.id), photo: blob, cutout: blob,
        status: 'active', favourite: false, tucked: false, links: [],
        id: crypto.randomUUID(), createdAt: now, updatedAt: now, synced: 0,
      })
    } catch (e) {
      console.warn('store add failed', e)
      setError(`Couldn't add the ${p.name}. Check the wifi and try again.`)
    } finally {
      // Past this point the Dexie lookup above finds the saved piece, even before the screen catches up.
      adding.current.delete(key)
      setBusy((b) => { const n = new Set(b); n.delete(p.id); return n })
    }
  }

  const groups: { title?: string; pieces: StorePiece[] }[] = store.id === 'seasondrop'
    ? packOrder(activePack.name).map((pack) => ({
        title: pack === activePack.name ? `${pack} · in play now` : pack,
        pieces: store.items.filter((p) => p.pack === pack),
      })).filter((g) => g.pieces.length)
    : [{ pieces: store.items }]
  const open = store.items.find((p) => p.id === openId)

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-cream" data-testid="store-browser">
      <header className="safe-top sticky top-0 z-10 bg-cream/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 pt-3">
          <button onClick={onClose} className="text-base font-semibold text-mute">Done</button>
          <h1 className="text-lg font-extrabold">🛍️ Stores</h1>
          <span className="w-10" />
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          {STORES.map((s) => (
            <Chip key={s.id} on={s.id === store.id} onClick={() => { setStoreId(s.id); setOpenId(undefined) }}>
              <span className="block whitespace-nowrap">{s.emoji} {s.name}</span>
              <span className="block whitespace-nowrap text-[10px] font-semibold opacity-70">{s.tag}</span>
            </Chip>
          ))}
        </div>
      </header>

      <main className="px-4 pb-16">
        <p className="mb-3 text-sm text-mute">{store.tag}. Tap a piece to hear what the designer thinks.</p>
        {groups.map((g) => (
          <section key={g.title ?? store.id} className="mb-6">
            {g.title && <h2 className="mb-2 text-base font-extrabold">{g.title}</h2>}
            <div className="grid grid-cols-2 gap-3">
              {g.pieces.map((p) => (
                <PieceCard key={p.id} piece={p} state={stateOf(store, p)} busy={busy.has(p.id)} onOpen={() => setOpenId(p.id)} onToggle={() => toggle(store, p)} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-ink/40" onClick={() => setOpenId(undefined)}>
          <div className="safe-bottom max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-cream p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-black/15" />
            <div className="flex gap-4">
              <div className="checker h-36 w-36 shrink-0 overflow-hidden rounded-2xl ring-1 ring-black/10">
                <img src={storeImageUrl(open.id)} alt={open.name} className="h-full w-full object-contain p-1.5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-extrabold first-letter:uppercase">{open.name}</h2>
                <p className="text-sm text-mute">{store.emoji} {store.name} · {CATEGORY_LABEL[open.category]}</p>
                <p className="mt-1 text-sm text-mute">{[open.fabric, cleanFit(open.fit)].filter(Boolean).join(' · ')}</p>
                {open.feel && <p className="mt-1 text-sm italic">“{open.feel}”</p>}
              </div>
            </div>
            <div className="mt-4"><DesignerNote text={pieceNote(open, myName)} /></div>
            <div className="mt-4">
              <ToggleButton state={stateOf(store, open)} busy={busy.has(open.id)} onClick={() => toggle(store, open)} big />
            </div>
          </div>
        </div>
      )}
      {/* on top of everything, wherever she has scrolled to */}
      {error && (
        <div role="alert" className="safe-bottom fixed inset-x-4 bottom-6 z-50 rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white shadow-lg" data-testid="store-error">
          {error}
        </div>
      )}
    </div>
  )
}

function PieceCard({ piece, state, busy, onOpen, onToggle }: { piece: StorePiece; state: PieceState; busy: boolean; onOpen: () => void; onToggle: () => void }) {
  return (
    <div>
      <button onClick={onOpen} className="block w-full text-left active:scale-[0.98]">
        <div className="checker aspect-square overflow-hidden rounded-2xl ring-1 ring-black/10">
          <img src={storeImageUrl(piece.id)} alt={piece.name} className="h-full w-full object-contain p-2" loading="lazy" />
        </div>
        <div className="mt-1 truncate px-0.5 text-xs font-semibold text-ink first-letter:uppercase">{piece.name}</div>
      </button>
      <div className="mt-2"><ToggleButton state={state} busy={busy} onClick={onToggle} /></div>
    </div>
  )
}

function ToggleButton({ state, busy, onClick, big }: { state: PieceState; busy: boolean; onClick: () => void; big?: boolean }) {
  // kid-sized: 44px tall at least, even on the small card button
  const size = big ? 'py-3 text-base' : 'min-h-11 py-2.5 text-sm'
  if (state.kind === 'mine') {
    return <div className={'w-full rounded-full bg-sage/15 text-center font-bold text-sage ' + size}>👚 In my closet</div>
  }
  const on = state.kind === 'wish'
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      className={'w-full rounded-full font-bold active:scale-95 disabled:opacity-50 ' + size + ' ' + (on ? 'bg-poppy text-white' : 'bg-white ring-1 ring-black/10')}
    >
      {busy ? 'Adding…' : on ? '✓ On my wishlist' : '♡ Add'}
    </button>
  )
}
