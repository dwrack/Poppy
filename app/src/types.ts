export const CATEGORIES = [
  'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'hat', 'scarf', 'accessory',
] as const
export type Category = (typeof CATEGORIES)[number]

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const
export type Season = (typeof SEASONS)[number]

export const COLOURS = [
  'black', 'white', 'grey', 'navy', 'blue', 'denim', 'green', 'olive', 'brown', 'tan',
  'cream', 'red', 'pink', 'orange', 'yellow', 'purple', 'multi',
] as const
export type Colour = (typeof COLOURS)[number]

export const PATTERNS = ['solid', 'stripe', 'check', 'floral', 'print', 'texture'] as const
export type Pattern = (typeof PATTERNS)[number]

export type ItemStatus = 'active' | 'laundry' | 'archived'

export interface Item {
  id?: number
  name: string
  category: Category
  colours: Colour[]
  pattern: Pattern
  warmth: 1 | 2 | 3 | 4 | 5
  formality: 1 | 2 | 3 | 4 | 5
  seasons: Season[]
  brand?: string
  notes?: string
  status: ItemStatus
  favourite: boolean
  tucked: boolean
  photo: Blob
  cutout: Blob
  createdAt: number
}

export const CATEGORY_LABEL: Record<Category, string> = {
  top: 'Top', bottom: 'Bottom', dress: 'Dress', outerwear: 'Jacket', shoes: 'Shoes',
  bag: 'Bag', hat: 'Hat', scarf: 'Scarf', accessory: 'Accessory',
}
