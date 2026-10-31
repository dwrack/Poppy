import { useCallback, useEffect, useState } from 'react'
import type { Category } from '../types'
import { supabase } from './supabase'
import { signPaths } from './friends'

/**
 * Photo-real looks (BRIEF-v4). The app only asks: it inserts a row in
 * photo_jobs and watches it. The studio Mac (a worker outside this repo)
 * renders the photo, uploads it to the private `photoreal` bucket and
 * moves the row along: queued > rendering > review > done (or failed).
 * See supabase/v8-photoreal.sql for the contract.
 */

export const PHOTO_BUCKET = 'photoreal'
/** Exact copy, BRIEF-v4. */
export const STUDIO_OFFLINE = 'Studio is offline, your photo will arrive later.'
/** The worker heartbeats into studio_status; older than this means the Mac is asleep or off. */
const STUDIO_STALE_MS = 10 * 60_000
/** photo_jobs.item_ids takes 1 to 5 pieces: her photo plus 5 garments is what the studio draws in one pass. */
export const MAX_PHOTO_PIECES = 5
/**
 * The studio's reference order, which is also what it keeps when a look has
 * more pieces than a photo holds (CATEGORY_ORDER in the worker's
 * studio/prompts.py). Pieces go out in this order and are cut after
 * MAX_PHOTO_PIECES, so a hat or bag picked first never pushes the shoes or
 * the jacket out of the photo.
 */
export const PHOTO_ORDER: readonly Category[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'hat', 'scarf', 'bag', 'accessory']

/** A piece for a photo: its id, and its category for the studio's order. */
export interface PhotoPiece { id: string; category: Category }

/** The item ids a photo of these pieces asks for: each once, in PHOTO_ORDER (pick order within a category), at most MAX_PHOTO_PIECES. */
export function photoItemIds(pieces: PhotoPiece[]): string[] {
  const rank = (c: Category) => { const i = PHOTO_ORDER.indexOf(c); return i < 0 ? PHOTO_ORDER.length : i }
  const unique = [...new Map(pieces.map((p) => [p.id, p])).values()]
  return unique.sort((a, b) => rank(a.category) - rank(b.category)).slice(0, MAX_PHOTO_PIECES).map((p) => p.id)
}

export type PhotoStatus = 'queued' | 'rendering' | 'review' | 'done' | 'failed' | 'rejected'
export type PhotoKind = 'dressme' | 'entry'
export interface PhotoJob {
  id: string; user_id: string; kind: PhotoKind; entry_id: string | null; round_id: string | null
  item_ids: string[]; status: PhotoStatus; result_path: string | null; error: string | null
  created_at: string; finished_at: string | null
}

const JOB_COLUMNS = 'id, user_id, kind, entry_id, round_id, item_ids, status, result_path, error, created_at, finished_at'

function friendly(e: { message: string }) {
  return new Error(e.message.replace(/^.*?: /, ''))
}

/**
 * Has a parent switched photo-real looks on for me? Their yes is my row in
 * photoreal_children, which only the studio side can write (v8). No row, or
 * v8 not pasted yet: no Photo button, no chips, nothing queued.
 */
export async function photoAllowed(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user.id
  if (!uid) return false
  const { data, error } = await supabase.from('photoreal_children').select('user_id').eq('user_id', uid).maybeSingle()
  return !error && !!data
}

/** photoAllowed(), checked again whenever the app comes back to the front. False until known. */
export function usePhotoAllowed() {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let on = true
    const check = () => { photoAllowed().then((a) => { if (on) setAllowed(a) }, () => {}) }
    check()
    window.addEventListener('focus', check)
    return () => { on = false; window.removeEventListener('focus', check) }
  }, [])
  return allowed
}

/** Ask the studio for a photo. Dress me: pieces from her own closet. Entry: her own pieces in that runway look. */
export async function queuePhoto(kind: PhotoKind, pieces: PhotoPiece[], entryId?: string): Promise<PhotoJob> {
  const item_ids = photoItemIds(pieces)
  if (!item_ids.length) throw new Error('Put something on first.')
  const { data, error } = await supabase.from('photo_jobs')
    .insert({ kind, item_ids, ...(kind === 'entry' ? { entry_id: entryId } : {}) })
    .select(JOB_COLUMNS).single()
  if (error) throw friendly(error)
  return data as PhotoJob
}

/**
 * Queue the photo for a runway look. Fire and forget: the reveal falls back
 * to the avatar if it never arrives. Nothing is queued unless a parent
 * switched photos on for her (photoAllowed). Borrowed pieces are dropped: a
 * friend's piece never goes onto her photo (her account can swap the image
 * behind it after the borrow was approved), it stays a cutout card beside it.
 */
export function queueEntryPhoto(entryId: string, pieces: PhotoPiece[], borrowed: string[] = []) {
  const lent = new Set(borrowed)
  const own = pieces.filter((p) => !lent.has(p.id))
  if (!own.length) return
  photoAllowed()
    .then((ok) => (ok ? queuePhoto('entry', own, entryId) : undefined))
    .catch(() => { /* table not pasted yet, or offline: the avatar covers it */ })
}

