import { useLiveQuery } from 'dexie-react-hooks'
import { Suspense, useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { base64ToBlob, importLink } from '../lib/ai'
import { CATEGORIES, CATEGORY_LABEL, closetOf, type Category, type ClosetKind, type Item } from '../types'
import type { AddPrefill } from './AddItem'
import { Chip } from './Chip'
import { ItemCard } from './ItemCard'
import { ItemSheet } from './ItemSheet'
import { StoreBrowser } from './StoreBrowser'
import { LazyDressMe } from './avatarLazy'

/** What the + button asks App to open: AddItem for her closet, or for her wishlist with an optional head start. */
export interface AddRequest { closet?: ClosetKind; prefill?: AddPrefill }

export function Closet({ onAdd, view: viewProp, onView }: { onAdd: (req?: AddRequest) => void; view?: ClosetKind; onView?: (v: ClosetKind) => void }) {
  const all = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray(), []) ?? []
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [showHidden, setShowHidden] = useState(false)
  const [openId, setOpenId] = useState<string>()
  const [dressing, setDressing] = useState(false)
  // App keeps the view so coming back from AddItem lands on the same side; works on its own too.
  const [ownView, setOwnView] = useState<ClosetKind>('mine')
  const view = viewProp ?? ownView
  const setView = (v: ClosetKind) => { setOwnView(v); onView?.(v); setCat('all') }
  const [wishAdd, setWishAdd] = useState(false)
  const [shopping, setShopping] = useState(false)

  const wishCount = all.filter((i) => closetOf(i) === 'wish' && i.status !== 'archived').length
  const mineCount = all.filter((i) => closetOf(i) === 'mine').length
  const items = all.filter((i) => closetOf(i) === view)
  const wishing = view === 'wish'
  const visible = items.filter((i) => (cat === 'all' || i.category === cat) && (showHidden || i.status === 'active'))
  const open = all.find((i) => i.id === openId)
  // Wishlist chips count what she can see: removed wishes only once she asks for them.
  const counts = countBy(wishing && !showHidden ? items.filter((i) => i.status !== 'archived') : items)
  // Removed wishes stay as rows (soft remove), so an emptied wishlist still gets the Dream it up start.
  const empty = wishing ? items.length === 0 || (wishCount === 0 && !showHidden) : items.length === 0
  const shown = wishing ? wishCount : items.length
  const plus = () => (wishing ? setWishAdd(true) : onAdd())

  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-10 bg-cream/90 backdrop-blur">
        <div className="flex items-end justify-between px-4 pt-3">
          <div>
            <h1 className="text-2xl font-extrabold">Closet</h1>
            <p className="text-sm text-mute">{shown === 0 ? 'Nothing here yet' : `${shown} ${shown === 1 ? (wishing ? 'wish' : 'piece') : (wishing ? 'wishes' : 'pieces')}`}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHidden((v) => !v)} className="text-sm font-semibold text-mute">
              {showHidden ? (wishing ? 'Hide removed' : 'Hide wash & away') : 'Show all'}
            </button>
            <button onClick={() => setDressing(true)} className="rounded-full bg-ink px-3 py-1.5 text-sm font-bold text-white shadow" data-testid="dress-me-button">
              ✨ Dress me
            </button>
          </div>
        </div>
        <div className="mx-4 mt-3 grid grid-cols-2 rounded-full bg-white p-1 ring-1 ring-black/10" role="tablist" data-testid="closet-switch">
          <Seg on={!wishing} onClick={() => setView('mine')}>👚 My closet <span className="opacity-70">{mineCount}</span></Seg>
          <Seg on={wishing} onClick={() => setView('wish')}>✨ Wishlist <span className="opacity-70">{wishCount}</span></Seg>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          <Chip on={cat === 'all'} onClick={() => setCat('all')}>All</Chip>
          {CATEGORIES.filter((c) => counts[c]).map((c) => (
            <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]} {counts[c]}</Chip>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 pb-32">
        {empty ? (
          wishing ? <WishEmpty onShop={() => setShopping(true)} onMore={() => setWishAdd(true)} /> : <Empty onAdd={onAdd} />
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-mute">Nothing matches. Try “Show all”.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {visible.map((i) => <ItemCard key={i.id} item={i} onClick={() => setOpenId(i.id)} />)}
          </div>
        )}
      </main>

      <button
        onClick={plus}
        data-testid="closet-add"
        className="fixed right-5 bottom-24 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-poppy text-3xl text-white shadow-lg shadow-poppy/40 active:scale-95"
        aria-label={wishing ? 'Add a wish' : 'Add a piece'}
      >
        +
      </button>

      {open && <ItemSheet item={open} onClose={() => setOpenId(undefined)} />}
      {wishAdd && (
        <WishAddSheet
          onClose={() => setWishAdd(false)}
          onShop={() => { setWishAdd(false); setShopping(true) }}
          onAdd={(prefill) => { setWishAdd(false); onAdd({ closet: 'wish', prefill }) }}
        />
      )}
      {shopping && <StoreBrowser onClose={() => setShopping(false)} />}
      {dressing && (
        <Suspense fallback={<div className="fixed inset-0 z-30 flex items-center justify-center bg-cream text-sm font-semibold text-mute">Opening the dressing room…</div>}>
          <LazyDressMe onClose={() => setDressing(false)} />
        </Suspense>
      )}
    </div>
  )
}

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-6xl">🧥</div>
      <h2 className="text-xl font-extrabold">Let's fill your closet</h2>
      <p className="max-w-xs text-mute">
        Lay a piece flat on a plain background and snap it. Start with the 30 things you wear most.
      </p>
      <button onClick={() => onAdd()} className="rounded-full bg-poppy px-6 py-3 font-bold text-white shadow-lg shadow-poppy/40">
        Add the first piece
      </button>
    </div>
  )
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={on} onClick={onClick} className={'min-h-11 rounded-full py-2.5 text-sm font-bold transition ' + (on ? 'bg-poppy text-white shadow-sm' : 'text-ink')}>
      {children}
    </button>
  )
}

