import Dexie, { type EntityTable } from 'dexie'
import type { Item } from './types'

export const db = new Dexie('poppyseed') as Dexie & {
  items: EntityTable<Item, 'id'>
}

db.version(1).stores({
  items: '++id, category, status, favourite, createdAt',
})