/** The pieces of a runway look that can go in its photo: hers, not the borrowed ones. */
export function ownPieces(itemIds: string[], borrowed: string[] = []) {
  const lent = new Set(borrowed)
  return itemIds.filter((id) => !lent.has(id))
}

/**
 * My photo jobs of one kind (newest first), kept live: Realtime on my own
 * rows, plus a poll that runs fast while something is pending and the
 * socket is down, slow otherwise. Empty until v8-photoreal.sql is pasted.
 */
export function useMyPhotoJobs(kind: PhotoKind, entryId?: string) {
  const [userId, setUserId] = useState<string>()
  const [jobs, setJobs] = useState<PhotoJob[]>([])
  const [live, setLive] = useState(false)

  useEffect(() => {
    let on = true
    supabase.auth.getSession().then(({ data }) => { if (on) setUserId(data.session?.user.id) })
    return () => { on = false }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) return
    let q = supabase.from('photo_jobs').select(JOB_COLUMNS).eq('user_id', userId).eq('kind', kind)
    if (entryId) q = q.eq('entry_id', entryId)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(10)
    if (!error && Array.isArray(data)) setJobs(data as PhotoJob[])
  }, [userId, kind, entryId])

  useEffect(() => {
    if (!userId) return
    void refresh()
    const ch = supabase.channel(`photo_jobs:${userId}:${kind}:${entryId ?? ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_jobs', filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    window.addEventListener('focus', refresh)
    return () => { void supabase.removeChannel(ch); window.removeEventListener('focus', refresh) }
  }, [userId, kind, entryId, refresh])

  const pending = jobs.some((j) => j.status === 'queued' || j.status === 'rendering' || j.status === 'review')
  useEffect(() => {
    if (!userId) return
    const t = setInterval(() => void refresh(), pending ? (live ? 60_000 : 15_000) : 120_000)
    return () => clearInterval(t)
  }, [userId, pending, live, refresh])

  /** Add a job I just queued without waiting for the round trip. */
  const add = useCallback((job: PhotoJob) => setJobs((js) => [job, ...js.filter((j) => j.id !== job.id)]), [])
  // Only a request she replaced before it started steps aside. A newer photo that failed or was
  // rejected (a safety check, or a parent) is what she sees, never an older photo standing in for it.
  return { jobs, latest: jobs.find((j) => !(j.status === 'rejected' && j.error === 'superseded')), live, refresh, add }
}

/** Is the studio Mac awake? Reads its heartbeat; offline when the row is missing or older than 10 minutes. */
export function useStudio() {
  const [lastSeen, setLastSeen] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('studio_status').select('last_seen_at').eq('id', 1).maybeSingle()
    const at = !error && data?.last_seen_at ? Date.parse(data.last_seen_at as string) : NaN
    setLastSeen(Number.isFinite(at) ? at : null)
    setNow(Date.now())
  }, [])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 60_000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(t); window.removeEventListener('focus', refresh) }
  }, [refresh])
  return { online: lastSeen !== null && now - lastSeen < STUDIO_STALE_MS, refresh }
}

/** A short-lived link to a rendered photo (own, or a squad mate's after the reveal). */
export async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  return paths.length ? signPaths(paths, PHOTO_BUCKET) : new Map()
}

/** The signed link for one job's photo, once it is done. */
export function usePhotoUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<{ path: string; url?: string }>()
  useEffect(() => {
    if (!path) return
    let on = true
    signPhotos([path]).then((m) => { if (on) setUrl({ path, url: m.get(path) }) }).catch(() => { if (on) setUrl({ path }) })
    return () => { on = false }
  }, [path])
  return path && url?.path === path ? url.url : undefined
}

export type ChipTone = 'wait' | 'ok' | 'bad' | 'off'
/** What the status chip says for a job, and whether the offline line shows under it. */
export function photoChip(job: PhotoJob | undefined, studioOnline: boolean): { label: string; tone: ChipTone; offline: boolean } | null {
  if (!job) return null
  const waiting = job.status === 'queued' || job.status === 'rendering'
  if (waiting && !studioOnline) return { label: 'Studio offline', tone: 'off', offline: true }
  switch (job.status) {
    case 'queued': return { label: 'Queued', tone: 'wait', offline: false }
    case 'rendering': return { label: 'Rendering…', tone: 'wait', offline: false }
    case 'review': return { label: 'In review', tone: 'wait', offline: false }
    case 'done': return { label: 'Ready', tone: 'ok', offline: false }
    case 'failed': return { label: 'Failed', tone: 'bad', offline: false }
    case 'rejected': return job.error === 'superseded' ? null : { label: 'Not approved', tone: 'bad', offline: false }
    default: return null
  }
}

/**
 * Is this job a photo of the look as it stands? The rule entry_photo_job()
 * uses in v8-photoreal.sql: every piece of the job is still in the look,
 * and it has as many pieces as a photo holds (all of them, or
 * MAX_PHOTO_PIECES when the look has more). For a runway look, pass her
 * own pieces only (ownPieces).
 */
export function coversLook(job: Pick<PhotoJob, 'item_ids'>, look: string[]) {
  const ids = new Set(look)
  return job.item_ids.every((id) => ids.has(id)) && new Set(job.item_ids).size === Math.min(MAX_PHOTO_PIECES, ids.size)
}
