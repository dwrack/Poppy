import { db, type PoppyDb } from '../db'
import { BUCKET, supabase } from './supabase'
import type { Item } from '../types'
import { signedInDb, stillBound } from './account'
import { syncProfile } from './profileSync'
import { syncAvatar } from './avatarSync'

type Row = {
  id: string; name: string; category: string; colours: string[]; pattern: string
  warmth: number; formality: number; seasons: string[]; brand: string | null; notes: string | null
  status: string; favourite: boolean; tucked: boolean; photo_path: string; cutout_path: string
  fabric: string | null; fit: string | null; feel: string | null; links: Item['links'] | null; size: string | null
  created_at: string; updated_at: string
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
    fabric: item.fabric ?? null, fit: item.fit ?? null, feel: item.feel ?? null, links: item.links ?? [], size: item.size ?? null,
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

// One push at a time per database; a different account's database gets its own.
let pushing: { db: PoppyDb; done: Promise<void> } | null = null
export function pushPending() {
  if (pushing?.db !== db) {
    const local = db
    const done = doPush().finally(() => { if (pushing?.done === done) pushing = null })
    pushing = { db: local, done }
  }
  return pushing.done
}

/**
 * Upload this account's unsynced pieces and deletions. Everything here comes
 * from the signed-in account's own database and goes up under its own id; if
 * the account changes part way, the loop stops and the rest waits for its owner.
 */
/** Same person still signed in, and their database still bound. */
async function stillOwner(userId: string, local: PoppyDb) {
  if (!stillBound(local)) return false
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id === userId && stillBound(local)
}

async function doPush() {
  const me = await signedInDb()
  if (!me) return
  const { userId, db: local } = me

  for (const { id } of await local.tombstones.toArray()) {
    if (!(await stillOwner(userId, local))) return
    const p = paths(userId, id)
    await supabase.storage.from(BUCKET).remove([p.photo, p.cutout])
    const { error } = await supabase.from('items').delete().eq('id', id).eq('user_id', userId)
    // A delete sent after a sign-out goes out as nobody: RLS matches 0 rows and reports no
    // error. Only drop the tombstone if the same person is still signed in afterwards.
    if (!(await stillOwner(userId, local))) return
    if (!error) await local.tombstones.delete(id)
  }

  const dirty = await local.items.where('synced').equals(0).toArray()
  for (const item of dirty) {
    if (!stillBound(local)) return
    const p = paths(userId, item.id)
    const [a, b] = await Promise.all([
      supabase.storage.from(BUCKET).upload(p.photo, item.photo, { upsert: true, contentType: 'image/jpeg' }),
      supabase.storage.from(BUCKET).upload(p.cutout, item.cutout, { upsert: true, contentType: 'image/png' }),
    ])
    if (a.error || b.error) { console.warn('upload failed', a.error ?? b.error); continue }
    const { error } = await supabase.from('items').upsert({ ...toRow(item, userId), user_id: userId })
    if (error) { console.warn('row upsert failed', error); continue }
    if (!(await stillOwner(userId, local))) return
    await local.items.update(item.id, { synced: 1 })
  }
}

/** Bring down anything in the cloud we don't have locally (new device, reinstall). Only into the signed-in account's own database. */
export async function pullAll() {
  const me = await signedInDb()
  if (!me) return
  const { userId, db: local } = me
  const { data, error } = await supabase.from('items').select('*').eq('user_id', userId)
  if (error || !data) { console.warn('pull failed', error); return }
  if (!stillBound(local)) return

  const localIds = new Set((await local.items.toCollection().primaryKeys()) as string[])
  const dead = new Set((await local.tombstones.toCollection().primaryKeys()) as string[])
  const cloudIds = new Set<string>()

  for (const row of data as Row[]) {
    cloudIds.add(row.id)
    if (localIds.has(row.id) || dead.has(row.id)) continue
    const [photo, cutout] = await Promise.all([
      supabase.storage.from(BUCKET).download(row.photo_path),
      supabase.storage.from(BUCKET).download(row.cutout_path),
    ])
    if (!photo.data || !cutout.data || !stillBound(local)) continue
    await local.items.put({
      id: row.id, name: row.name, category: row.category as Item['category'], colours: row.colours as Item['colours'],
      pattern: row.pattern as Item['pattern'], warmth: row.warmth as Item['warmth'], formality: row.formality as Item['formality'],
      seasons: row.seasons as Item['seasons'], brand: row.brand ?? undefined, notes: row.notes ?? undefined,
      status: row.status as Item['status'], favourite: row.favourite, tucked: row.tucked,
      fabric: row.fabric ?? undefined, fit: row.fit ?? undefined, feel: row.feel ?? undefined, links: row.links ?? [], size: row.size ?? undefined,
      photo: photo.data, cutout: cutout.data,
      createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at), synced: 1,
    })
  }

  // Anything synced locally but gone from the cloud was deleted elsewhere.
  for (const id of localIds) {
    if (cloudIds.has(id) || !stillBound(local)) continue
    const it = await local.items.get(id)
    if (it?.synced === 1) await local.items.delete(id)
  }
}

export async function syncNow() {
  await pushPending()
  await pullAll()
  await syncProfile()
  await syncAvatar()
}
