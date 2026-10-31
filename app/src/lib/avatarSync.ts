import { db } from '../db'
import { supabase } from './supabase'
import { DEFAULT_LOOK, type AvatarLook, type AvatarPresets } from '../types'

async function uid() {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

type Row = { user_id: string; face: string; skin: string; hair: string; hair_colour: string; eyes: string; updated_at: string }

const fromRow = (r: Row): AvatarLook => ({
  face: r.face as AvatarLook['face'], skin: r.skin as AvatarLook['skin'], hair: r.hair as AvatarLook['hair'],
  hairColour: r.hair_colour as AvatarLook['hairColour'], eyes: r.eyes as AvatarLook['eyes'],
})

/** Save locally first (instant), then push. Same shape as saveProfile. */
export async function saveAvatar(patch: Partial<AvatarLook>) {
  const cur = (await db.avatar.get('me')) ?? { id: 'me' as const, ...DEFAULT_LOOK, updatedAt: 0, synced: 0 as const }
  await db.avatar.put({ ...cur, ...patch, id: 'me', updatedAt: Date.now(), synced: 0 })
  void pushAvatar()
}

async function pushAvatar() {
  const userId = await uid()
  if (!userId) return
  const a = await db.avatar.get('me')
  if (!a || a.synced !== 0) return
  const { error } = await supabase.from('avatar_presets').upsert({
    user_id: userId, face: a.face, skin: a.skin, hair: a.hair, hair_colour: a.hairColour, eyes: a.eyes,
    updated_at: new Date(a.updatedAt).toISOString(),
  })
  if (!error) await db.avatar.update('me', { synced: 1 })
  else console.warn('avatar push failed', error)
}

async function pullAvatar() {
  const userId = await uid()
  if (!userId) return
  const { data: row } = await supabase.from('avatar_presets').select('*').eq('user_id', userId).maybeSingle()
  const local = await db.avatar.get('me')
  if (row && (!local || (local.synced === 1 && Date.parse(row.updated_at) > local.updatedAt))) {
    await db.avatar.put({ id: 'me', ...fromRow(row as Row), updatedAt: Date.parse(row.updated_at), synced: 1 })
  }
}

export async function syncAvatar() {
  await pushAvatar()
  await pullAvatar()
}

/** Squad mates' looks, keyed by user id, for the runway reveal (step 2). Missing rows get the default look. */
export async function loadLooks(userIds: string[]): Promise<Map<string, AvatarLook>> {
  const out = new Map<string, AvatarLook>()
  if (userIds.length === 0) return out
  const { data } = await supabase.from('avatar_presets').select('*').in('user_id', userIds)
  for (const r of (data ?? []) as Row[]) out.set(r.user_id, fromRow(r))
  for (const id of userIds) if (!out.has(id)) out.set(id, DEFAULT_LOOK)
  return out
}

export function presetsToLook(p?: AvatarPresets): AvatarLook {
  return p ? { face: p.face, skin: p.skin, hair: p.hair, hairColour: p.hairColour, eyes: p.eyes } : DEFAULT_LOOK
}
