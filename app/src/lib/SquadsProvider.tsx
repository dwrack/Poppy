import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, uniqueTopic } from './supabase'
import type { Group, Member } from './friends'
import { SquadsContext, readActive, writeActive, type Squad, type SquadsState } from './squads'

type MyRow = { group_id: string; display_name: string; emoji: string; role: 'owner' | 'member'; joined_at: string; groups: Group | null }

/**
 * Loads every squad the signed-in account is in and the active squad's members,
 * once for the whole app, kept live. Mounted inside the account-keyed tree
 * (App.tsx), so a different account starts from nothing.
 */
export function SquadsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [list, setList] = useState<{ loading: boolean; squads: Squad[] }>({ loading: true, squads: [] })
  const [activeId, setActiveId] = useState<string | null>(() => readActive(userId))
  const [mem, setMem] = useState<{ groupId?: string; list: Member[]; errorFor?: string }>({ list: [] })
  const [allMates, setAllMates] = useState<Map<string, string>>(() => new Map())
  const [membersTick, setMembersTick] = useState(0)

  const loadList = useCallback(async () => {
    const { data, error } = await supabase.from('group_members')
      .select('group_id, display_name, emoji, role, joined_at, groups(id, name, owner_id, tz)')
      .eq('user_id', userId).order('joined_at')
    if (error || !Array.isArray(data)) { setList((s) => ({ ...s, loading: false })); return }
    const squads = (data as unknown as MyRow[]).flatMap((r) => (r.groups
      ? [{ ...r.groups, my_name: r.display_name, my_emoji: r.emoji, role: r.role, joined_at: r.joined_at }]
      : []))
    setList({ loading: false, squads })
    // Everyone in any of my squads (RLS shows members of my squads only): the borrow board
    // uses it to keep open loans with someone who has since left every squad we shared.
    const ids = squads.map((s) => s.id)
    if (!ids.length) { setAllMates(new Map()); return }
    const { data: ms, error: e2 } = await supabase.from('group_members').select('user_id, display_name').in('group_id', ids).order('joined_at')
    if (e2 || !Array.isArray(ms)) return
    const m = new Map<string, string>()
    for (const r of ms as { user_id: string; display_name: string }[]) if (!m.has(r.user_id)) m.set(r.user_id, r.display_name)
    setAllMates(m)
  }, [userId])

  useEffect(() => {
    void loadList()
    // Joining, leaving or a new squad: my own membership rows change.
    const ch = supabase.channel(uniqueTopic('my-squads'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${userId}` }, () => void loadList())
      .subscribe()
    window.addEventListener('focus', loadList)
    return () => { void supabase.removeChannel(ch); window.removeEventListener('focus', loadList) }
  }, [loadList, userId])

  const active = list.squads.find((s) => s.id === activeId) ?? list.squads[0]
  const activeGroup = active?.id

  // Members of the active squad only. A switch starts a fresh load; a late answer for the old squad is dropped.
  useEffect(() => {
    if (!activeGroup) return
    let live = true
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      clearTimeout(timer)
      const { data, error } = await supabase.from('group_members').select('*').eq('group_id', activeGroup).order('joined_at')
      if (!live) return
      if (!error && Array.isArray(data)) { tries = 0; setMem({ groupId: activeGroup, list: data as Member[] }); return }
      // Keep the last good members (never another squad's under this one), say it failed, try again soon.
      setMem((m) => ({ ...m, errorFor: activeGroup }))
      if (tries < 3) timer = setTimeout(() => void load(), 2000 * 2 ** tries++)
    }
    void load()
    const ch = supabase.channel(uniqueTopic(`squad-members:${activeGroup}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${activeGroup}` }, () => void load())
      .subscribe()
    window.addEventListener('focus', load)
    window.addEventListener('online', load)
    return () => {
      live = false; clearTimeout(timer); void supabase.removeChannel(ch)
      window.removeEventListener('focus', load); window.removeEventListener('online', load)
    }
  }, [activeGroup, membersTick])

  const setActive = useCallback((groupId: string) => { setActiveId(groupId); writeActive(userId, groupId) }, [userId])
  const refresh = useCallback(async () => { setMembersTick((n) => n + 1); await loadList() }, [loadList])

  const value = useMemo<SquadsState>(() => ({
    userId, loading: list.loading, squads: list.squads, active,
    members: mem.groupId && mem.groupId === activeGroup ? mem.list : [],
    membersFor: mem.groupId === activeGroup ? activeGroup : undefined,
    membersErrorFor: mem.errorFor, allMates,
    setActive, refresh,
  }), [userId, list, active, activeGroup, mem, allMates, setActive, refresh])

  return <SquadsContext.Provider value={value}>{children}</SquadsContext.Provider>
}


