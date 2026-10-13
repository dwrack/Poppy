import { db } from '../db'
import { BUCKET, supabase } from './supabase'
import type { Item } from '../types'

type Row = {
  id: string; name: string; category: string; colours: string[]; pattern: string
  warmth: number; formality: number; seasons: string[]; brand: string | null; notes: string | null
  status: string; favourite: boolean; tucked: boolean; photo_path: string; cutout_path: string
  created_at: string; updated_at: string
}

async function uid() {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

const paths = (userId: string, id: string) => ({
  photo: `${userId}/${id}/photo.jpg`,
  cutout: `${userId}/${id}/cutout.png`,
})

function toRow(item: Item, userId: string): Omit<Row, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string } {
  const p = paths(userId, item.id)
  return {
    id: item.id, name: item.name, category: item.category, colours: item.colours, pattern: item.pattern,
    warmth: item.warmth, formality: item.formality, seasons: item.seasons, brand: item.brand ?? null,
    notes: item.notes ?? null, status: item.status, favourite: item.favourite, tucked: item.tucked,
    photo_path: p.photo, cutout_path: p.cutout,
    created_at: new Date(item.createdAt).toISOString(), updated_at: new Date(item.updatedAt).toISOString(),
  }
}

/** Save locally first (instant UI), then push to the cloud in the background. */
export async function saveItem(item: Item) {
  await db.items.put({ ...item, synced: 0 })
  void pushPending()
}

export async function patchItem(id: string, patch: Partial<Item>) {
  await db.items.update(id, { ...patch, updatedAt: Date.now(), synced: 0 })
  void pushPending()
}

export async function deleteItem(id: string) {
  await db.transaction('rw', db.items, db.tombstones, async () => {
    await db.items.delete(id)
    await db.tombstones.put({ id })
  })
  void pushPending()
}

let pushing: Promise<void> | null = null
export function pushPending() {
  if (!pushing) pushing = doPush().finally(() => { pushing = null })
  return pushing
}

async function doPush() {
  const userId = await uid()
  if (!userId) return

  for (const { id } of await db.tombstones.toArray()) {
    const p = paths(userId, id)
    await supabase.storage.from(BUCKET).remove([p.photo, p.cutout])
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (!error) await db.tombstones.delete(id)
  }

  const dirty = await db.items.where('synced').equals(0).toArray()
  for (const item of dirty) {
    const p = paths(userId, item.id)
    const [a, b] = await Promise.all([
      supabase.storage.from(BUCKET).upload(p.photo, item.photo, { upsert: true, contentType: 'image/jpeg' }),
      supabase.storage.from(BUCKET).upload(p.cutout, item.cutout, { upsert: true, contentType: 'image/png' }),
    ])
    if (a.error || b.error) { console.warn('upload failed', a.error ?? b.error); continue }
    const { error } = await supabase.from('items').upsert(toRow(item, userId))
    if (error) { console.warn('row upsert failed', error); continue }
    await db.items.update(item.id, { synced: 1 })
  }
}

/** Bring down anything in the cloud we don't have locally (new device, reinstall). */
export async function pullAll() {
  const userId = await uid()
  if (!userId) return
  const { data, error } = await supabase.from('items').select('*')
  if (error || !data) { console.warn('pull failed', error); return }

  const localIds = new Set((await db.items.toCollection().primaryKeys()) as string[])
  const dead = new Set((await db.tombstones.toCollection().primaryKeys()) as string[])
  const cloudIds = new Set<string>()

  for (const row of data as Row[]) {
    cloudIds.add(row.id)
    if (localIds.has(row.id) || dead.has(row.id)) continue
    const [photo, cutout] = await Promise.all([
      supabase.storage.from(BUCKET).download(row.photo_path),
      supabase.storage.from(BUCKET).download(row.cutout_path),
    ])
    if (!photo.data || !cutout.data) continue
    await db.items.put({
      id: row.id, name: row.name, category: row.category as Item['category'], colours: row.colours as Item['colours'],
      pattern: row.pattern as Item['pattern'], warmth: row.warmth as Item['warmth'], formality: row.formality as Item['formality'],
      seasons: row.seasons as Item['seasons'], brand: row.brand ?? undefined, notes: row.notes ?? undefined,
      status: row.status as Item['status'], favourite: row.favourite, tucked: row.tucked,
      photo: photo.data, cutout: cutout.data,
      createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at), synced: 1,
    })
  }

  // Anything synced locally but gone from the cloud was deleted elsewhere.
  for (const id of localIds) {
    if (cloudIds.has(id)) continue
    const it = await db.items.get(id)
    if (it?.synced === 1) await db.items.delete(id)
  }
}

export async function syncNow() {
  await pushPending()
  await pullAll()
}
