import { useCallback, useEffect, useState } from 'react'
import { BUCKET, supabase } from './supabase'
import { signPaths } from './friends'
import { downscale } from './cutout'
import type { Category } from '../types'

/* ---------- Types ---------- */

export type RoundStatus = 'upcoming' | 'open' | 'reveal' | 'voting' | 'done'
export interface Round {
  id: string; group_id: string; theme: string | null
  opens_at: string; closes_at: string; reveal_at: string; voting_ends_at: string
  status: RoundStatus; picked_by: string | null
  theme_pick_id?: string | null; theme_veto_id?: string | null; theme_pick_by?: string | null
}
export interface Piece { id: string; name: string; category: Category; cutout_path: string; url?: string; owner_id: string; owner: string }
export interface Outfit { items: string[]; borrowed?: string[] }
export interface EntryCard {
  entry_id: string; user_id: string; display_name: string; emoji: string; outfit: Outfit
  photo_path: string | null; photoUrl?: string; submitted_at: string; pieces: Piece[]; styled_by: string | null
}
export const CHIPS = ['colour', 'on theme', 'brave', 'fit', 'shoes'] as const
export type Chip = (typeof CHIPS)[number]
export const CHIP_LABEL: Record<Chip, string> = { colour: '🎨 colour', 'on theme': '🎯 on theme', brave: '🔥 brave', fit: '✂️ fit', shoes: '👟 shoes' }
export interface Vote { id: string; entry_id: string; voter_id: string; stars: number; chip: Chip }
export interface Result { entry_id: string; total: number; votes: number; chips: Partial<Record<Chip, number>> }
export interface WoreIt { user_id: string; display_name: string; emoji: string; photo_path: string | null; photoUrl?: string; created_at: string }
export interface PastRound { round: Round; cards: EntryCard[]; results: Result[]; woreIt: WoreIt[] }

/* ---------- Ladder ---------- */

export const LADDER = [
  { title: 'Newbie', at: 0 },
  { title: 'Trendsetter', at: 40 },
  { title: 'Stylist', at: 120 },
  { title: 'Icon', at: 300 },
  { title: 'Closet Goddess', at: 600 },
] as const

export function ladderFor(stars: number) {
  let i = 0
  while (i + 1 < LADDER.length && stars >= LADDER[i + 1].at) i++
  const next = LADDER[i + 1]
  return { title: LADDER[i].title, next: next?.title, toNext: next ? next.at - stars : 0, from: LADDER[i].at, to: next?.at }
}

/** Lifetime stars for a user, from the ledger. Refreshes on focus. */
export function useStars(userId: string) {
  const [stars, setStars] = useState<number>()
  const refresh = useCallback(async () => {
    const { data } = await supabase.from('stars_ledger').select('amount').eq('user_id', userId)
    setStars((data ?? []).reduce((n, r) => n + (r.amount as number), 0))
  }, [userId])
  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  return { stars, ...ladderFor(stars ?? 0), refresh }
}

/* ---------- The round clock ---------- */

/** Ask the server to move every round along. Idempotent, cheap. */
export async function advanceRounds() {
  await supabase.rpc('advance_rounds')
}

/** Where the round *should* be by the clock. The server's `status` is the truth; this drives countdowns and nudges a refresh at each boundary. */
export function phaseOf(r: Round, now: number): RoundStatus {
  if (r.status === 'done') return 'done'
  if (now < Date.parse(r.opens_at)) return 'upcoming'
  if (now < Date.parse(r.closes_at)) return 'open'
  if (now < Date.parse(r.reveal_at) + 3_600_000) return 'reveal'
  if (now < Date.parse(r.voting_ends_at)) return 'voting'
  return 'done'
}

/** When the current phase ends, as a timestamp. */
export function phaseEnds(r: Round): number {
  switch (r.status) {
    case 'upcoming': return Date.parse(r.opens_at)
    case 'open': return Date.parse(r.closes_at)
    case 'reveal': return Date.parse(r.reveal_at) + 3_600_000
    case 'voting': return Date.parse(r.voting_ends_at)
    default: return Date.parse(r.voting_ends_at)
  }
}

