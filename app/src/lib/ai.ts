import { supabase } from './supabase'
import type { Category, Colour, Pattern, Season, ShopLink } from '../types'

export interface Description {
  name: string; category: Category; colours: Colour[]; pattern: Pattern; fabric: string; fit: string
  warmth: 1 | 2 | 3 | 4 | 5; formality: 1 | 2 | 3 | 4 | 5; seasons: Season[]; feel: string; search_query: string
}

async function toBase64(blob: Blob, maxSide = 768): Promise<{ media_type: string; data: string }> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close()
  const url = c.toDataURL('image/jpeg', 0.85)
  return { media_type: 'image/jpeg', data: url.split(',')[1] }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('describe-item', { body })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data as T
}

export async function describePhoto(cutout: Blob): Promise<Description> {
  return call<Description>({ mode: 'describe', image: await toBase64(cutout) })
}

export async function findOnline(query: string, cutout?: Blob): Promise<ShopLink[]> {
  const res = await call<{ matches: ShopLink[] }>({ mode: 'find', query, image: cutout ? await toBase64(cutout, 512) : undefined })
  return res.matches ?? []
}

/** Free ways to find a piece: Google Lens on the photo, Google Shopping on the text. */
export async function freeSearchLinks(itemId: string, query: string) {
  const { data } = await supabase.auth.getUser()
  const uid = data.user?.id
  let lens: string | undefined
  if (uid) {
    const { data: s } = await supabase.storage.from('closet').createSignedUrl(`${uid}/${itemId}/photo.jpg`, 3600)
    if (s?.signedUrl) lens = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(s.signedUrl)
  }
  const shop = 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(query)
  return { lens, shop }
}
