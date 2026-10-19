import { useEffect, useRef, useState } from 'react'
import { downscale } from '../lib/cutout'
import { BUCKET, supabase } from '../lib/supabase'

type Slot = 'front' | 'left' | 'right' | 'full'
const SLOTS: { slot: Slot; label: string; hint: string; emoji: string }[] = [
  { slot: 'front', label: 'Face, front', hint: 'Look straight at the camera', emoji: '🙂' },
  { slot: 'left', label: 'Face, left', hint: 'Turn your head to the left', emoji: '👈' },
  { slot: 'right', label: 'Face, right', hint: 'Turn your head to the right', emoji: '👉' },
  { slot: 'full', label: 'Full length', hint: 'Plain wall, fitted clothes, head to toe', emoji: '🧍' },
]

export function MePhotos({ userId }: { userId: string }) {
  const [urls, setUrls] = useState<Partial<Record<Slot, string>>>({})
  const [busy, setBusy] = useState<Slot>()
  const [err, setErr] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  const pending = useRef<Slot>('front')

  async function load() {
    const { data } = await supabase.from('me_photos').select('slot, path')
    if (!data?.length) { setUrls({}); return }
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(data.map((r) => r.path), 3600)
    const out: Partial<Record<Slot, string>> = {}
    for (const r of data) {
      const s = (signed ?? []).find((x) => x.path === r.path) as { signedUrl?: string; signedURL?: string } | undefined
      const link = s?.signedUrl || (s?.signedURL ? 'https://yrcddfehjjbtzwuotmym.supabase.co/storage/v1' + s.signedURL : '')
      if (link) out[r.slot as Slot] = link + '&t=' + Date.now()
    }
    setUrls(out)
  }
  useEffect(() => { void load() }, [userId])

  function pick(slot: Slot) { pending.current = slot; inputRef.current?.click() }

  async function onFile(file?: File) {
    if (!file) return
    const slot = pending.current
    setBusy(slot); setErr(undefined)
    try {
      const small = await downscale(file, 1600)
      const path = `${userId}/me/${slot}.jpg`
      const up = await supabase.storage.from(BUCKET).upload(path, small, { upsert: true, contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const row = await supabase.from('me_photos').upsert({ user_id: userId, slot, path, updated_at: new Date().toISOString() })
      if (row.error) throw row.error
      await load()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(undefined); if (inputRef.current) inputRef.current.value = '' }
  }

  const done = SLOTS.filter((s) => urls[s.slot]).length

  return (
    <section className="mb-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
      <h2 className="text-lg font-extrabold">Photos of you</h2>
      <p className="mb-3 text-xs text-mute">For your avatar. Only you and your squad can ever see these. {done}/4 done.</p>
      <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="grid grid-cols-4 gap-2">
        {SLOTS.map((s) => (
          <button key={s.slot} onClick={() => pick(s.slot)} disabled={busy === s.slot} className="flex flex-col items-center gap-1 text-center active:scale-95">
            <div className={'relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-cream ring-1 ring-black/10 ' + (busy === s.slot ? 'animate-pulse' : '')}>
              {urls[s.slot] ? <img src={urls[s.slot]} alt={s.label} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">{s.emoji}</div>}
              {urls[s.slot] && <span className="absolute right-1 bottom-1 rounded-full bg-sage px-1.5 text-[10px] font-bold text-white">✓</span>}
            </div>
            <span className="text-[11px] font-bold leading-tight">{s.label}</span>
            <span className="text-[10px] leading-tight text-mute">{s.hint}</span>
          </button>
        ))}
      </div>
      {err && <p className="mt-2 text-center text-sm text-poppy">{err}</p>}
    </section>
  )
}
