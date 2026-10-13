import Dexie, { type EntityTable } from 'dexie'
import type { Item } from './types'

export const db = new Dexie('poppyseed') as Dexie & {
  items: EntityTable<Item, 'id'>
  tombstones: EntityTable<{ id: string }, 'id'>
}

db.version(2).stores({
  items: 'id, category, status, favourite, createdAt, synced',
  tombstones: 'id',
})
