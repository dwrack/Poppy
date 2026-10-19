import { useEffect, useState } from 'react'
import { AddItem } from './components/AddItem'
import { Closet } from './components/Closet'
import { Friends } from './components/Friends'
import { Soon } from './components/Soon'
import { You } from './components/You'
import { SignIn, useSession } from './lib/auth'
import { syncNow } from './lib/sync'

type Tab = 'today' | 'closet' | 'friends' | 'you'

export default function App() {
  const session = useSession()
  const [tab, setTab] = useState<Tab>('closet')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!session) return
    void syncNow()
    const onFocus = () => void syncNow()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [session])

  if (session === undefined) return null
  if (!session) return <SignIn />
  if (adding) return <AddItem onDone={() => setAdding(false)} />

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        {tab === 'closet' && <Closet onAdd={() => setAdding(true)} />}
        {tab === 'today' && <Soon emoji="☀️" title="Today" blurb="Once your closet has a few pieces, this is where your morning outfit shows up." />}
        {tab === 'friends' && <Friends userId={session.user.id} />}
        {tab === 'you' && <You email={session.user.email} userId={session.user.id} />}
      </div>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-black/5 bg-cream/95 pt-2 backdrop-blur">
        <TabButton on={tab === 'today'} onClick={() => setTab('today')} emoji="☀️" label="Today" />
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