function WishEmpty({ onShop, onMore }: { onShop: () => void; onMore: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-6xl">✨</div>
      <h2 className="text-xl font-extrabold">Dream it up</h2>
      <p className="max-w-xs text-mute">
        Pick gowns, costumes and pop star looks from the stores, or bring in a piece from a link. Try them on in Dress me.
      </p>
      <button onClick={onShop} className="rounded-full bg-poppy px-6 py-3 font-bold text-white shadow-lg shadow-poppy/40">
        🛍️ Browse stores
      </button>
      <button onClick={onMore} className="text-sm font-semibold text-mute">🔗 Or add from a link or photo</button>
    </div>
  )
}

/** The + sheet on the Wishlist side: stores, a pasted link, or a photo or screenshot. */
function WishAddSheet({ onClose, onShop, onAdd }: { onClose: () => void; onShop: () => void; onAdd: (prefill?: AddPrefill) => void }) {
  const [pasting, setPasting] = useState(false)
  const [url, setUrl] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const looksLikeLink = /\S+\.\S+/.test(url.trim())
  // Bumped by Back and by closing the sheet: an import that finishes after that is dropped, never opened.
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])

  async function bringIn() {
    if (!looksLikeLink || state === 'busy') return
    const mine = ++request.current
    setState('busy')
    try {
      const r = await importLink(url.trim())
      if (mine !== request.current) return
      const d = r.description
      onAdd({
        photo: base64ToBlob(r.image.data, r.image.media_type),
        draft: {
          ...(d ? {
            category: d.category, colours: d.colours, pattern: d.pattern, warmth: d.warmth, formality: d.formality,
            seasons: d.seasons?.length ? d.seasons : undefined, fabric: d.fabric, fit: d.fit, feel: d.feel, size: d.size || undefined,
          } : {}),
          name: r.title || d?.name || '',
          brand: r.store || d?.brand || undefined,
        },
        links: [{ title: r.title, store: r.store, url: r.url || url.trim(), price: r.price, exact: true, pasted: true }],
        searchQuery: d?.search_query,
      })
    } catch (e) {
      // 'NeedsDeploy' (server not updated yet) or any other failure: same friendly way out.
      console.warn('link import failed', e)
      if (mine === request.current) setState('failed')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/40" onClick={onClose}>
      <div className="safe-bottom w-full rounded-t-[2rem] bg-cream p-5" onClick={(e) => e.stopPropagation()} data-testid="wish-add-sheet">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-black/15" />
        <h2 className="mb-3 text-xl font-extrabold">Add to my wishlist</h2>
        {!pasting ? (
          <div className="space-y-2">
            <SheetButton onClick={onShop}>🛍️ Browse stores</SheetButton>
            <SheetButton onClick={() => setPasting(true)}>🔗 Paste a link</SheetButton>
            <SheetButton onClick={() => onAdd()}>📸 Snap or screenshot</SheetButton>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (state === 'failed') setState('idle') }}
              onKeyDown={(e) => { if (e.key === 'Enter') void bringIn() }}
              inputMode="url"
              autoFocus
              placeholder="https://… a link to the piece"
              className="w-full rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-peach"
            />
            {state === 'failed' ? (
              <div className="rounded-2xl bg-white p-3 text-center text-sm ring-1 ring-black/10">
                <p>Couldn't read that link. Take a screenshot of the piece and add it with 📸 instead.</p>
                <button onClick={() => onAdd()} className="mt-2 rounded-full bg-poppy px-4 py-2 font-bold text-white">📸 Add a screenshot</button>
              </div>
            ) : (
              <button
                onClick={bringIn}
                disabled={!looksLikeLink || state === 'busy'}
                className="w-full rounded-2xl bg-poppy py-3 font-bold text-white disabled:opacity-40"
              >
                {state === 'busy' ? '✨ Reading the link…' : '✨ Bring it in'}
              </button>
            )}
            <button onClick={() => { request.current++; setPasting(false); setState('idle') }} className="w-full py-1 text-sm font-semibold text-mute">{state === 'busy' ? 'Cancel' : 'Back'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function SheetButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full rounded-2xl bg-white px-4 py-3 text-left font-bold ring-1 ring-black/10 active:scale-[0.98]">
      {children}
    </button>
  )
}

function countBy(items: Item[]) {
  const out: Partial<Record<Category, number>> = {}
  for (const i of items) out[i.category] = (out[i.category] ?? 0) + 1
  return out
}
