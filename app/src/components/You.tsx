import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db'
import { addMeasurement, deleteMeasurement, saveProfile } from '../lib/profileSync'
import { supabase } from '../lib/supabase'
import { syncNow } from '../lib/sync'
import { MePhotos } from './MePhotos'
import { MEASURE_FIELDS, type MeasureField, type Profile } from '../types'

const HAIR = ['black', 'dark brown', 'brown', 'light brown', 'auburn', 'red', 'blonde', 'grey', 'other']
const EYES = ['brown', 'hazel', 'green', 'blue', 'grey', 'other']
const MEASURE_LABEL: Record<MeasureField, string> = {
  bust: 'Bust', waist: 'Waist', hips: 'Hips', inseam: 'Inseam', shoulder: 'Shoulders',
}

export function You({ email, userId }: { email?: string; userId: string }) {
  // Wrap in an object so "still loading" (undefined) differs from "no profile yet" ({ p: undefined }).
  const res = useLiveQuery(async () => ({ p: await db.profile.get('me') }), [])
  const loaded = res !== undefined
  const profile = res?.p

  return (
    <div className="safe-top flex min-h-full flex-col px-4 pt-3 pb-28">
      <h1 className="text-2xl font-extrabold">You</h1>
      <p className="mb-5 text-sm text-mute">{email}</p>
      <MePhotos userId={userId} />
      {loaded && <ProfileForm key={profile?.updatedAt ?? 0} profile={profile} />}
      <Measurements />
      <Account />
    </div>
  )
}

function ProfileForm({ profile }: { profile?: Profile }) {
  const [ft, setFt] = useState(profile?.heightIn ? String(Math.floor(profile.heightIn / 12)) : '')
  const [inch, setInch] = useState(profile?.heightIn ? String(Math.round(profile.heightIn % 12)) : '')
  const [weight, setWeight] = useState(profile?.weightLb ? String(profile.weightLb) : '')
  const [hair, setHair] = useState(profile?.hair ?? '')
  const [eyes, setEyes] = useState(profile?.eyes ?? '')
  const [top, setTop] = useState(profile?.sizeTop ?? '')
  const [bottom, setBottom] = useState(profile?.sizeBottom ?? '')
  const [dress, setDress] = useState(profile?.sizeDress ?? '')
  const [shoe, setShoe] = useState(profile?.sizeShoe ?? '')
  const [notes, setNotes] = useState(profile?.styleNotes ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t) } }, [saved])

  async function save() {
    const heightIn = ft || inch ? Number(ft || 0) * 12 + Number(inch || 0) : undefined
    await saveProfile({
      heightIn, weightLb: weight ? Number(weight) : undefined, hair: hair || undefined, eyes: eyes || undefined,
      sizeTop: top || undefined, sizeBottom: bottom || undefined, sizeDress: dress || undefined,
      sizeShoe: shoe || undefined, styleNotes: notes || undefined,
    })
    setSaved(true)
  }

  return (
    <>
      <Card title="Basics">
        <Row label="Height">
          <div className="flex items-center gap-1.5">
            <Num value={ft} onChange={setFt} placeholder="5" w="w-14" /><span className="text-mute">ft</span>
            <Num value={inch} onChange={setInch} placeholder="4" w="w-14" /><span className="text-mute">in</span>
          </div>
        </Row>
        <Row label="Weight">
          <div className="flex items-center gap-1.5"><Num value={weight} onChange={setWeight} placeholder="lb" w="w-20" /><span className="text-mute">lb</span></div>
        </Row>
        <Row label="Hair"><Pick value={hair} onChange={setHair} options={HAIR} /></Row>
        <Row label="Eyes"><Pick value={eyes} onChange={setEyes} options={EYES} /></Row>
      </Card>

      <Card title="Sizes">
        <Row label="Tops"><Text value={top} onChange={setTop} placeholder="e.g. XS" /></Row>
        <Row label="Pants"><Text value={bottom} onChange={setBottom} placeholder="e.g. 4 or 26" /></Row>
        <Row label="Dresses"><Text value={dress} onChange={setDress} placeholder="e.g. 2" /></Row>
        <Row label="Shoes"><Text value={shoe} onChange={setShoe} placeholder="e.g. 8.5" /></Row>
      </Card>

      <Card title="Style notes" hint="How you like to dress, and what you never want suggested. The stylist reads this every time.">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="I run cold. No crop tops. I love earthy colours and a defined waist…"
          className="w-full rounded-2xl bg-cream px-3 py-2.5 ring-1 ring-black/10 outline-none focus:ring-peach"
        />
      </Card>

      <button onClick={save} className="mb-6 w-full rounded-full bg-poppy py-3 font-bold text-white shadow-lg shadow-poppy/40 active:scale-[0.98]">
        {saved ? 'Saved ✓' : 'Save'}
      </button>
    </>
  )
}

