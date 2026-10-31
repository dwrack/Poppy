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
  size?: string
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

/* ---------- Avatar (v3 step 1) ---------- */

export const AVATAR_FACES = [
  { id: 'sweet', label: 'Sweet', emoji: '🙂' },
  { id: 'sunny', label: 'Sunny', emoji: '😄' },
  { id: 'chill', label: 'Chill', emoji: '😌' },
  { id: 'wow', label: 'Wow', emoji: '😮' },
] as const
export type AvatarFace = (typeof AVATAR_FACES)[number]['id']

export const AVATAR_SKINS = [
  { id: 'porcelain', hex: '#fbe6d8' },
  { id: 'fair', hex: '#f3d4be' },
  { id: 'light', hex: '#e9c2a3' },
  { id: 'medium', hex: '#d6a57a' },
  { id: 'olive', hex: '#c18d5e' },
  { id: 'tan', hex: '#a97047' },
  { id: 'brown', hex: '#7f4f2f' },
  { id: 'deep', hex: '#4e3021' },
] as const
export type AvatarSkin = (typeof AVATAR_SKINS)[number]['id']

export const AVATAR_HAIRS = [
  { id: 'long', label: 'Long' },
  { id: 'bob', label: 'Bob' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'pigtails', label: 'Pigtails' },
  { id: 'buns', label: 'Space buns' },
  { id: 'bun', label: 'Top bun' },
  { id: 'braid', label: 'Braid' },
  { id: 'halfup', label: 'Half up' },
  { id: 'pixie', label: 'Pixie' },
  { id: 'curls', label: 'Curls' },
] as const
export type AvatarHair = (typeof AVATAR_HAIRS)[number]['id']

export const AVATAR_HAIR_COLOURS = [
  { id: 'black', hex: '#1c1715' },
  { id: 'dark brown', hex: '#3d2619' },
  { id: 'brown', hex: '#6c4529' },
  { id: 'light brown', hex: '#9c6c40' },
  { id: 'auburn', hex: '#8c3b1f' },
  { id: 'red', hex: '#c2482b' },
  { id: 'blonde', hex: '#e4c37c' },
  { id: 'platinum', hex: '#f0e6cc' },
  { id: 'pink', hex: '#f08cb8' },
  { id: 'blue', hex: '#5d8fe8' },
] as const
export type AvatarHairColour = (typeof AVATAR_HAIR_COLOURS)[number]['id']

export const AVATAR_EYES = [
  { id: 'brown', hex: '#6b3e1e' },
  { id: 'hazel', hex: '#917a3a' },
  { id: 'green', hex: '#4f8a4c' },
  { id: 'blue', hex: '#4c7fd1' },
  { id: 'grey', hex: '#8c9099' },
  { id: 'violet', hex: '#8a5fc9' },
] as const
export type AvatarEye = (typeof AVATAR_EYES)[number]['id']

/** What the renderer needs to draw a girl. Friends' rows map to this too. */
export interface AvatarLook {
  face: AvatarFace
  skin: AvatarSkin
  hair: AvatarHair
  hairColour: AvatarHairColour
  eyes: AvatarEye
}

export const DEFAULT_LOOK: AvatarLook = { face: 'sweet', skin: 'fair', hair: 'long', hairColour: 'brown', eyes: 'brown' }

/** Her own presets, one local row, synced to avatar_presets like profile. */
export interface AvatarPresets extends AvatarLook {
  id: 'me'
  updatedAt: number
  synced: 0 | 1
}

export const OUTFIT_SLOTS = ['top', 'bottom', 'dress', 'outer', 'shoes'] as const
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number]
export const SLOT_LABEL: Record<OutfitSlot, string> = { top: 'Top', bottom: 'Bottom', dress: 'Dress', outer: 'Jacket', shoes: 'Shoes' }
export const SLOT_CATEGORY: Record<OutfitSlot, Category> = { top: 'top', bottom: 'bottom', dress: 'dress', outer: 'outerwear', shoes: 'shoes' }

/** One garment as the avatar sees it: colours, pattern, and a hint for the shape. */
export interface Garment {
  id: string
  colours: Colour[]
  pattern: Pattern
  /** 'skirt' adds a skirt cone under a bottom. Taken from the item's name. */
  shape?: 'skirt'
}
export type Outfit = Partial<Record<OutfitSlot, Garment>>

export function slotOf(category: Category): OutfitSlot | undefined {
  return (Object.keys(SLOT_CATEGORY) as OutfitSlot[]).find((s) => SLOT_CATEGORY[s] === category)
}

export function garmentOf(item: Pick<Item, 'id' | 'colours' | 'pattern' | 'name' | 'notes'>): Garment {
  const skirt = /skirt/i.test(item.name) || /skirt/i.test(item.notes ?? '')
  return { id: item.id, colours: item.colours, pattern: item.pattern, shape: skirt ? 'skirt' : undefined }
}