export function countdown(ms: number) {
  if (ms <= 0) return 'any second'
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d >= 1) return `${d}d ${h % 24}h`
  if (h >= 1) return `${h}h ${m % 60}m`
  if (m >= 1) return `${m}m ${Math.floor((ms % 60_000) / 1000)}s`
  return `${Math.floor(ms / 1000)}s`
}

/** The squad's current round (the newest that isn't done) and its last finished one, kept live. */
export function useRound(groupId?: string) {
  const [state, setState] = useState<{ loading: boolean; current: Round | null; last: Round | null }>({ loading: true, current: null, last: null })
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    if (!groupId) return
    await advanceRounds()
    const [{ data: cur }, { data: prev }] = await Promise.all([
      supabase.from('rounds').select('*').eq('group_id', groupId).neq('status', 'done').order('opens_at').limit(1),
      supabase.from('rounds').select('*').eq('group_id', groupId).eq('status', 'done').order('closes_at', { ascending: false }).limit(1),
    ])
    setState({ loading: false, current: (cur?.[0] as Round) ?? null, last: (prev?.[0] as Round) ?? null })
  }, [groupId])

  useEffect(() => {
    void refresh()
    const ch = supabase.channel('rounds').on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, () => void refresh()).subscribe()
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { void supabase.removeChannel(ch); clearInterval(tick); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  // The moment the clock crosses a boundary, ask the server to catch up (covers phones with no cron yet).
  const phase = state.current ? phaseOf(state.current, now) : undefined
  const status = state.current?.status
  useEffect(() => { if (phase && status && phase !== status) void refresh() }, [phase, status, refresh])

  return { ...state, now, refresh }
}

export async function startRoundNow(groupId: string) {
  const { error } = await supabase.rpc('start_round_now', { g: groupId })
  if (error) throw new Error(error.message.replace(/^.*?: /, ''))
}

/** Owner sets the squad's time zone once, so Friday 5pm is their Friday 5pm. */
export async function setSquadTimeZone(groupId: string) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (tz) await supabase.from('groups').update({ tz }).eq('id', groupId)
}

/* ---------- Entries ---------- */

export interface MyEntry { id: string; outfit: Outfit; submitted_at: string; styled_look_id: string | null }

export async function loadMyEntry(roundId: string, userId: string): Promise<MyEntry | null> {
  const { data } = await supabase.from('entries').select('id, outfit, submitted_at, styled_look_id').eq('round_id', roundId).eq('user_id', userId).maybeSingle()
  return (data as MyEntry | null) ?? null
}

/** Save my look. `borrowed` lists which of the ids are a friend's pieces (with a yes for this round). A hand-built look is never a styled one. */
export async function submitEntry(roundId: string, userId: string, itemIds: string[], borrowed: string[] = []) {
  const { error } = await supabase.from('entries').upsert(
    { round_id: roundId, user_id: userId, outfit: { items: itemIds, borrowed }, styled_look_id: null, submitted_at: new Date().toISOString() },
    { onConflict: 'round_id,user_id' },
  )
  if (error) throw new Error(error.message.replace(/^.*?: /, ''))
}

/** Who has a look in so far. Names only, never the looks. */
export async function loadSubmitted(roundId: string): Promise<string[]> {
  const { data } = await supabase.rpc('round_submitted', { r: roundId })
  return (data ?? []) as string[]
}

/**
 * Who has a look in, kept live. Two Realtime feeds (a private broadcast the
 * server sends on every entry, plus postgres_changes on entries) and a poll
 * that runs slowly while live and quickly when the socket is down.
 */
