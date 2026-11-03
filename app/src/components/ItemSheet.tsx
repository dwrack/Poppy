import { useContext, useEffect, useState } from 'react'
import { deleteItem, patchItem } from '../lib/sync'
import { findOnline, freeSearchLinks } from '../lib/ai'
import { cleanFit, pieceNote } from '../lib/designer'
import { SquadsContext } from '../lib/squads'
import { supabase } from '../lib/supabase'
import { useObjectUrl } from '../lib/useObjectUrl'
import { CATEGORY_LABEL, isWish, type Item } from '../types'

/**
 * The name she goes by, for the designer's notes: her card in the active squad (else her first),
 * else the name she signed up with. Undefined when neither is known (the note then says "our model").
 * The one hook every note uses (ItemSheet, StoreBrowser, Dress me), so she is named the same everywhere.
 */
export function useMyName(): string | undefined {
  const s = useContext(SquadsContext)
  const squadName = (s?.active?.my_name || s?.squads[0]?.my_name)?.trim()
  const [signupName, setSignupName] = useState<string>()
  useEffect(() => {
    let on = true
    supabase.auth.getSession().then(({ data }) => {
      const n = data.session?.user.user_metadata?.display_name
      if (on && typeof n === 'string' && n.trim()) setSignupName(n.trim())
    }, () => {})
    return () => { on = false }
  }, [])
  return squadName || signupName
}

/** Notes without the store marker (store pieces carry one so the store can find them again). */
const shownNotes = (notes?: string) => notes?.replace(/store:[a-z0-9-]+\/[a-z0-9-]+/, '').replace(/^\s*·\s*|\s*·\s*$/g, '').trim() || undefined

/** The designer talking about one piece, in the sage box. */
export function DesignerNote({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-sage/10 p-3 text-sm" data-testid="designer-note">
      <p className="font-bold text-sage">✂️ Designer's notes</p>
      <p className="mt-1 italic">{text}</p>
    </div>
  )
}

export function ItemSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const url = useObjectUrl(item.cutout)
  const update = (patch: Partial<Item>) => patchItem(item.id, patch)
  const wish = isWish(item)
  const myName = useMyName()
  const notes = shownNotes(item.notes)
  const [finding, setFinding] = useState<'idle' | 'busy' | 'none' | 'error'>('idle')
  const query = item.notes?.match(/search: ([^·]+)/)?.[1]?.trim() || [item.brand, item.colours.join(' '), item.fabric, item.fit, item.name || item.category].filter(Boolean).join(' ')

  async function openFree(kind: 'lens' | 'shop') {
    const links = await freeSearchLinks(item.id, query)
    const url = kind === 'lens' ? links.lens : links.shop
    if (url) window.open(url, '_blank', 'noopener')
  }

  async function find() {
    setFinding('busy')
    try {
      const found = await findOnline(query, item.cutout)
      // A wish piece keeps the link she pasted in on top of anything Claude finds; Claude's old finds are replaced.
      const pasted = wish ? (item.links ?? []).filter((l) => l.pasted) : []
      const links = [...pasted, ...found.filter((f) => !pasted.some((l) => l.url === f.url))]
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
      <div className="safe-bottom max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-cream p-5" onClick={(e) => e.stopPropagation()}>
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
            {(item.brand || item.size) && <p className="mt-1 text-sm font-semibold">{[item.brand, item.size && `size ${item.size}`].filter(Boolean).join(' · ')}</p>}
            {(item.fabric || cleanFit(item.fit)) && <p className="mt-1 text-sm text-mute">{[item.fabric, cleanFit(item.fit)].filter(Boolean).join(' · ')}</p>}
            {item.feel && <p className="mt-1 text-sm italic">“{item.feel}”</p>}
            {notes && <p className="mt-1 text-sm">{notes}</p>}
            {wish && item.status !== 'archived' && <p className="mt-1 text-xs font-bold text-poppy">✨ On my wishlist</p>}
          </div>
        </div>

        <div className="mt-4"><DesignerNote text={pieceNote(item, myName)} /></div>

        <section className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => openFree('lens')} className="rounded-2xl bg-white py-3 text-sm font-bold ring-1 ring-black/10">📷 Google Lens</button>
            <button onClick={() => openFree('shop')} className="rounded-2xl bg-white py-3 text-sm font-bold ring-1 ring-black/10">🛍️ Google Shopping</button>
          </div>
          {item.links && item.links.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><span className="text-sm font-bold">{wish && item.links.some((l) => l.pasted) ? '🔗 Where to get it' : '✨ Claude found'}</span><button onClick={find} disabled={finding === 'busy'} className="text-xs font-semibold text-mute">{finding === 'busy' ? 'Searching…' : 'Search again'}</button></div>
              {item.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5">
                  {wish && l.pasted ? (
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">🔗 {[l.store, l.price].filter(Boolean).join(' · ') || 'Open the link'}</span>{l.title && <span className="block truncate text-xs text-mute">{l.title}</span>}</span>
                  ) : (
                    <>
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{l.title}</span><span className="text-xs text-mute">{l.store}{l.exact ? ' · exact match' : ' · similar'}</span></span>
                      {l.price && <span className="shrink-0 text-sm font-bold text-sage">{l.price}</span>}
                    </>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <button onClick={find} disabled={finding === 'busy'} className="w-full py-1 text-xs font-semibold text-mute disabled:opacity-50">
              {finding === 'busy' ? '✨ Claude is searching, about a minute…' : finding === 'none' ? 'Claude found nothing close. Try again?' : finding === 'error' ? 'Claude search failed. Try again?' : '✨ Or ask Claude to search (a few cents)'}
            </button>
          )}
        </section>

        {wish ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {item.status === 'archived' ? (
              <Action on={false} onClick={() => update({ status: 'active' })} wide>✨ Back on my wishlist</Action>
            ) : (
              <Action on={false} onClick={async () => { await update({ closet: 'mine', status: 'active' }); onClose() }} wide>🎉 I got it! Move to my closet</Action>
            )}
            <Action on={item.favourite} onClick={() => update({ favourite: !item.favourite })}>
              💛 {item.favourite ? 'Favourite' : 'Make favourite'}
            </Action>
            {item.status === 'archived' ? (
              <Action on={false} onClick={remove}>🗑️ Delete</Action>
            ) : (
              // Soft remove: past runway looks that used it keep rendering, and the store can bring it back.
              <Action on={false} onClick={async () => { await update({ status: 'archived' }); onClose() }}>🗑️ Remove from wishlist</Action>
            )}
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}

function Action({ on, onClick, wide, children }: { on: boolean; onClick: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={'rounded-2xl px-3 py-3 text-sm font-bold active:scale-95 ' + (wide ? 'col-span-2 ' : '') + (on ? 'bg-sage text-white' : 'bg-white ring-1 ring-black/10')}
    >
      {children}
    </button>
  )
}
