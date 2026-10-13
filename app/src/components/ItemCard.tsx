import { useObjectUrl } from '../lib/useObjectUrl'
import type { Item } from '../types'

export function ItemCard({ item, onClick }: { item: Item; onClick: () => void }) {
  const url = useObjectUrl(item.cutout)
  const dim = item.status !== 'active'
  return (
    <button onClick={onClick} className="group relative text-left active:scale-[0.98]">
      <div className={'checker aspect-square overflow-hidden rounded-2xl ring-1 ring-black/10 ' + (dim ? 'opacity-50' : '')}>
        {url && <img src={url} alt={item.name} className="h-full w-full object-contain p-1.5" loading="lazy" />}
      </div>
      {item.favourite && <span className="absolute top-1.5 right-1.5 text-sm drop-shadow">💛</span>}
      {item.status === 'laundry' && <Tag>in the wash</Tag>}
      {item.status === 'archived' && <Tag>put away</Tag>}
      <div className="mt-1 truncate px-0.5 text-xs font-semibold text-ink">{item.name || item.colours.join(' ') || ' '}</div>
    </button>
  )
}

function Tag({ children }: { children: string }) {
  return <span className="absolute bottom-7 left-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold text-white">{children}</span>
}
