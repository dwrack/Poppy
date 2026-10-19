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

export interface ShopLink { title: string; store: string; url: string; price: string; exact: boolean }

export type ItemStatus = 'active' | 'laundry' | 'archived'

export interface Item {
  id: string
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
  fabric?: string
  fit?: string
  feel?: string
  links?: ShopLink[]
  photo: Blob
  cutout: Blob
  createdAt: number
  updatedAt: number
  /** 0 = needs push to cloud, 1 = in sync */
  synced: 0 | 1
}

export const CATEGORY_LABEL: Record<Category, string> = {
  top: 'Top', bottom: 'Bottom', dress: 'Dress', outerwear: 'Jacket', shoes: 'Shoes',
  bag: 'Bag', hat: 'Hat', scarf: 'Scarf', accessory: 'Accessory',
}

export interface Profile {
  id: 'me'
  heightIn?: number
  weightLb?: number
  hair?: string
  eyes?: string
  sizeTop?: string
  sizeBottom?: string
  sizeDress?: string
  sizeShoe?: string
  styleNotes?: string
  updatedAt: number
  synced: 0 | 1
}

export const MEASURE_FIELDS = ['bust', 'waist', 'hips', 'inseam', 'shoulder'] as const
export type MeasureField = (typeof MEASURE_FIELDS)[number]

export interface Measurement {
  id: string
  takenOn: string // YYYY-MM-DD
  bust?: number
  waist?: number
  hips?: number
  inseam?: number
  shoulder?: number
  createdAt: number
  synced: 0 | 1
}
