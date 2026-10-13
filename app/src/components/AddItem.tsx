import { useEffect, useRef, useState } from 'react'
import { saveItem } from '../lib/sync'
import { downscale, makeCutout, warmUp } from '../lib/cutout'
import { useObjectUrl } from '../lib/useObjectUrl'
import { CATEGORIES, CATEGORY_LABEL, COLOURS, PATTERNS, SEASONS, type Category, type Colour, type Item, type Pattern, type Season } from '../types'
import { Chip, Scale } from './Chip'

type Draft = Omit<Item, 'id' | 'photo' | 'cutout' | 'createdAt' | 'updatedAt' | 'synced'>

const blank = (): Draft => ({
  name: '', category: 'top', colours: [], pattern: 'solid', warmth: 3, formality: 3,
  seasons: ['spring', 'summer', 'fall', 'winter'], status: 'active', favourite: false, tucked: false,
})

export function AddItem({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<Blob>()
  const [cutout, setCutout] = useState<Blob>()
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<Draft>(blank)
  const [saving, setSaving] = useState(false)
  const preview = useObjectUrl(cutout ?? photo)

  useEffect(() => { warmUp() }, [])

  async function onPick(file?: File) {
    if (!file) return
    setError(undefined)
    setCutout(undefined)
    const small = await downscale(file)
    setPhoto(small)
    setProgress(0)
    try {
      const out = await makeCutout(small, setProgress)
      setCutout(out)
    } catch (e) {
      console.error(e)
      setError("Couldn't cut out the background. The photo is saved as is; you can retry later.")
    } finally {
      setProgress(null)
    }
  }

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  }

  async function save() {
    if (!photo) return
    setSaving(true)
    const now = Date.now()
    await saveItem({ ...draft, id: crypto.randomUUID(), photo, cutout: cutout ?? photo, createdAt: now, updatedAt: now, synced: 0 })
    setSaving(false)
    onDone()
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const wearsOnTorso = draft.category === 'top' || draft.category === 'dress'

  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-10 flex items-center justify-between bg-cream/90 px-4 py-3 backdrop-blur">
        <button onClick={onDone} className="text-base font-semibold text-mute">Cancel</button>
        <h1 className="text-lg font-extrabold">New piece</h1>
        <button
          onClick={save}
          disabled={!photo || saving || progress !== null}
          className="rounded-full bg-poppy px-4 py-1.5 font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
      </header>

      <main className="flex-1 space-y-6 px-4 pb-28">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="checker relative mx-auto block aspect-[3/4] w-full max-w-xs overflow-hidden rounded-blob ring-1 ring-black/10"
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-mute">
              <span className="text-5xl">📸</span>
              <span className="font-semibold">Snap it laid flat</span>
              <span className="text-xs">plain background, good light</span>
            </div>
          )}
          {progress !== null && (
            <div className="absolute inset-x-0 bottom-0 bg-ink/70 p-3 text-center text-sm font-semibold text-white">
              Cutting out… {Math.round(progress * 100)}%
            </div>
          )}
        </button>
        {error && <p className="text-center text-sm text-poppy">{error}</p>}
        {photo && progress === null && (
          <p className="text-center text-sm text-mute">Tap the photo to retake.</p>
        )}

        <section>
          <Label>What is it?</Label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c} on={draft.category === c} onClick={() => set({ category: c as Category })}>{CATEGORY_LABEL[c]}</Chip>
            ))}
          </div>
        </section>

        <section>
          <Label>Name <span className="font-normal text-mute">(optional)</span></Label>
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. mustard knit"
            className="w-full rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-peach"
          />
        </section>

        <section>
          <Label>Colours</Label>
          <div className="flex flex-wrap gap-2">
            {COLOURS.map((c) => (
              <Chip key={c} on={draft.colours.includes(c)} onClick={() => set({ colours: toggle(draft.colours, c as Colour) })}>{c}</Chip>
            ))}
          </div>
        </section>

        <section>
          <Label>Pattern</Label>
          <div className="flex flex-wrap gap-2">
            {PATTERNS.map((p) => (
              <Chip key={p} on={draft.pattern === p} onClick={() => set({ pattern: p as Pattern })}>{p}</Chip>
            ))}
          </div>
        </section>

        <section>
          <Label>Warmth</Label>
          <Scale value={draft.warmth} onChange={(v) => set({ warmth: v })} low="hot day" high="deep winter" />
        </section>

        <section>
          <Label>Dressiness</Label>
          <Scale value={draft.formality} onChange={(v) => set({ formality: v })} low="lounging" high="black tie" />
        </section>

        <section>
          <Label>Seasons</Label>
          <div className="flex flex-wrap gap-2">
            {SEASONS.map((s) => (
              <Chip key={s} on={draft.seasons.includes(s)} onClick={() => set({ seasons: toggle(draft.seasons, s as Season) })}>{s}</Chip>
            ))}
          </div>
        </section>

        {wearsOnTorso && (
          <section className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10">
            <span className="font-semibold">Usually tucked in</span>
            <Toggle on={draft.tucked} onChange={(v) => set({ tucked: v })} />
          </section>
        )}

        <section className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10">
          <span className="font-semibold">Favourite</span>
          <Toggle on={draft.favourite} onChange={(v) => set({ favourite: v })} />
        </section>

        <section>
          <Label>Brand / notes <span className="font-normal text-mute">(optional)</span></Label>
          <input
            value={draft.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="runs small, itchy, gift from mum…"
            className="w-full rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-peach"
          />
        </section>
      </main>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-sm font-bold">{children}</div>
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={'relative h-7 w-12 rounded-full transition ' + (on ? 'bg-sage' : 'bg-black/15')}
    >
      <span className={'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ' + (on ? 'left-5.5' : 'left-0.5')} />
    </button>
  )
}
