import Dexie, { type EntityTable } from 'dexie'
import type { Item, Measurement, Profile } from './types'

export const db = new Dexie('poppyseed-v2') as Dexie & {
  items: EntityTable<Item, 'id'>
  tombstones: EntityTable<{ id: string }, 'id'>
  profile: EntityTable<Profile, 'id'>
  measurements: EntityTable<Measurement, 'id'>
}

db.version(2).stores({
  items: 'id, category, status, favourite, createdAt, synced',
  tombstones: 'id',
})

db.version(3).stores({
  items: 'id, category, status, favourite, createdAt, synced',
  tombstones: 'id',
  profile: 'id',
  measurements: 'id, takenOn, synced',
})
