import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db'
import { CATEGORIES, CATEGORY_LABEL, type Category, type Item } from '../types'
import { Chip } from './Chip'
import { ItemCard } from './ItemCard'
import { ItemSheet } from './ItemSheet'

export function Closet({ onAdd }: { onAdd: () => void }) {
  const items = useLiveQuery(() => db.items.orderBy('createdAt').reverse().toArray(), []) ?? []
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [showHidden, setShowHidden] = useState(false)
  const [openId, setOpenId] = useState<number>()

  const visible = items.filter((i) => (cat === 'all' || i.category === cat) && (showHidden || i.status === 'active'))
  const open = items.find((i) => i.id === openId)
  const counts = countBy(items)

  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-10 bg-cream/90 backdrop-blur">
        <div className="flex items-end justify-between px-4 pt-3">
          <div>
            <h1 className="text-2xl font-extrabold">Closet</h1>
            <p className="text-sm text-mute">{items.length === 0 ? 'Nothing here yet' : `${items.length} ${items.length === 1 ? "piece" : "pieces"}`}</p>
          </div>
          <button onClick={() => setShowHidden((v) => !v)} className="text-sm font-semibold text-mute">
            {showHidden ? 'Hide wash & away' : 'Show all'}
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          <Chip on={cat === 'all'} onClick={() => setCat('all')}>All</Chip>
          {CATEGORIES.filter((c) => counts[c]).map((c) => (
            <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]} {counts[c]}</Chip>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 pb-32">
        {items.length === 0 ? (
          <Empty onAdd={onAdd} />
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-mute">Nothing matches. Try “Show all”.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {visible.map((i) => <ItemCard key={i.id} item={i} onClick={() => setOpenId(i.id)} />)}
          </div>
        )}
      </main>

      <button
        onClick={onAdd}
        className="fixed right-5 bottom-24 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-poppy text-3xl text-white shadow-lg shadow-poppy/40 active:scale-95"
        aria-label="Add a piece"
      >
        +
      </button>

      {open && <ItemSheet item={open} onClose={() => setOpenId(undefined)} />}
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
      <button onClick={onAdd} className="rounded-full bg-poppy px-6 py-3 font-bold text-white shadow-lg shadow-poppy/40">
        Add the first piece
      </button>
    </div>
  )
}

function countBy(items: Item[]) {
  const out: Partial<Record<Category, number>> = {}
  for (const i of items) out[i.category] = (out[i.category] ?? 0) + 1
  return out
}
