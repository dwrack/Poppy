import { useSquads } from '../lib/squads'

/**
 * One chip per squad (your icon there + the squad's name). Tapping one makes it
 * the squad the Squad, Runway and You tabs show. Hidden with only one squad.
 */
export function SquadSwitcher({ userId }: { userId: string }) {
  const { squads, active, setActive } = useSquads(userId)
  if (squads.length < 2) return null
  return (
    <div role="tablist" aria-label="Your squads" data-testid="squad-switcher" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pt-1 pb-1 [scrollbar-width:none]">
      {squads.map((s) => {
        const on = s.id === active?.id
        return (
          <button
            key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setActive(s.id)}
            className={'flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2 text-sm font-bold transition active:scale-95 ' +
              (on ? 'bg-ink text-white shadow-sm' : 'bg-white text-ink ring-1 ring-black/10')}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-base leading-none">{s.my_emoji}</span>
            <span className="max-w-[11rem] truncate">{s.name}</span>
          </button>
        )
      })}
    </div>
  )
}
