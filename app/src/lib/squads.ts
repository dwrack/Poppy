import { createContext, useContext } from 'react'
import type { Group, Member } from './friends'

/** A squad I am in, with my own card in it (the name and icon I go by there). */
export interface Squad extends Group {
  my_name: string; my_emoji: string; role: 'owner' | 'member'; joined_at: string
}

export interface SquadsState {
  userId: string
  /** true until the first list of squads is in */
  loading: boolean
  /** every squad I am in, oldest first */
  squads: Squad[]
  /** the one the Squad, Runway and You tabs are showing: the one picked last on this phone, else the first */
  active?: Squad
  /** members of the active squad; empty until they are in (see membersFor) */
  members: Member[]
  membersFor?: string
  setActive: (groupId: string) => void
  refresh: () => Promise<void>
}

export const SquadsContext = createContext<SquadsState | null>(null)

/* The active squad is remembered per account on this phone, so Penny's pick never becomes Poppy's. */
const activeKey = (userId: string) => `poppyseed:active-squad:${userId}`
export function readActive(userId: string): string | null {
  try { return localStorage.getItem(activeKey(userId)) } catch { return null }
}
export function writeActive(userId: string, groupId: string) {
  try { localStorage.setItem(activeKey(userId), groupId) } catch { /* private mode or storage off: it just won't be remembered */ }
}

const NONE: SquadsState = { userId: '', loading: true, squads: [], members: [], setActive: () => {}, refresh: async () => {} }

/** Every squad this account is in, the active one, and a way to switch. */
export function useSquads(userId: string): SquadsState {
  const s = useContext(SquadsContext)
  if (!s) throw new Error('useSquads needs <SquadsProvider> (lib/SquadsProvider.tsx, mounted in App.tsx)')
  // Never hand one account's squads to another.
  return s.userId === userId ? s : NONE
}

/**
 * The active squad and its members (falls back to the first squad). `loading`
 * stays true until the members of exactly this squad are in, so nothing ever
 * renders one squad with another squad's people.
 */
export function useSquad(userId: string) {
  const s = useSquads(userId)
  const group = s.active
  return {
    loading: s.loading || (!!group && s.membersFor !== group.id),
    group,
    members: group && s.membersFor === group.id ? s.members : [],
    refresh: s.refresh,
  }
}
