import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { syncNow } from '../lib/sync'

export function You({ email }: { email?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  async function sync() {
    setState('busy')
    try { await syncNow() } finally { setState('done'); setTimeout(() => setState('idle'), 1500) }
  }
  return (
    <div className="safe-top flex min-h-full flex-col px-4 pt-3">
      <h1 className="text-2xl font-extrabold">You</h1>
      <p className="text-sm text-mute">{email}</p>
      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <div className="text-6xl">🪞</div>
        <p className="max-w-xs text-mute">Your photos, hairstyles, measurements and style notes will live here soon.</p>
      </div>
      <div className="mt-auto mb-28 space-y-2">
        <button onClick={sync} disabled={state === 'busy'} className="w-full rounded-2xl bg-white py-3 font-bold ring-1 ring-black/10 disabled:opacity-50">
          {state === 'busy' ? 'Syncing…' : state === 'done' ? 'Up to date ✓' : '☁️ Sync now'}
        </button>
        <button onClick={() => supabase.auth.signOut()} className="w-full rounded-2xl py-3 font-bold text-mute">Sign out</button>
      </div>
    </div>
  )
}
