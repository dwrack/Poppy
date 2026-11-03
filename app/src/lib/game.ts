import { useCallback, useEffect, useState } from 'react'
import { BUCKET, supabase, uniqueTopic } from './supabase'
import { signPaths } from './friends'
import { signPhotos } from './photos'
import { downscale } from './cutout'
import { loadLooks } from './avatarSync'
import { DEFAULT_LOOK, garmentOf, isWish, slotOf, type AvatarLook, type Category, type ClosetKind, type Colour, type Pattern, type Outfit as AvatarOutfit } from '../types'

/* ---------- Types ---------- */

export type RoundStatus = 'upcoming' | 'open' | 'reveal' | 'voting' | 'done'
export interface Round {
  id: string; group_id: string; theme: string | null
  opens_at: string; closes_at: string; reveal_at: string; voting_ends_at: string
  status: RoundStatus; picked_by: string | null
  theme_pick_id?: string | null; theme_veto_id?: string | null; theme_pick_by?: string | null
  season_no: number | null; round_no: number | null
  /** The pack the round's theme came from. Null before the drop (no theme yet) and for step 1 rounds. */
  pack: ThemePack | null
}
/**
 * colours and pattern arrive once v4b-avatar-runway.sql is pasted; before that the avatar wears grey.
 * closet arrives with v10-wishlist.sql: 'wish' is a wishlist piece (entered for fun, badged, never in a photo).
 */
export interface Piece { id: string; name: string; category: Category; cutout_path: string; url?: string; owner_id: string; owner: string; colours?: Colour[]; pattern?: Pattern; closet?: ClosetKind | null }
export interface Outfit { items: string[]; borrowed?: string[] }
export interface EntryCard {
  entry_id: string; user_id: string; display_name: string; emoji: string; outfit: Outfit
  /** the studio's photo-real render of this look (bucket photoreal), once v8-photoreal.sql is pasted and the photo is done */
  photo_path: string | null; photoUrl?: string; submitted_at: string; pieces: Piece[]; styled_by: string | null
  /** the entrant's avatar presets; the default look when she has not set any */
  look: AvatarLook
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
  { title: 'Closet Legend', at: 600 },
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

/** A round with its theme's pack joined in (rounds.theme_id -> themes.pack_id -> theme_packs). */
// `themes!theme_id`: after v5 rounds has three FKs to themes (theme_id, theme_pick_id, theme_veto_id),
// so PostgREST needs told which one the pack hangs off.
const ROUND_SELECT = '*, themes!theme_id(theme_packs(id, name, lobby_colour, confetti_colour))'
type RoundRow = Omit<Round, 'pack'> & { themes?: { theme_packs: ThemePack | null } | null }
function toRound(row: RoundRow): Round {
  const { themes, ...rest } = row
  return { ...rest, pack: themes?.theme_packs ?? null }
}

/** The squad's current round (the newest that isn't done) and its last finished one, kept live. */
export function useRound(groupId?: string) {
  const [state, setState] = useState<{ loading: boolean; current: Round | null; last: Round | null }>({ loading: true, current: null, last: null })
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    if (!groupId) return
    await advanceRounds()
    const [{ data: cur }, { data: prev }] = await Promise.all([
      supabase.from('rounds').select(ROUND_SELECT).eq('group_id', groupId).neq('status', 'done').order('opens_at').limit(1),
      supabase.from('rounds').select(ROUND_SELECT).eq('group_id', groupId).eq('status', 'done').order('closes_at', { ascending: false }).limit(1),
    ])
    const first = (rows: unknown[] | null) => (rows?.[0] ? toRound(rows[0] as RoundRow) : null)
    setState({ loading: false, current: first(cur), last: first(prev) })
  }, [groupId])

  useEffect(() => {
    void refresh()
    // This squad's rounds only; another squad's clock moving is not this screen's business.
    const ch = groupId
      ? supabase.channel(uniqueTopic(`rounds:${groupId}`)).on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `group_id=eq.${groupId}` }, () => void refresh()).subscribe()
      : null
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { if (ch) void supabase.removeChannel(ch); clearInterval(tick); window.removeEventListener('focus', onFocus) }
  }, [refresh, groupId])

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

