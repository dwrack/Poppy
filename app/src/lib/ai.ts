import { supabase } from './supabase'
import type { Category, Colour, Pattern, Season, ShopLink } from '../types'

export interface Description {
  name: string; category: Category; colours: Colour[]; pattern: Pattern; fabric: string; fit: string
  warmth: 1 | 2 | 3 | 4 | 5; formality: 1 | 2 | 3 | 4 | 5; seasons: Season[]; feel: string; search_query: string
  brand: string; size: string
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
  if (error) {
    // On a 4xx/5xx the friendly { error } body sits on error.context (a Response).
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      const msg = await ctx.clone().json().then((b: { error?: unknown }) => b?.error, () => undefined)
      if (typeof msg === 'string' && msg) throw new Error(msg)
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

export async function describePhoto(cutout: Blob, tag?: Blob): Promise<Description> {
  return call<Description>({ mode: 'describe', image: await toBase64(cutout), tag: tag ? await toBase64(tag, 1024) : undefined })
}

export async function findOnline(query: string, cutout?: Blob): Promise<ShopLink[]> {
  const res = await call<{ matches: ShopLink[] }>({ mode: 'find', query, image: cutout ? await toBase64(cutout, 512) : undefined })
  return res.matches ?? []
}

/** What describe-item mode 'import' sends back for a pasted shop link. */
export interface ImportResult {
  title: string
  store: string
  /** Price with currency as shown, e.g. "$28", or empty. */
  price: string
  url: string
  image: { media_type: string; data: string }
  description?: Description
}

/** Turns base64 (no data: prefix) into a Blob. */
export function base64ToBlob(data: string, type = 'image/jpeg'): Blob {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/**
 * Reads a shop link on the server: title, store, price and the product photo (plus a description when it can).
 * Throws an Error with a message the UI can show. If the function has not been redeployed with 'import' yet,
 * the error has name 'NeedsDeploy'.
 */
export async function importLink(url: string): Promise<ImportResult> {
  let link = url.trim()
  if (!link) throw new Error('Paste a link first')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(link)) link = 'https://' + link
  link = link.replace(/^http:\/\//i, 'https://')
  if (!/^https:\/\//i.test(link)) throw new Error('Links need to start with https://')
  if (link.length > 2000) throw new Error('That link is too long')
  let res: ImportResult
  try {
    res = await call<ImportResult>({ mode: 'import', url: link })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    if (err.message === 'Unknown mode') {
      const needs = new Error("Link import isn't switched on yet")
      needs.name = 'NeedsDeploy'
      throw needs
    }
    throw err
  }
  if (!res?.image?.data) throw new Error("Couldn't find a picture of the piece on that page")
  return { ...res, title: res.title ?? '', store: res.store ?? '', price: res.price ?? '', url: res.url || link }
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
