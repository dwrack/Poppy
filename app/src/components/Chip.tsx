import type { ReactNode } from 'react'

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95 ' +
        (on ? 'bg-poppy text-white shadow-sm' : 'bg-white text-ink ring-1 ring-black/10')
      }
    >
      {children}
    </button>
  )
}

export function Scale({ value, onChange, low, high }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; low: string; high: string }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
            className={
              'h-9 flex-1 rounded-xl text-sm font-bold transition active:scale-95 ' +
              (n <= value ? 'bg-peach text-white' : 'bg-white ring-1 ring-black/10 text-mute')
            }
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-mute"><span>{low}</span><span>{high}</span></div>
    </div>
  )
}