function Measurements() {
  const list = useLiveQuery(() => db.measurements.orderBy('takenOn').reverse().toArray(), []) ?? []
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState<Partial<Record<MeasureField, string>>>({})
  const latest = list[0]
  const prev = list[1]

  async function save() {
    const entry: Partial<Record<MeasureField, number>> = {}
    for (const f of MEASURE_FIELDS) if (vals[f]) entry[f] = Number(vals[f])
    if (Object.keys(entry).length === 0) return
    await addMeasurement({ takenOn: new Date().toISOString().slice(0, 10), ...entry })
    setVals({}); setOpen(false)
  }

  return (
    <Card title="Measurements" hint="Tape measure, in inches. Each save is dated so you can see changes over time.">
      {latest ? (
        <div className="grid grid-cols-5 gap-1 text-center">
          {MEASURE_FIELDS.map((f) => {
            const v = latest[f]; const d = v !== undefined && prev?.[f] !== undefined ? v - prev[f]! : undefined
            return (
              <div key={f} className="rounded-xl bg-cream py-2">
                <div className="text-[11px] font-semibold text-mute">{MEASURE_LABEL[f]}</div>
                <div className="text-lg font-extrabold">{v ?? '–'}</div>
                {d !== undefined && d !== 0 && <div className="text-[10px] font-bold text-sage">{d > 0 ? '+' : ''}{d.toFixed(1)}</div>}
              </div>
            )
          })}
        </div>
      ) : (
        !open && <p className="text-sm text-mute">No measurements yet.</p>
      )}

      {open ? (
        <div className="mt-3 space-y-2">
          {MEASURE_FIELDS.map((f) => (
            <Row key={f} label={MEASURE_LABEL[f]}>
              <div className="flex items-center gap-1.5">
                <Num value={vals[f] ?? ''} onChange={(v) => setVals((s) => ({ ...s, [f]: v }))} placeholder={latest?.[f]?.toString() ?? 'in'} w="w-20" />
                <span className="text-mute">in</span>
              </div>
            </Row>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="flex-1 rounded-full py-2.5 font-bold text-mute">Cancel</button>
            <button onClick={save} className="flex-1 rounded-full bg-sage py-2.5 font-bold text-white">Save entry</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="mt-3 w-full rounded-full bg-cream py-2.5 font-bold ring-1 ring-black/10">📏 Add measurements</button>
      )}

      {list.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-mute">History ({list.length})</summary>
          <ul className="mt-2 space-y-1">
            {list.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl bg-cream px-3 py-1.5">
                <span className="font-semibold">{m.takenOn}</span>
                <span className="text-mute">{MEASURE_FIELDS.map((f) => m[f] ?? '–').join(' · ')}</span>
                <button onClick={() => confirm('Delete this entry?') && deleteMeasurement(m.id)} className="text-mute">✕</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

function Account() {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  async function sync() {
    setState('busy')
    try { await syncNow() } finally { setState('done'); setTimeout(() => setState('idle'), 1500) }
  }
  return (
    <div className="mt-2 space-y-2">
      <button onClick={sync} disabled={state === 'busy'} className="w-full rounded-2xl bg-white py-3 font-bold ring-1 ring-black/10 disabled:opacity-50">
        {state === 'busy' ? 'Syncing…' : state === 'done' ? 'Up to date ✓' : '☁️ Sync now'}
      </button>
      <button onClick={() => supabase.auth.signOut()} className="w-full rounded-2xl py-3 font-bold text-mute">Sign out</button>
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {hint && <p className="mb-3 text-xs text-mute">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="font-semibold">{label}</span>
      {children}
    </div>
  )
}

const inputCls = 'rounded-xl bg-cream px-3 py-2 text-right ring-1 ring-black/10 outline-none focus:ring-peach'

function Num({ value, onChange, placeholder, w }: { value: string; onChange: (v: string) => void; placeholder?: string; w: string }) {
  return <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={placeholder} className={`${inputCls} ${w}`} />
}

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} w-32`} />
}

function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-40 appearance-none`}>
      <option value="">–</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
