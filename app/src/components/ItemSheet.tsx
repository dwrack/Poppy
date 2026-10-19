import { useState } from 'react'
import { deleteItem, patchItem } from '../lib/sync'
import { findOnline, freeSearchLinks } from '../lib/ai'
import { useObjectUrl } from '../lib/useObjectUrl'
import { CATEGORY_LABEL, type Item } from '../types'

export function ItemSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const url = useObjectUrl(item.cutout)
  const update = (patch: Partial<Item>) => patchItem(item.id, patch)
  const [finding, setFinding] = useState<'idle' | 'busy' | 'none' | 'error'>('idle')
  const query = item.notes?.match(/search: ([^·]+)/)?.[1]?.trim() || [item.colours.join(' '), item.fabric, item.fit, item.name || item.category].filter(Boolean).join(' ')

  async function openFree(kind: 'lens' | 'shop') {
    const links = await freeSearchLinks(item.id, query)
    const url = kind === 'lens' ? links.lens : links.shop
    if (url) window.open(url, '_blank', 'noopener')
  }

  async function find() {
    setFinding('busy')
    try {
      const links = await findOnline(query, item.cutout)
      await update({ links })
      setFinding(links.length ? 'idle' : 'none')
    } catch { setFinding('error') }
  }

  async function remove() {
    if (!confirm('Delete this piece for good?')) return
    await deleteItem(item.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/40" onClick={onClose}>
      <div className="safe-bottom w-full rounded-t-[2rem] bg-cream p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-black/15" />
        <div className="flex gap-4">
          <div className="checker h-32 w-32 shrink-0 overflow-hidden rounded-2xl ring-1 ring-black/10">
            {url && <img src={url} alt="" className="h-full w-full object-contain p-1" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold">{item.name || CATEGORY_LABEL[item.category]}</h2>
            <p className="text-sm text-mute">
              {CATEGORY_LABEL[item.category]} · {item.colours.join(', ') || 'no colour'} · {item.pattern}
            </p>
            <p className="mt-1 text-sm text-mute">warmth {item.warmth}/5 · dressy {item.formality}/5</p>
            {(item.fabric || item.fit) && <p className="mt-1 text-sm text-mute">{[item.fabric, item.fit].filter(Boolean).join(' · ')}</p>}
            {item.feel && <p className="mt-1 text-sm italic">“{item.feel}”</p>}
            {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
          </div>
        </div>

        <section className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => openFree('lens')} className="rounded-2xl bg-white py-3 text-sm font-bold ring-1 ring-black/10">📷 Google Lens</button>
            <button onClick={() => openFree('shop')} className="rounded-2xl bg-white py-3 text-sm font-bold ring-1 ring-black/10">🛍️ Google Shopping</button>
          </div>
          {item.links && item.links.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><span className="text-sm font-bold">✨ Claude found</span><button onClick={find} disabled={finding === 'busy'} className="text-xs font-semibold text-mute">{finding === 'busy' ? 'Searching…' : 'Search again'}</button></div>
              {item.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{l.title}</span><span className="text-xs text-mute">{l.store}{l.exact ? ' · exact match' : ' · similar'}</span></span>
                  {l.price && <span className="shrink-0 text-sm font-bold text-sage">{l.price}</span>}
                </a>
              ))}
            </div>
          ) : (
            <button onClick={find} disabled={finding === 'busy'} className="w-full py-1 text-xs font-semibold text-mute disabled:opacity-50">
              {finding === 'busy' ? '✨ Claude is searching, about a minute…' : finding === 'none' ? 'Claude found nothing close. Try again?' : finding === 'error' ? 'Claude search failed. Try again?' : '✨ Or ask Claude to search (a few cents)'}
            </button>
          )}
        </section>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Action on={item.status === 'laundry'} onClick={() => update({ status: item.status === 'laundry' ? 'active' : 'laundry' })}>
            🧺 {item.status === 'laundry' ? 'Clean again' : 'In the wash'}
          </Action>
          <Action on={item.status === 'archived'} onClick={() => update({ status: item.status === 'archived' ? 'active' : 'archived' })}>
            📦 {item.status === 'archived' ? 'Bring back' : 'Put away'}
          </Action>
          <Action on={item.favourite} onClick={() => update({ favourite: !item.favourite })}>
            💛 {item.favourite ? 'Favourite' : 'Make favourite'}
          </Action>
          <Action on={false} onClick={remove}>🗑️ Delete</Action>
        </div>
      </div>
    </div>
  )
}

function Action({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={'rounded-2xl px-3 py-3 text-sm font-bold active:scale-95 ' + (on ? 'bg-sage text-white' : 'bg-white ring-1 ring-black/10')}
    >
      {children}
    </button>
  )
}
