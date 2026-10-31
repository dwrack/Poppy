import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { describeItems, signPaths, type Borrow, type FriendItem, type Member } from './friends'
import type { Chip } from './game'
import type { Category } from '../types'
import type { RemotePiece } from '../components/Stack'

/* ---------- Borrow for the round ---------- */

const friendly = (e: { message: string }) => new Error(e.message.replace(/^.*?: /, ''))

/** Borrow requests tied to this round (both directions), kept live. `loaded` is false until the first fetch for this round lands. */
export function useRoundBorrows(roundId: string) {
  const [list, setList] = useState<Borrow[]>([])
  const [loadedFor, setLoadedFor] = useState<string>()
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('borrow_requests').select('*').eq('round_id', roundId).order('created_at', { ascending: false })
    if (error) return // keep what we had; never report "loaded" on a failed fetch
    setList((data ?? []) as Borrow[])
    setLoadedFor(roundId)
  }, [roundId])
  useEffect(() => {
    void refresh()
    const ch = supabase.channel('round-borrows').on('postgres_changes', { event: '*', schema: 'public', table: 'borrow_requests' }, () => void refresh()).subscribe()
    window.addEventListener('focus', refresh)
    return () => { void supabase.removeChannel(ch); window.removeEventListener('focus', refresh) }
  }, [refresh])
  return { list, loaded: loadedFor === roundId, refresh }
}

/**
 * Pieces I have a yes on for this round, as stackable remote pieces. `loading`
 * is true until the borrows have loaded AND their cards and signed URLs are in,
 * so a caller can hold off on anything that would drop pieces it cannot see yet.
 */
export function useBorrowedPieces(asked: Borrow[], members: Member[], ready = true) {
  const [got, setGot] = useState<{ key: string; pieces: RemotePiece[] }>({ key: '', pieces: [] })
  // Filtering by status means an older cancelled or declined row for the same
  // item never hides a newer yes, whatever order `asked` arrives in.
  const ok = asked.filter((b) => b.status === 'approved' || b.status === 'out')
  const key = ok.map((b) => b.item_id).sort().join(',')
  useEffect(() => {
    if (!key) { setGot({ key, pieces: [] }); return }
    let live = true
    describeItems(key.split(',')).then((cards) => {
      if (!live) return
      setGot({ key, pieces: [...cards.entries()].map(([id, c]) => ({
        id, name: c.name, category: c.category as Category, url: c.url, owner_id: c.owner,
        owner: members.find((m) => m.user_id === c.owner)?.display_name ?? 'a friend',
      })) })
    })
    return () => { live = false }
  }, [key, members])
  return { pieces: got.pieces, loading: !ready || got.key !== key }
}

export async function askToBorrowForRound(item: FriendItem, roundId: string) {
  const { error } = await supabase.from('borrow_requests').insert({ item_id: item.id, owner_id: item.user_id, round_id: roundId })
  if (error) throw friendly(error)
}

/** A friend's closet, throwing when the network is down so the UI can say so. */
export async function loadFriendRack(memberId: string): Promise<FriendItem[]> {
  const { data, error } = await supabase.rpc('friend_items', { member: memberId })
  if (error) throw friendly(error)
  const items = (data ?? []) as FriendItem[]
  if (items.length) {
    const byPath = await signPaths(items.map((i) => i.cutout_path))
    for (const i of items) i.cutoutUrl = byPath.get(i.cutout_path)
  }
  return items.filter((i) => i.status !== 'archived')
}

/* ---------- Style a friend ---------- */

export type LookStatus = 'sent' | 'worn' | 'declined'
export interface StyledLook {
  id: string; round_id: string; from_user: string; to_user: string; item_ids: string[]; message_chip: Chip
  status: LookStatus; created_at: string; from_name: string; to_name: string
}

/** Looks sent to me or by me this round, kept live. Mine-sent come back as 'sent' until the reveal. */
export function useStyledLooks(roundId: string) {
  const [looks, setLooks] = useState<StyledLook[]>([])
  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc('styled_looks_for_round', { r: roundId })
    setLooks((data ?? []) as StyledLook[])
  }, [roundId])
  useEffect(() => {
    void refresh()
    const ch = supabase.channel('styled-looks').on('postgres_changes', { event: '*', schema: 'public', table: 'styled_looks' }, () => void refresh()).subscribe()
    window.addEventListener('focus', refresh)
    return () => { void supabase.removeChannel(ch); window.removeEventListener('focus', refresh) }
  }, [refresh])
  return { looks, refresh }
}

export async function sendStyledLook(roundId: string, toUser: string, itemIds: string[], chip: Chip) {
  const { error } = await supabase.from('styled_looks').insert({ round_id: roundId, to_user: toUser, item_ids: itemIds, message_chip: chip })
  if (error) throw friendly(error)
}

/** Wave a look off (or take that back). 'worn' is never written: it is derived from my entry. */
export async function answerStyledLook(id: string, status: Exclude<LookStatus, 'worn'>) {
  const { error } = await supabase.from('styled_looks').update({ status }).eq('id', id)
  if (error) throw friendly(error)
}

/**
 * Wear a styled look as my entry. One write: the entry points at the look, and
 * that pointer is what makes it 'worn' (styled_looks_for_round, round_entry_cards,
 * styled_win stars all read it from there). Wearing another look, or building my
 * own in the dressing room, moves or clears the pointer, so nothing can drift.
 */
export async function wearStyledLook(roundId: string, userId: string, look: StyledLook) {
  const { error } = await supabase.from('entries').upsert(
    { round_id: roundId, user_id: userId, outfit: { items: look.item_ids, borrowed: [] }, styled_look_id: look.id, submitted_at: new Date().toISOString() },
    { onConflict: 'round_id,user_id' },
  )
  if (error) throw friendly(error)
}
