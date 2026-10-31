import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { EntryCard } from '../lib/game'
import { useObjectUrl } from '../lib/useObjectUrl'
import type { Category } from '../types'

/* ---------- The cutout stack (avatar stand-in until the 3D Poppy lands) ---------- */

const POS: Record<Category, string> = {
  hat: 'top-0 left-1/2 -translate-x-1/2 h-[22%] w-[45%] z-20',
  scarf: 'top-[14%] left-1/2 -translate-x-1/2 h-[22%] w-[42%] z-30',
  outerwear: 'top-[16%] left-[56%] -translate-x-1/2 h-[46%] w-[72%] z-30',
  top: 'top-[18%] left-1/2 -translate-x-1/2 h-[38%] w-[62%] z-20',
  dress: 'top-[18%] left-1/2 -translate-x-1/2 h-[60%] w-[62%] z-20',
  bottom: 'top-[50%] left-1/2 -translate-x-1/2 h-[36%] w-[55%] z-10',
  shoes: 'bottom-0 left-1/2 -translate-x-1/2 h-[18%] w-[45%] z-20',
  bag: 'top-[46%] left-[1%] h-[26%] w-[30%] z-30',
  accessory: 'top-[6%] right-[2%] h-[16%] w-[22%] z-30',
}

export type Layer = { key: string; category: Category; url?: string; blob?: Blob }

/** A piece that is not in the local closet: a friend's, shown by signed URL. */
export interface RemotePiece { id: string; name: string; category: Category; url?: string; owner_id: string; owner: string }

export function Stack({ layers, className }: { layers: Layer[]; className: string }) {
  const seen: Partial<Record<Category, number>> = {}
  return (
    <div className={'relative overflow-hidden rounded-blob bg-gradient-to-b from-butter/40 to-peach/20 ring-1 ring-black/5 ' + className}>
      {layers.length === 0 && <div className="flex h-full flex-col items-center justify-center text-mute"><span className="text-5xl">🧍‍♀️</span><span className="mt-1 text-xs font-semibold">Nothing on yet</span></div>}
      {layers.map((l) => {
        const nth = seen[l.category] ?? 0
        seen[l.category] = nth + 1
        return <StackLayer key={l.key} layer={l} offset={nth} />
      })}
    </div>
  )
}

function StackLayer({ layer, offset }: { layer: Layer; offset: number }) {
  const local = useObjectUrl(layer.blob)
  const src = layer.url ?? local
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className={'pop absolute object-contain drop-shadow-md ' + POS[layer.category]}
      style={offset ? { transform: `translate(${-50 + offset * 14}%, ${offset * 6}%)` } : undefined}
    />
  )
}

/** Stack built from the local closet (my own look), plus any borrowed pieces by URL. */
export function LocalStack({ ids, remote = [], className }: { ids: string[]; remote?: RemotePiece[]; className: string }) {
  const items = useLiveQuery(() => db.items.bulkGet(ids), [ids.join(',')]) ?? []
  const byId = new Map(remote.map((r) => [r.id, r]))
  const layers = ids.flatMap((id, i): Layer[] => {
    const it = items[i]
    if (it) return [{ key: id, category: it.category, blob: it.cutout }]
    const r = byId.get(id)
    return r ? [{ key: id, category: r.category, url: r.url }] : []
  })
  return <Stack layers={layers} className={className} />
}

/** Stack built from a runway card (anyone's look, signed URLs). */
export function CardStack({ card, className }: { card: EntryCard; className: string }) {
  return <Stack layers={card.pieces.map((p) => ({ key: p.id, category: p.category, url: p.url }))} className={className} />
}
