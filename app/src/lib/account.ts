import Dexie from 'dexie'
import { useEffect, useState } from 'react'
import { LEGACY_DB, bindDb, db, dbNameFor, dbOwner, openDb, type PoppyDb } from '../db'
import type { AvatarPresets, Item, Measurement, Profile } from '../types'
import { supabase } from './supabase'

/*
 * One device, several accounts (Poppy and Penny on the family iPad, say).
 * Each account has its own local database (db.ts), and sync only ever pushes
 * an account's database while that same account is signed in. Sign out and
 * the next person gets an empty, separate closet; sign back in and yours is
 * still there, unsynced pieces included.
 */

/**
 * The signed-in account and its own database, or null. Null when nobody is
 * signed in, when the session belongs to someone else than the database (a
 * switch mid-way), or when the server does not recognise the session. Sync
 * goes through this, so one account's pieces can never go up under another's id.
 */
export async function signedInDb(): Promise<{ userId: string; db: PoppyDb } | null> {
  const owner = dbOwner()
  const local = db
  if (!owner) return null
  const { data } = await supabase.auth.getUser()
  if (data.user?.id !== owner || db !== local) return null
  return { userId: owner, db: local }
}

/** True while `local` is still the signed-in account's database (it stops being so on an account switch). */
export function stillBound(local: PoppyDb) {
  return db === local
}

let binding: { userId: string; done: Promise<void> } | null = null

/** Open this account's database (claiming the pre-v4 shared one if it is theirs) and make it `db`. */
export function bindAccount(userId: string): Promise<void> {
  if (binding?.userId === userId) return binding.done
  // Back to the account that is already bound: drop any half-done switch so it cannot land later.
  if (dbOwner() === userId) { binding = null; return Promise.resolve() }
  const target = openDb(dbNameFor(userId))
  const done = claimLegacy(userId, target)
    .catch((e) => { console.warn('old closet check skipped', e) })
    .then(() => { if (binding?.userId === userId) bindDb(userId, target) })
  binding = { userId, done }
  return done
}

/** Binds the signed-in account's database; true once it is ready to read. */
export function useAccountDb(userId?: string) {
  const [bound, setBound] = useState(() => dbOwner())
  useEffect(() => {
    if (!userId) return
    let live = true
    void bindAccount(userId).then(() => { if (live) setBound(dbOwner()) })
    return () => { live = false }
  }, [userId])
  return !!userId && bound === userId && dbOwner() === userId
}

/* ---------- The pre-v4 shared database ---------- */

interface LegacyData { items: Item[]; tombstones: { id: string }[]; profile: Profile[]; measurements: Measurement[]; avatar: AvatarPresets[] }

/** How long the "is this old closet yours?" check may take before the app opens anyway (it retries next time). */
const CHECK_MS = 5000

/**
 * The old shared database belongs to whichever account its synced rows belong
 * to in the cloud. If that is this account, copy everything (unsynced pieces
 * too) into its own database and delete the old one. If it is someone else's,
 * or there is no way to tell yet (offline, nothing ever synced), leave it
 * untouched for its owner: it is never shown and never pushed.
 */
export async function claimLegacy(userId: string, target: PoppyDb): Promise<'none' | 'claimed' | 'not yours' | 'unsure'> {
  const names = await Dexie.getDatabaseNames()
  if (!names.includes(LEGACY_DB)) return 'none'
  const old = openDb(LEGACY_DB)
  try {
    const data: LegacyData = {
      items: await old.items.toArray(), tombstones: await old.tombstones.toArray(), profile: await old.profile.toArray(),
      measurements: await old.measurements.toArray(), avatar: await old.avatar.toArray(),
    }
    const empty = !data.items.length && !data.tombstones.length && !data.profile.length && !data.measurements.length && !data.avatar.length
    if (!empty) {
      const verdict = await Promise.race([
        belongsTo(userId, data),
        new Promise<'unsure'>((ok) => setTimeout(() => ok('unsure'), CHECK_MS)),
      ])
      if (verdict === 'no') return 'not yours'
      if (verdict === 'unsure') return 'unsure'
      await copyInto(target, data)
    }
    old.close()
    // Not awaited: an old tab still holding it open would make the delete wait. Copying twice is harmless.
    void Dexie.delete(LEGACY_DB).catch(() => {})
    return empty ? 'none' : 'claimed'
  } finally {
    old.close()
  }
}

/** Does the cloud say these synced rows are this account's? RLS only ever returns your own rows; the user_id filter says so out loud. */
async function belongsTo(userId: string, d: LegacyData): Promise<'yes' | 'no' | 'unsure'> {
  let asked = false
  const itemIds = [...d.items.filter((i) => i.synced === 1).map((i) => i.id), ...d.tombstones.map((t) => t.id)].slice(0, 40)
  if (itemIds.length) {
    const { data, error } = await supabase.from('items').select('id').eq('user_id', userId).in('id', itemIds)
    if (error || !Array.isArray(data)) return 'unsure'
    if (data.length) return 'yes'
    asked = true
  }
  const measureIds = d.measurements.filter((m) => m.synced === 1).map((m) => m.id).slice(0, 40)
  if (measureIds.length) {
    const { data, error } = await supabase.from('measurements').select('id').eq('user_id', userId).in('id', measureIds)
    if (error || !Array.isArray(data)) return 'unsure'
    if (data.length) return 'yes'
    asked = true
  }
  for (const [table, row] of [['profile', d.profile.find((p) => p.synced === 1)], ['avatar_presets', d.avatar.find((a) => a.synced === 1)]] as const) {
    if (!row) continue
    const { data, error } = await supabase.from(table).select('updated_at').eq('user_id', userId).maybeSingle()
    if (error) return 'unsure'
    if (data && Date.parse((data as { updated_at: string }).updated_at) === row.updatedAt) return 'yes'
    asked = true
  }
  return asked ? 'no' : 'unsure'
}

/** Merge the old rows in. A row the account already has is kept unless the old one has unsynced changes. */
async function copyInto(target: PoppyDb, d: LegacyData) {
  await target.transaction('rw', [target.items, target.tombstones, target.profile, target.measurements, target.avatar], async () => {
    for (const it of d.items) if (it.synced === 0 || !(await target.items.get(it.id))) await target.items.put(it)
    if (d.tombstones.length) await target.tombstones.bulkPut(d.tombstones)
    for (const m of d.measurements) if (m.synced === 0 || !(await target.measurements.get(m.id))) await target.measurements.put(m)
    for (const p of d.profile) {
      const cur = await target.profile.get(p.id)
      if (!cur || p.synced === 0 || p.updatedAt > cur.updatedAt) await target.profile.put(p)
    }
    for (const a of d.avatar) {
      const cur = await target.avatar.get(a.id)
      if (!cur || a.synced === 0 || a.updatedAt > cur.updatedAt) await target.avatar.put(a)
    }
  })
}