export function useSubmitted(roundId: string) {
  const [submitted, setSubmitted] = useState<string[]>([])
  const [live, setLive] = useState(false)
  const refresh = useCallback(() => loadSubmitted(roundId).then(setSubmitted), [roundId])
  useEffect(() => {
    void refresh()
    const ch = supabase.channel(`round:${roundId}`, { config: { private: true } })
      .on('broadcast', { event: 'entry' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `round_id=eq.${roundId}` }, () => void refresh())
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    window.addEventListener('focus', refresh)
    return () => { void supabase.removeChannel(ch); window.removeEventListener('focus', refresh) }
  }, [refresh, roundId])
  useEffect(() => {
    const t = setInterval(() => void refresh(), live ? 120_000 : 20_000)
    return () => clearInterval(t)
  }, [live, refresh])
  return { submitted, live, refresh }
}

/** Entries with their pieces and signed photo links. Before the reveal the server returns only your own. */
export async function loadRunway(roundId: string): Promise<EntryCard[]> {
  const { data, error } = await supabase.rpc('round_entry_cards', { r: roundId })
  if (error || !data) return []
  const cards = data as EntryCard[]
  const paths = cards.flatMap((c) => [...c.pieces.map((p) => p.cutout_path), ...(c.photo_path ? [c.photo_path] : [])])
  if (paths.length) {
    const byPath = await signPaths(paths)
    for (const c of cards) {
      for (const p of c.pieces) p.url = byPath.get(p.cutout_path)
      if (c.photo_path) c.photoUrl = byPath.get(c.photo_path)
    }
  }
  return cards
}

/* ---------- Votes ---------- */

export async function loadMyVotes(entryIds: string[]): Promise<Vote[]> {
  if (!entryIds.length) return []
  const { data } = await supabase.from('votes').select('*').in('entry_id', entryIds)
  return (data ?? []) as Vote[]
}

export async function castVote(entryId: string, stars: number, chip: Chip) {
  const { error } = await supabase.from('votes').upsert({ entry_id: entryId, stars, chip }, { onConflict: 'entry_id,voter_id' })
  if (error) throw new Error(error.message.replace(/^.*?: /, ''))
  void advanceRounds() // if that was the last vote, the server closes the round early
}

export async function loadResults(roundId: string): Promise<Result[]> {
  const { data } = await supabase.rpc('round_results', { r: roundId })
  return (data ?? []) as Result[]
}

/** Podium order with shared places: [{ place, card, result }]. Ties share a place. */
export function rank(cards: EntryCard[], results: Result[]) {
  const by = new Map(results.map((r) => [r.entry_id, r]))
  const rows = cards.map((card) => ({ card, result: by.get(card.entry_id) ?? { entry_id: card.entry_id, total: 0, votes: 0, chips: {} } }))
  rows.sort((a, b) => b.result.total - a.result.total)
  let place = 0, lastTotal = -1
  return rows.map((r) => {
    if (r.result.total !== lastTotal) { place++; lastTotal = r.result.total }
    return { place, ...r }
  })
}

/* ---------- Lookbook ---------- */

export async function loadLookbook(groupId: string, limit = 8): Promise<PastRound[]> {
  const { data } = await supabase.from('rounds').select('*').eq('group_id', groupId).eq('status', 'done').order('closes_at', { ascending: false }).limit(limit)
  const rounds = (data ?? []) as Round[]
  return Promise.all(rounds.map(async (round) => {
    const [cards, results, woreIt] = await Promise.all([loadRunway(round.id), loadResults(round.id), loadWoreIt(round.id)])
    return { round, cards, results, woreIt }
  }))
}

/* ---------- Random order everyone agrees on ---------- */

/** Shuffle seeded by the round id, so every phone flips the looks in the same random order. */
export function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  const rnd = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

/* ---------- Theme prop ---------- */

export interface ThemeOption { id: string; text: string }

/** Did I (tie-)win the squad's last round? Then I set next week's theme. */
export async function canPickTheme(groupId: string): Promise<boolean> {
  const { data } = await supabase.rpc('can_pick_theme', { g: groupId })
  return data === true
}

