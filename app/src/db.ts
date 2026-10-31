import Dexie, { type EntityTable } from 'dexie'
import type { AvatarPresets, Item, Measurement, Profile } from './types'

export type PoppyDb = Dexie & {
  items: EntityTable<Item, 'id'>
  tombstones: EntityTable<{ id: string }, 'id'>
  profile: EntityTable<Profile, 'id'>
  measurements: EntityTable<Measurement, 'id'>
  avatar: EntityTable<AvatarPresets, 'id'>
}

/**
 * Before v4 every account on a phone shared this one database, so a second
 * account saw (and could push) the first one's closet. It is only opened now
 * to hand it to its owner once (lib/account.ts), then deleted.
 */
export const LEGACY_DB = 'poppyseed-v2'

/** Each account gets its own database on the device: two people on one phone never see or sync each other's closet. */
export function dbNameFor(userId: string) {
  return `${LEGACY_DB}-${userId}`
}

export function openDb(name: string): PoppyDb {
  const d = new Dexie(name) as PoppyDb
  d.version(2).stores({
    items: 'id, category, status, favourite, createdAt, synced',
    tombstones: 'id',
  })
  d.version(3).stores({
    items: 'id, category, status, favourite, createdAt, synced',
    tombstones: 'id',
    profile: 'id',
    measurements: 'id, takenOn, synced',
  })
  d.version(4).stores({
    items: 'id, category, status, favourite, createdAt, synced',
    tombstones: 'id',
    profile: 'id',
    measurements: 'id, takenOn, synced',
  })
  d.version(5).stores({
    items: 'id, category, status, favourite, createdAt, synced',
    tombstones: 'id',
    profile: 'id',
    measurements: 'id, takenOn, synced',
    avatar: 'id',
  })
  return d
}

// Nobody signed in yet: a database that never opens, so a stray read or write
// fails loudly instead of landing in somebody's closet.
const SIGNED_OUT = openDb('poppyseed-signed-out')
SIGNED_OUT.close({ disableAutoOpen: true })

let owner: string | null = null

/**
 * The signed-in account's own database. It is a live binding: bindDb() swaps
 * it when a different account signs in, and every importer sees the new one.
 * The app only renders closet screens once it is bound (App.tsx), keyed by
 * the account, so nothing on screen ever reads another account's database.
 */
export let db: PoppyDb = SIGNED_OUT

/** Whose database `db` is, or null before anyone has signed in on this page. */
export function dbOwner() {
  return owner
}

export function bindDb(userId: string, d: PoppyDb) {
  db = d
  owner = userId
}
