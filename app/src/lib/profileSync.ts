import { db } from '../db'
import { supabase } from './supabase'
import type { Measurement, Profile } from '../types'

async function uid() {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function saveProfile(patch: Partial<Profile>) {
  const cur = (await db.profile.get('me')) ?? { id: 'me' as const, updatedAt: 0, synced: 0 as const }
  await db.profile.put({ ...cur, ...patch, id: 'me', updatedAt: Date.now(), synced: 0 })
  void pushProfile()
}

export async function addMeasurement(m: Omit<Measurement, 'id' | 'createdAt' | 'synced'>) {
  await db.measurements.put({ ...m, id: crypto.randomUUID(), createdAt: Date.now(), synced: 0 })
  void pushProfile()
}

export async function deleteMeasurement(id: string) {
  await db.measurements.delete(id)
  if (await uid()) await supabase.from('measurements').delete().eq('id', id)
}

async function pushProfile() {
  const userId = await uid()
  if (!userId) return
  const p = await db.profile.get('me')
  if (p && p.synced === 0) {
    const { error } = await supabase.from('profile').upsert({
      user_id: userId, height_in: p.heightIn ?? null, weight_lb: p.weightLb ?? null, hair: p.hair ?? null,
      eyes: p.eyes ?? null, size_top: p.sizeTop ?? null, size_bottom: p.sizeBottom ?? null,
      size_dress: p.sizeDress ?? null, size_shoe: p.sizeShoe ?? null, style_notes: p.styleNotes ?? null,
      updated_at: new Date(p.updatedAt).toISOString(),
    })
    if (!error) await db.profile.update('me', { synced: 1 })
    else console.warn('profile push failed', error)
  }
  for (const m of await db.measurements.where('synced').equals(0).toArray()) {
    const { error } = await supabase.from('measurements').upsert({
      id: m.id, user_id: userId, taken_on: m.takenOn, bust: m.bust ?? null, waist: m.waist ?? null,
      hips: m.hips ?? null, inseam: m.inseam ?? null, shoulder: m.shoulder ?? null,
      created_at: new Date(m.createdAt).toISOString(),
    })
    if (!error) await db.measurements.update(m.id, { synced: 1 })
    else console.warn('measurement push failed', error)
  }
}

async function pullProfile() {
  const userId = await uid()
  if (!userId) return
  const { data: prow } = await supabase.from('profile').select('*').maybeSingle()
  const local = await db.profile.get('me')
  if (prow && (!local || (local.synced === 1 && Date.parse(prow.updated_at) > local.updatedAt))) {
    await db.profile.put({
      id: 'me', heightIn: prow.height_in ?? undefined, weightLb: prow.weight_lb ?? undefined,
      hair: prow.hair ?? undefined, eyes: prow.eyes ?? undefined, sizeTop: prow.size_top ?? undefined,
      sizeBottom: prow.size_bottom ?? undefined, sizeDress: prow.size_dress ?? undefined,
      sizeShoe: prow.size_shoe ?? undefined, styleNotes: prow.style_notes ?? undefined,
      updatedAt: Date.parse(prow.updated_at), synced: 1,
    })
  }
  const { data: rows } = await supabase.from('measurements').select('*')
  for (const r of rows ?? []) {
    if (await db.measurements.get(r.id)) continue
    await db.measurements.put({
      id: r.id, takenOn: r.taken_on, bust: r.bust ?? undefined, waist: r.waist ?? undefined,
      hips: r.hips ?? undefined, inseam: r.inseam ?? undefined, shoulder: r.shoulder ?? undefined,
      createdAt: Date.parse(r.created_at), synced: 1,
    })
  }
}

export async function syncProfile() {
  await pushProfile()
  await pullProfile()
}
