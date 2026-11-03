import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, BUCKET, uniqueTopic } from './supabase'
import { closetOf, type Category, type ClosetKind, type Colour } from '../types'

export interface Group { id: string; name: string; owner_id: string; tz?: string | null }
export interface Member { group_id: string; user_id: string; display_name: string; emoji: string; role: 'owner' | 'member' }
export interface FriendItem {
  id: string; user_id: string; name: string; category: Category; colours: Colour[]; pattern: string
  warmth: number; formality: number; status: string; notes: string | null; cutout_path: string; cutoutUrl?: string
  /** v10: friend_items only returns 'mine'; kept so the client can filter too. */
  closet?: ClosetKind | null
}
export type BorrowStatus = 'requested' | 'approved' | 'declined' | 'out' | 'returned' | 'cancelled'
export interface Borrow {
  id: string; item_id: string; owner_id: string; borrower_id: string; status: BorrowStatus
  needed_on: string | null; due_on: string | null; note: string | null; round_id: string | null; created_at: string
}

export const APP_URL = 'https://dwrack.github.io/Poppy/v2/'

const STORAGE = 'https://yrcddfehjjbtzwuotmym.supabase.co/storage/v1'

/** Signed photo links for many paths at once, keyed by path. `bucket` is the closet unless said otherwise (photo-real renders live in their own). */
export async function signPaths(paths: string[], bucket: string = BUCKET): Promise<Map<string, string>> {
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600)
  const out = new Map<string, string>()
  for (const u of (data ?? []) as { path: string | null; signedUrl?: string; signedURL?: string }[]) {
    const link = u.signedUrl || (u.signedURL ? STORAGE + u.signedURL : '')
    if (u.path && link) out.set(u.path, link)
  }
  return out
}

function friendly(e: { message: string } | null) {
  return e ? new Error(e.message.replace(/^.*?: /, '')) : null
}

// The squads themselves (every squad I am in, the active one, its members) live in squads.tsx.

/** Start a squad. Returns its id. */
export async function createSquad(name: string, myName: string, emoji: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', { group_name: name, my_name: myName, my_emoji: emoji })
  if (error) throw friendly(error)
  return data as string
}

/** Join a squad with an invite code. Returns its id. Works when you are already in other squads. */
export async function joinSquad(code: string, myName: string, emoji: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group', { invite_code: code.trim().toUpperCase(), my_name: myName, my_emoji: emoji })
  if (error) throw friendly(error)
  return data as string
}

/** Leave a squad (only your own membership; the squad and everyone else stay). */
/** Leave a squad. If you started it, it passes to whoever joined first (leave_group, v9). */
export async function leaveSquad(groupId: string) {
  const { error } = await supabase.rpc('leave_group', { g: groupId })
  if (error) throw friendly(error)
}

/**
 * An invite link (?invite=CODE) opened while already signed in: hand the code over once
 * and take it out of the address bar, so a reload does not offer it again.
 */
export function takeInviteFromUrl(): string | null {
  const url = new URL(location.href)
  const code = url.searchParams.get('invite')
  if (!code) return null
  url.searchParams.delete('invite')
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  return code.trim().toUpperCase().slice(0, 12) || null
}

export async function makeInvite(groupId: string) {
  const { data, error } = await supabase.rpc('make_invite', { g: groupId })
  if (error) throw friendly(error)
  return data as string
}

export async function updateMyCard(groupId: string, userId: string, patch: Partial<Pick<Member, 'display_name' | 'emoji'>>) {
  await supabase.from('group_members').update(patch).eq('group_id', groupId).eq('user_id', userId)
}

export async function loadFriendCloset(memberId: string): Promise<FriendItem[]> {
  const { data, error } = await supabase.rpc('friend_items', { member: memberId })
  if (error || !data) return []
  // Friends never see a wishlist. The server already leaves wish pieces out (v10); this covers an older server.
  const items = (data as FriendItem[]).filter((i) => closetOf(i) === 'mine')
  if (items.length) {
    const byPath = await signPaths(items.map((i) => i.cutout_path))
    for (const i of items) i.cutoutUrl = byPath.get(i.cutout_path)
  }
  return items
}

/**
 * Borrow requests involving me in this squad only, kept live. A request made
 * for a round belongs to that round's squad; a plain one (Squad tab) shows in
 * every squad I share with the other person. Requests from my other squads
 * never show here. An open plain request with someone who has left every squad
 * we shared stays on the board, so a lent piece can still be marked returned.
 */
export function useBorrows(userId: string, groupId: string, members: Member[], allMates: Map<string, string>) {
  const [state, setState] = useState<{ all: Borrow[]; groupOf: Map<string, string> }>({ all: [], groupOf: new Map() })
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('borrow_requests').select('*').order('created_at', { ascending: false })
    if (error || !Array.isArray(data)) return
    const all = data as Borrow[]
    const roundIds = [...new Set(all.flatMap((b) => (b.round_id ? [b.round_id] : [])))]
    const groupOf = new Map<string, string>()
    if (roundIds.length) {
      const { data: rs } = await supabase.from('rounds').select('id, group_id').in('id', roundIds)
      for (const r of (rs ?? []) as { id: string; group_id: string }[]) groupOf.set(r.id, r.group_id)
    }
    setState({ all, groupOf })
  }, [])
  useEffect(() => {
    void refresh()
    const ch = supabase.channel(uniqueTopic('borrows')).on('postgres_changes', { event: '*', schema: 'public', table: 'borrow_requests' }, () => void refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [refresh, userId])
  const list = useMemo(() => {
    const mates = new Set(members.map((m) => m.user_id))
    const open = new Set(['requested', 'approved', 'out'])
    return state.all.filter((b) => {
      if (b.round_id) return state.groupOf.get(b.round_id) === groupId
      const other = b.owner_id === userId ? b.borrower_id : b.owner_id
      return mates.has(other) || (!allMates.has(other) && open.has(b.status))
    })
  }, [state, members, allMates, groupId, userId])
  return { list, refresh }
}

export async function askToBorrow(item: FriendItem, neededOn: string | null, note: string) {
  const { error } = await supabase.from('borrow_requests').insert({ item_id: item.id, owner_id: item.user_id, needed_on: neededOn, note: note || null })
  if (error) throw friendly(error)
}

export async function setBorrowStatus(id: string, status: BorrowStatus, extra: Partial<Borrow> = {}) {
  const { error } = await supabase.from('borrow_requests').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw friendly(error)
}

/** Look up names and thumbnails for items mentioned in borrow requests. */
export async function describeItems(ids: string[]): Promise<Map<string, { name: string; category: string; url?: string; owner: string }>> {
  const out = new Map<string, { name: string; category: string; url?: string; owner: string }>()
  if (!ids.length) return out
  const { data } = await supabase.rpc('borrow_item_cards', { ids })
  const rows = (data ?? []) as { id: string; name: string; category: string; cutout_path: string; user_id: string }[]
  if (rows.length) {
    const byPath = await signPaths(rows.map((r) => r.cutout_path))
    for (const r of rows) out.set(r.id, { name: r.name, category: r.category, url: byPath.get(r.cutout_path), owner: r.user_id })
  }
  return out
}
