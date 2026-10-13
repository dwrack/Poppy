import { db } from '../db'
import { useObjectUrl } from '../lib/useObjectUrl'
import { CATEGORY_LABEL, type Item } from '../types'

export function ItemSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const url = useObjectUrl(item.cutout)
  const update = (patch: Partial<Item>) => db.items.update(item.id!, patch)

  async function remove() {
    if (!confirm('Delete this piece for good?')) return
    await db.items.delete(item.id!)
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
            {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
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
