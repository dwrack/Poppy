import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AddItem } from './components/AddItem'
import { Closet } from './components/Closet'
import { Friends } from './components/Friends'
import { takeInviteFromUrl } from './lib/friends'
import { Runway } from './components/Runway'
import { You } from './components/You'
import { useAccountDb } from './lib/account'
import { SignIn, useSession } from './lib/auth'
import { SquadsProvider } from './lib/SquadsProvider'
import { syncNow } from './lib/sync'

type Tab = 'runway' | 'closet' | 'friends' | 'you'

export default function App() {
  const session = useSession()
  const userId = session?.user.id
  // This account's own closet database; another account on this phone never shares it.
  const ready = useAccountDb(userId)

  if (session === undefined) return null
  if (!session) return <SignIn />
  if (!ready) return null
  // Keyed by account: switching accounts starts every screen (and the squad list) from scratch, nothing carries over.
  return (
    <SquadsProvider key={session.user.id} userId={session.user.id}>
      <Home session={session} />
    </SquadsProvider>
  )
}

function Home({ session }: { session: Session }) {
  // An invite link opened while signed in: go straight to the Squad tab with the code in the join form.
  const [invite, setInvite] = useState(() => takeInviteFromUrl())
  const [tab, setTab] = useState<Tab>(() => (invite ? 'friends' : 'closet'))
  const inviteUsed = useCallback(() => setInvite(null), [])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    void syncNow()
    const onFocus = () => void syncNow()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  if (adding) return <AddItem onDone={() => setAdding(false)} />

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        {tab === 'closet' && <Closet onAdd={() => setAdding(true)} />}
        {tab === 'runway' && <Runway userId={session.user.id} onAdd={() => setAdding(true)} onGoSquad={() => setTab('friends')} />}
        {tab === 'friends' && <Friends userId={session.user.id} invite={invite} onInviteUsed={inviteUsed} />}
        {tab === 'you' && <You email={session.user.email} userId={session.user.id} />}
      </div>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-black/5 bg-cream/95 pt-2 backdrop-blur">
        <TabButton on={tab === 'runway'} onClick={() => setTab('runway')} emoji="🏆" label="Runway" />
        <TabButton on={tab === 'closet'} onClick={() => setTab('closet')} emoji="🧥" label="Closet" />
        <TabButton on={tab === 'friends'} onClick={() => setTab('friends')} emoji="👯" label="Squad" />
        <TabButton on={tab === 'you'} onClick={() => setTab('you')} emoji="🪞" label="You" />
      </nav>
    </div>
  )
}

function TabButton({ on, onClick, emoji, label }: { on: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button onClick={onClick} className={'flex flex-col items-center gap-0.5 px-3 pb-1 text-xs font-bold ' + (on ? 'text-poppy' : 'text-mute')}>
      <span className={'text-2xl transition ' + (on ? 'scale-110' : 'grayscale')}>{emoji}</span>
      {label}
    </button>
  )
}
