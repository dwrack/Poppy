import { createClient } from '@supabase/supabase-js'

// The publishable key is designed to be shipped in the app. Row-level security
// in the database decides what it can see, which is only the signed-in user's rows.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://yrcddfehjjbtzwuotmym.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? 'sb_publishable_E7W8ncRhiA_J0o-78DaHHA_UlTe6XXO'

export const supabase = createClient(url, key)
export const BUCKET = 'closet'