/** Save my look. `borrowed` lists which of the ids are a friend's pieces (with a yes for this round). A hand-built look is never a styled one. Returns the entry id. */
export async function submitEntry(roundId: string, userId: string, itemIds: string[], borrowed: string[] = []): Promise<string | undefined> {
  const { data, error } = await supabase.from('entries').upsert(
    { round_id: roundId, user_id: userId, outfit: { items: itemIds, borrowed }, styled_look_id: null, submitted_at: new Date().toISOString() },
    { onConflict: 'round_id,user_id' },
  ).select('id').maybeSingle()
  if (error) {
    // outfit_allowed() refuses a piece the server has no copy of yet (still saving, or offline).
    if (/row-level security/i.test(error.message)) throw new Error('One of these pieces is still saving. Try again in a minute.')
    throw new Error(error.message.replace(/^.*?: /, ''))
  }
  return (data as { id: string } | null)?.id
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

type AvatarRow = { face: string; skin: string; hair: string; hair_colour: string; eyes: string } | null

/** Entries with their pieces and signed photo links. Before the reveal the server returns only your own. */
export async function loadRunway(roundId: string): Promise<EntryCard[]> {
  // v2 carries colours, pattern and avatar presets; fall back to v1 until v4b-avatar-runway.sql is pasted
  let rows: (Omit<EntryCard, 'look'> & { avatar?: AvatarRow })[] | null = null
  const v2 = await supabase.rpc('round_entry_cards_v2', { r: roundId })
  if (!v2.error && v2.data) rows = v2.data
  else {
    const v1 = await supabase.rpc('round_entry_cards', { r: roundId })
    if (v1.error || !v1.data) return []
    rows = v1.data
  }
  if (!rows) return []
  const fallback = rows.some((c) => c.avatar === undefined) ? await loadLooks([...new Set(rows.map((c) => c.user_id))]) : null
  const cards: EntryCard[] = rows.map(({ avatar, ...c }) => ({
    ...c,
    look: avatar ? { face: avatar.face, skin: avatar.skin, hair: avatar.hair, hairColour: avatar.hair_colour, eyes: avatar.eyes } as AvatarLook
      : fallback?.get(c.user_id) ?? DEFAULT_LOOK,
  }))
  const paths = cards.flatMap((c) => c.pieces.map((p) => p.cutout_path))
  const photos = cards.flatMap((c) => (c.photo_path ? [c.photo_path] : []))
  const [byPath, byPhoto] = await Promise.all([
    paths.length ? signPaths(paths) : new Map<string, string>(),
    signPhotos(photos).catch(() => new Map<string, string>()),
  ])
  for (const c of cards) {
    for (const p of c.pieces) p.url = byPath.get(p.cutout_path)
    if (c.photo_path) c.photoUrl = byPhoto.get(c.photo_path)
  }
  return cards
}

/** The wishlist pieces in a runway look (badged ✨ wishlist on the reveal). */
export function wishPieces(card: Pick<EntryCard, 'pieces'>): Piece[] {
  return card.pieces.filter(isWish)
}

/** The avatar's outfit from a card's pieces: first piece per slot wins, a dress outranks top and bottom on the rig. */
export function outfitOf(card: Pick<EntryCard, 'pieces'>): AvatarOutfit {
  const o: AvatarOutfit = {}
  for (const p of card.pieces) {
    const s = slotOf(p.category)
    if (!s || o[s]) continue
    o[s] = garmentOf({ id: p.id, name: p.name, notes: '', colours: p.colours ?? ['grey'], pattern: p.pattern ?? 'solid' })
  }
  return o
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
  const { data } = await supabase.from('rounds').select(ROUND_SELECT).eq('group_id', groupId).eq('status', 'done').order('closes_at', { ascending: false }).limit(limit)
  const rounds = ((data ?? []) as unknown as RoundRow[]).map(toRound)
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

/* ---------- Seasons ---------- */

export const SEASON_ROUNDS = 12
export interface ThemePack { id: string; name: string; lobby_colour: string; confetti_colour: string }
export const EVERYDAY_PACK: ThemePack = { id: '', name: 'Everyday', lobby_colour: '#2a2a2a', confetti_colour: '#e76f51' }
export type Badge = 'Season Winner' | 'Most Improved' | 'Never Missed a Round' | 'Best Lender'
export const BADGE_EMOJI: Record<Badge, string> = { 'Season Winner': '👑', 'Most Improved': '📈', 'Never Missed a Round': '🔥', 'Best Lender': '🤝' }
export interface SeasonBadge { id: string; user_id: string; group_id: string; season_no: number; badge: Badge }
export interface SeasonRow {
  user_id: string; display_name: string; emoji: string; stars: number; entered: number; voted: number; wins: number; rounds_done: number
}

/** Today's date on this phone as YYYY-MM-DD (not UTC, so a pack flips at local midnight). */
function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The theme pack in season today (Everyday when none is). Falls back to Everyday offline. */
export function useActivePack() {
  const [pack, setPack] = useState<ThemePack>(EVERYDAY_PACK)
  useEffect(() => {
    let live = true
    supabase.rpc('active_pack', { d: localDate() }).then(({ data }) => { const p = (data as ThemePack[] | null)?.[0]; if (live && p) setPack(p) })
    return () => { live = false }
  }, [])
  return pack
}

/** The pack to colour the Runway with: the round's own pack while one is in play (so it never
 *  changes mid-round), the last round's while waiting for the next drop, else today's. */
export function packFor(current: Round | null, last: Round | null, today: ThemePack): ThemePack {
  if (current && current.status !== 'upcoming') return current.pack ?? EVERYDAY_PACK
  return last?.pack ?? today
}

/** Per-member totals for one season of a squad, best first. Empty when offline or not a member. */
export async function loadSeasonSummary(groupId: string, seasonNo: number): Promise<SeasonRow[]> {
  const { data } = await supabase.rpc('season_summary', { g: groupId, s: seasonNo })
  return (data ?? []) as SeasonRow[]
}

/** Badges for one season of a squad (everyone's), or every badge a user has earned. */
export async function loadSeasonBadges(groupId: string, seasonNo: number): Promise<SeasonBadge[]> {
  const { data } = await supabase.from('season_badges').select('*').eq('group_id', groupId).eq('season_no', seasonNo)
  return (data ?? []) as SeasonBadge[]
}

export async function loadMyBadges(userId: string): Promise<SeasonBadge[]> {
  const { data } = await supabase.from('season_badges').select('*').eq('user_id', userId).order('season_no', { ascending: false })
  return (data ?? []) as SeasonBadge[]
}

/** Season ranking with shared places, like rank() for rounds. */
export function rankSeason(rows: SeasonRow[]) {
  const sorted = [...rows].sort((a, b) => b.stars - a.stars)
  let place = 0, last = -1
  return sorted.map((row) => {
    if (row.stars !== last) { place++; last = row.stars }
    return { place, row }
  })
}
