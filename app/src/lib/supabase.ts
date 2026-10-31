import { createClient } from '@supabase/supabase-js'

// The publishable key is designed to be shipped in the app. Row-level security
// in the database decides what it can see, which is only the signed-in user's rows.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://yrcddfehjjbtzwuotmym.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? 'sb_publishable_E7W8ncRhiA_J0o-78DaHHA_UlTe6XXO'

export const supabase = createClient(url, key)
export const BUCKET = 'closet'

let topics = 0
/**
 * A fresh Realtime topic for a postgres_changes feed. supabase.channel(name)
 * hands back an existing channel with the same name, so an effect that
 * re-runs (switching squads, say) could get the old, still-closing channel
 * and silently never subscribe. A unique name per subscription avoids that.
 */
export function uniqueTopic(base: string) {
  return `${base}:${++topics}`
}
