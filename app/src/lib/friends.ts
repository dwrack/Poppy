import { useCallback, useEffect, useState } from 'react'
import { supabase, BUCKET } from './supabase'
import type { Category, Colour } from '../types'

export interface Group { id: string; name: string; owner_id: string }
export interface Member { group_id: string; user_id: string; display_name: string; emoji: string; role: 'owner' | 'member' }
export interface FriendItem {
  id: string; user_id: string; name: string; category: Category; colours: Colour[]; pattern: string
  warmth: number; formality: number; status: string; notes: string | null; cutout_path: string; cutoutUrl?: string
}
export type BorrowStatus = 'requested' | 'approved' | 'declined' | 'out' | 'returned' | 'cancelled'
export interface Borrow {
  id: string; item_id: string; owner_id: string; borrower_id: string; status: BorrowStatus
  needed_on: string | null; due_on: string | null; note: string | null; created_at: string
}

export const APP_URL = 'https://dwrack.github.io/Poppy/v2/'

const STORAGE = 'https://yrcddfehjjbtzwuotmym.supabase.co/storage/v1'

/** Signed photo links for many paths at once, keyed by path. */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
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

/** The current user's group (first one), its members, and a refresh function. */
export function useSquad(userId: string) {
  const [state, setState] = useState<{ loading: boolean; group?: Group; members: Member[] }>({ loading: true, members: [] })
  const refresh = useCallback(async () => {
    const { data: mine } = await supabase.from('group_members').select('group_id').eq('user_id', userId).limit(1)
    const gid = mine?.[0]?.group_id
    if (!gid) { setState({ loading: false, members: [] }); return }
    const [{ data: g }, { data: m }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', gid).single(),
      supabase.from('group_members').select('*').eq('group_id', gid).order('joined_at'),
    ])
    setState({ loading: false, group: g ?? undefined, members: (m ?? []) as Member[] })
  }, [userId])

  useEffect(() => {
    void refresh()
    const ch = supabase.channel('members').on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => void refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [refresh])
  return { ...state, refresh }
}

export async function createSquad(name: string, myName: string, emoji: string) {
  const { error } = await supabase.rpc('create_group', { group_name: name, my_name: myName, my_emoji: emoji })
  if (error) throw friendly(error)
}

export async function joinSquad(code: string, myName: string, emoji: string) {
  const { error } = await supabase.rpc('join_group', { invite_code: code, my_name: myName, my_emoji: emoji })
  if (error) throw friendly(error)
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
  const items = data as FriendItem[]
  if (items.length) {
    const byPath = await signPaths(items.map((i) => i.cutout_path))
    for (const i of items) i.cutoutUrl = byPath.get(i.cutout_path)
  }
  return items
}

/** All borrow requests involving me, kept live. */
export function useBorrows(userId: string) {
  const [list, setList] = useState<Borrow[]>([])
  const refresh = useCallback(async () => {
    const { data } = await supabase.from('borrow_requests').select('*').order('created_at', { ascending: false })
    setList((data ?? []) as Borrow[])
  }, [])
  useEffect(() => {
    void refresh()
    const ch = supabase.channel('borrows').on('postgres_changes', { event: '*', schema: 'public', table: 'borrow_requests' }, () => void refresh()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [refresh, userId])
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
