import { useCallback, useEffect, useState } from 'react'
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
/** photo_jobs.item_ids takes 1 to 6 pieces. */
export const MAX_PHOTO_PIECES = 6

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

/** Ask the studio for a photo. Dress me: pieces from her own closet. Entry: pieces from that runway look. */
export async function queuePhoto(kind: PhotoKind, itemIds: string[], entryId?: string): Promise<PhotoJob> {
  const item_ids = [...new Set(itemIds)].slice(0, MAX_PHOTO_PIECES)
  if (!item_ids.length) throw new Error('Put something on first.')
  const { data, error } = await supabase.from('photo_jobs')
    .insert({ kind, item_ids, ...(kind === 'entry' ? { entry_id: entryId } : {}) })
    .select(JOB_COLUMNS).single()
  if (error) throw friendly(error)
  return data as PhotoJob
}

/** Queue the photo for a runway look. Fire and forget: the reveal falls back to the avatar if it never arrives. */
export function queueEntryPhoto(entryId: string, itemIds: string[]) {
  if (!itemIds.length) return
  queuePhoto('entry', itemIds, entryId).catch(() => { /* table not pasted yet, or offline: the avatar covers it */ })
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
  return { jobs, latest: jobs.find((j) => j.status !== 'rejected'), live, refresh, add }
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
    default: return null
  }
}

/** Same pieces, any order. */
export function sameLook(a: string[], b: string[]) {
  const x = new Set(a.slice(0, MAX_PHOTO_PIECES)), y = new Set(b.slice(0, MAX_PHOTO_PIECES))
  return x.size === y.size && [...x].every((id) => y.has(id))
}