export async function loadThemeOptions(groupId: string): Promise<ThemeOption[]> {
  const { data } = await supabase.rpc('theme_options', { g: groupId })
  return (data ?? []) as ThemeOption[]
}

/** Names for the pick and veto already on the round, if any. */
export async function loadThemeNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const want = ids.filter((x): x is string => !!x)
  if (!want.length) return new Map()
  const { data } = await supabase.from('themes').select('id, text').in('id', want)
  return new Map(((data ?? []) as ThemeOption[]).map((t) => [t.id, t.text]))
}

/** Pick a theme for the upcoming round, or veto one. Pass null to clear. RLS lets only last round's winner through. */
export async function setThemePick(roundId: string, patch: { theme_pick_id?: string | null; theme_veto_id?: string | null }) {
  const { error, count } = await supabase.from('rounds').update(patch, { count: 'exact' }).eq('id', roundId)
  if (error) throw new Error(error.message.replace(/^.*?: /, ''))
  if (count === 0) throw new Error('Only last round’s winner can set the theme, and only before it drops.')
}

/* ---------- Wore it for real ---------- */

/** Client-side mirror of the server's window: the day after the reveal, for a week. The server is the truth. */
export function woreItOpen(round: Round, now: number) {
  if (round.status !== 'done') return false
  const reveal = new Date(round.reveal_at), today = new Date(now)
  const dayAfter = new Date(reveal.getFullYear(), reveal.getMonth(), reveal.getDate() + 1).getTime()
  return today.getTime() >= dayAfter && now < Date.parse(round.reveal_at) + 8 * 86_400_000
}

export async function loadWoreIt(roundId: string): Promise<WoreIt[]> {
  const { data } = await supabase.rpc('round_wore_it', { r: roundId })
  const rows = (data ?? []) as WoreIt[]
  const paths = rows.flatMap((r) => (r.photo_path ? [r.photo_path] : []))
  if (paths.length) {
    const byPath = await signPaths(paths)
    for (const r of rows) if (r.photo_path) r.photoUrl = byPath.get(r.photo_path)
  }
  return rows
}

/** "I wore it for real", with an optional photo that goes in her own closet folder (lookbook only, never the runway). */
export async function markWoreIt(roundId: string, userId: string, photo?: File) {
  let photo_path: string | null = null
  if (photo) {
    const small = await downscale(photo, 1600)
    photo_path = `${userId}/wore/${roundId}.jpg`
    const up = await supabase.storage.from(BUCKET).upload(photo_path, small, { upsert: true, contentType: 'image/jpeg' })
    if (up.error) throw new Error(up.error.message)
  }
  const { error } = await supabase.from('round_actions').upsert(
    { user_id: userId, round_id: roundId, kind: 'wore_it', ...(photo_path ? { photo_path } : {}) },
    { onConflict: 'user_id,round_id,kind' },
  )
  if (error) throw new Error(/policy/i.test(error.message) ? 'That opens the day after the runway, for a week.' : error.message.replace(/^.*?: /, ''))
}

/* ---------- Squad ladder + seasons ---------- */

export interface LadderRow { user_id: string; display_name: string; emoji: string; stars: number; rounds_played: number; wore_count: number; streak: number }
export interface Season { rounds_done: number; season_no: number; round_in_season: number; rounds_per_season: number }

/** Everyone's stars side by side, plus where the squad is in its season. Refreshes on focus. */
export function useSquadLadder(groupId?: string) {
  const [rows, setRows] = useState<LadderRow[]>()
  const [season, setSeason] = useState<Season | null>(null)
  const refresh = useCallback(async () => {
    if (!groupId) return
    const [{ data: l }, { data: s }] = await Promise.all([
      supabase.rpc('squad_ladder', { g: groupId }),
      supabase.from('squad_season').select('*').eq('group_id', groupId).maybeSingle(),
    ])
    setRows(((l ?? []) as LadderRow[]).slice().sort((a, b) => b.stars - a.stars))
    setSeason((s as Season | null) ?? null)
  }, [groupId])
  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  return { rows, season, refresh }
}
