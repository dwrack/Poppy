import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>()

  async function go(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(undefined)
    const fn = mode === 'in'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password })
    const { data, error } = await fn
    setBusy(false)
    if (error) { setMsg(error.message); return }
    if (mode === 'up' && !data.session) setMsg('Check your email and tap the confirmation link, then sign in here.')
  }

  return (
    <div className="safe-top flex min-h-full flex-col items-center justify-center gap-6 px-8">
      <img src="/icons/icon.svg" alt="" className="h-24 w-24 rounded-3xl shadow-lg" />
      <div className="text-center">
        <h1 className="text-3xl font-extrabold">Poppyseed Clothes</h1>
        <p className="text-mute">{mode === 'in' ? 'Welcome back.' : 'Make your account.'}</p>
      </div>
      <form onSubmit={go} className="w-full max-w-xs space-y-3">
        <input type="email" required autoComplete="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-peach" />
        <input type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-peach" />
        <button disabled={busy} className="w-full rounded-full bg-poppy py-3 font-bold text-white shadow-lg shadow-poppy/40 disabled:opacity-50">
          {busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      {msg && <p className="max-w-xs text-center text-sm text-poppy">{msg}</p>}
      <button onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(undefined) }} className="text-sm font-semibold text-mute">
        {mode === 'in' ? 'First time? Create an account' : 'Already have one? Sign in'}
      </button>
    </div>
  )
}
