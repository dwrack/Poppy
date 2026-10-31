import { db } from '../db'
import { supabase } from './supabase'
import type { Measurement, Profile } from '../types'
import { signedInDb, stillBound } from './account'

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
  const me = await signedInDb()
  if (me) await supabase.from('measurements').delete().eq('id', id).eq('user_id', me.userId)
}

/** Push the signed-in account's own profile and measurements, from its own database, under its own id. */
async function pushProfile() {
  const me = await signedInDb()
  if (!me) return
  const { userId, db: local } = me
  const p = await local.profile.get('me')
  if (p && p.synced === 0 && stillBound(local)) {
    const { error } = await supabase.from('profile').upsert({
      user_id: userId, height_in: p.heightIn ?? null, weight_lb: p.weightLb ?? null, hair: p.hair ?? null,
      eyes: p.eyes ?? null, size_top: p.sizeTop ?? null, size_bottom: p.sizeBottom ?? null,
      size_dress: p.sizeDress ?? null, size_shoe: p.sizeShoe ?? null, style_notes: p.styleNotes ?? null,
      updated_at: new Date(p.updatedAt).toISOString(),
    })
    if (!error) await local.profile.update('me', { synced: 1 })
    else console.warn('profile push failed', error)
  }
  for (const m of await local.measurements.where('synced').equals(0).toArray()) {
    if (!stillBound(local)) return
    const { error } = await supabase.from('measurements').upsert({
      id: m.id, user_id: userId, taken_on: m.takenOn, bust: m.bust ?? null, waist: m.waist ?? null,
      hips: m.hips ?? null, inseam: m.inseam ?? null, shoulder: m.shoulder ?? null,
      created_at: new Date(m.createdAt).toISOString(),
    })
    if (!error) await local.measurements.update(m.id, { synced: 1 })
    else console.warn('measurement push failed', error)
  }
}

async function pullProfile() {
  const me = await signedInDb()
  if (!me) return
  const { userId, db: local } = me
  const { data: prow } = await supabase.from('profile').select('*').eq('user_id', userId).maybeSingle()
  if (!stillBound(local)) return
  const cur = await local.profile.get('me')
  if (prow && (!cur || (cur.synced === 1 && Date.parse(prow.updated_at) > cur.updatedAt))) {
    await local.profile.put({
      id: 'me', heightIn: prow.height_in ?? undefined, weightLb: prow.weight_lb ?? undefined,
      hair: prow.hair ?? undefined, eyes: prow.eyes ?? undefined, sizeTop: prow.size_top ?? undefined,
      sizeBottom: prow.size_bottom ?? undefined, sizeDress: prow.size_dress ?? undefined,
      sizeShoe: prow.size_shoe ?? undefined, styleNotes: prow.style_notes ?? undefined,
      updatedAt: Date.parse(prow.updated_at), synced: 1,
    })
  }
  const { data: rows } = await supabase.from('measurements').select('*').eq('user_id', userId)
  for (const r of rows ?? []) {
    if (!stillBound(local)) return
    if (await local.measurements.get(r.id)) continue
    await local.measurements.put({
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
