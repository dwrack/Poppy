import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  APP_URL, askToBorrow, createSquad, describeItems, joinSquad, loadFriendCloset, makeInvite, setBorrowStatus,
  useBorrows, useSquad, type Borrow, type FriendItem, type Member,
} from '../lib/friends'
import { CATEGORY_LABEL } from '../types'

const EMOJIS = ['🌸', '🦋', '🍓', '🌈', '⭐', '🐱', '🍒', '🌻', '🫧', '🎀', '🐰', '🌙']

export function Friends({ userId }: { userId: string }) {
  const squad = useSquad(userId)
  const [viewing, setViewing] = useState<Member>()

  if (squad.loading) return <div className="p-8 text-center text-mute">Loading…</div>
  if (!squad.group) return <SquadSetup onDone={squad.refresh} />
  if (viewing) return <FriendCloset member={viewing} isMe={viewing.user_id === userId} onBack={() => setViewing(undefined)} />

  return (
    <div className="safe-top flex min-h-full flex-col px-4 pt-3 pb-28">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{squad.group.name}</h1>
          <p className="text-sm text-mute">{squad.members.length} {squad.members.length === 1 ? 'member' : 'members'} · invite only</p>
        </div>
        <InviteButton groupId={squad.group.id} />
      </div>

      <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {squad.members.map((m) => (
          <button key={m.user_id} onClick={() => setViewing(m)} className="flex w-20 shrink-0 flex-col items-center gap-1 active:scale-95">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm ring-2 ring-peach/60">{m.emoji}</span>
            <span className="w-full truncate text-center text-xs font-bold">{m.user_id === userId ? 'You' : m.display_name}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-mute">Tap a friend to browse their closet.</p>

      <BorrowBoard userId={userId} members={squad.members} />
    </div>
  )
}

/* ---------- Start or join a squad ---------- */

function SquadSetup({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'start' | 'join'>('start')
  const [squadName, setSquadName] = useState('')
  const [myName, setMyName] = useState('')
  const [code, setCode] = useState('')
  const [emoji, setEmoji] = useState('🌸')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  async function go(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(undefined)
    try {
      if (mode === 'start') await createSquad(squadName.trim(), myName.trim(), emoji)
      else await joinSquad(code, myName.trim(), emoji)
      onDone()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="safe-top flex min-h-full flex-col items-center px-6 pt-10 pb-28 text-center">
      <div className="text-6xl">👯</div>
      <h1 className="mt-3 text-2xl font-extrabold">Your squad</h1>
      <p className="mt-1 max-w-xs text-mute">A private group for you and your friends. Swap closets, borrow pieces, and play style challenges.</p>

      <div className="mt-6 flex rounded-full bg-white p-1 ring-1 ring-black/10">
        {(['start', 'join'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={'rounded-full px-5 py-2 text-sm font-bold ' + (mode === m ? 'bg-poppy text-white' : 'text-mute')}>
            {m === 'start' ? 'Start a squad' : 'Join with a code'}
          </button>
        ))}
      </div>

      <form onSubmit={go} className="mt-5 w-full max-w-xs space-y-3 text-left">
        {mode === 'start' ? (
          <Field label="Squad name"><input required value={squadName} onChange={(e) => setSquadName(e.target.value)} placeholder="The Fit Check Club" className={inputCls} /></Field>
        ) : (
          <Field label="Invite code"><input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" className={inputCls + ' text-center font-mono tracking-[0.3em]'} /></Field>
        )}
        <Field label="Your name in the squad"><input required value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Poppy" className={inputCls} /></Field>
        <Field label="Pick your icon">
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((x) => (
              <button type="button" key={x} onClick={() => setEmoji(x)} className={'flex h-11 w-11 items-center justify-center rounded-full text-2xl ' + (emoji === x ? 'bg-peach/30 ring-2 ring-poppy' : 'bg-white ring-1 ring-black/10')}>{x}</button>
            ))}
          </div>
        </Field>
        <button disabled={busy} className="w-full rounded-full bg-poppy py-3 font-bold text-white shadow-lg shadow-poppy/40 disabled:opacity-50">
          {busy ? '…' : mode === 'start' ? 'Create squad' : 'Join squad'}
        </button>
        {err && <p className="text-center text-sm text-poppy">{err}</p>}
      </form>
    </div>
  )
}

/* ---------- Invite ---------- */

function InviteButton({ groupId }: { groupId: string }) {
  const [code, setCode] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const link = code ? `${APP_URL}?invite=${code}` : ''

  async function create() {
    setBusy(true); setErr(undefined)
    try { setCode(await makeInvite(groupId)) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  async function share() {
    const text = `Join my Poppyseed squad! Your invite code is ${code}.`
    if (navigator.share) { try { await navigator.share({ title: 'Poppyseed invite', text, url: link }) } catch { /* cancelled */ } }
    else await navigator.clipboard?.writeText(`${text} ${link}`)
  }

  return (
    <>
      <button onClick={create} disabled={busy} className="rounded-full bg-poppy px-4 py-2 text-sm font-bold text-white shadow-md shadow-poppy/30 disabled:opacity-50">+ Invite</button>
      {(code || err) && (
        <Sheet onClose={() => { setCode(undefined); setErr(undefined) }}>
          {err ? <p className="text-center text-poppy">{err}</p> : (
            <div className="text-center">
              <p className="font-bold">Give this code to one friend</p>
              <div className="my-4 font-mono text-4xl font-extrabold tracking-[0.3em] text-poppy">{code}</div>
              <p className="text-sm text-mute">It works once and expires in 14 days. They open the app, tap "Got an invite code?", and type it in.</p>
              <button onClick={share} className="mt-4 w-full rounded-full bg-sage py-3 font-bold text-white">Share invite</button>
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}

/* ---------- A friend's closet ---------- */

function FriendCloset({ member, isMe, onBack }: { member: Member; isMe: boolean; onBack: () => void }) {
  const [items, setItems] = useState<FriendItem[]>()
  const [open, setOpen] = useState<FriendItem>()
  useEffect(() => { loadFriendCloset(member.user_id).then(setItems) }, [member.user_id])

  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-10 flex items-center gap-3 bg-cream/90 px-4 py-3 backdrop-blur">
        <button onClick={onBack} className="text-2xl text-mute">‹</button>
        <span className="text-3xl">{member.emoji}</span>
        <div>
          <h1 className="text-xl font-extrabold">{isMe ? 'Your closet' : `${member.display_name}'s closet`}</h1>
          <p className="text-xs text-mute">{items ? `${items.length} pieces` : 'Loading…'}</p>
        </div>
      </header>
      <main className="px-4 pb-28">
        {items && items.length === 0 && <p className="py-16 text-center text-mute">Nothing here yet.</p>}
        <div className="grid grid-cols-3 gap-3">
          {items?.map((i) => (
            <button key={i.id} onClick={() => setOpen(i)} className="text-left active:scale-[0.98]">
              <div className={'checker aspect-square overflow-hidden rounded-2xl ring-1 ring-black/10 ' + (i.status === 'laundry' ? 'opacity-50' : '')}>
                {i.cutoutUrl && <img src={i.cutoutUrl} alt={i.name} loading="lazy" className="h-full w-full object-contain p-1.5" />}
              </div>
              <div className="mt-1 truncate px-0.5 text-xs font-semibold">{i.name || CATEGORY_LABEL[i.category]}</div>
            </button>
          ))}
        </div>
      </main>
      {open && <FriendItemSheet item={open} owner={member} isMe={isMe} onClose={() => setOpen(undefined)} />}
    </div>
  )
}

function FriendItemSheet({ item, owner, isMe, onClose }: { item: FriendItem; owner: Member; isMe: boolean; onClose: () => void }) {
  const [asking, setAsking] = useState(false)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [err, setErr] = useState<string>()

  async function send() {
    setState('busy'); setErr(undefined)
    try { await askToBorrow(item, date || null, note.trim()); setState('sent') } catch (x) { setErr((x as Error).message); setState('idle') }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex gap-4">
        <div className="checker h-32 w-32 shrink-0 overflow-hidden rounded-2xl ring-1 ring-black/10">
          {item.cutoutUrl && <img src={item.cutoutUrl} alt="" className="h-full w-full object-contain p-1" />}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-extrabold">{item.name || CATEGORY_LABEL[item.category]}</h2>
          <p className="text-sm text-mute">{CATEGORY_LABEL[item.category]} · {item.colours.join(', ') || 'no colour'} · {item.pattern}</p>
          {item.status === 'laundry' && <p className="mt-1 text-sm font-semibold text-poppy">In the wash right now</p>}
          {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
        </div>
      </div>
      {!isMe && (state === 'sent' ? (
        <p className="mt-5 rounded-2xl bg-sage/15 p-3 text-center font-bold text-sage">Asked {owner.display_name}! You'll see their answer under Borrowing.</p>
      ) : asking ? (
        <div className="mt-5 space-y-3">
          <Field label="When do you need it?"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Message"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For the party on Saturday 💃" className={inputCls} /></Field>
          <button onClick={send} disabled={state === 'busy'} className="w-full rounded-full bg-poppy py-3 font-bold text-white disabled:opacity-50">Send request</button>
          {err && <p className="text-center text-sm text-poppy">{err}</p>}
        </div>
      ) : (
        <button onClick={() => setAsking(true)} className="mt-5 w-full rounded-full bg-poppy py-3 font-bold text-white shadow-lg shadow-poppy/30">🙋 Ask to borrow</button>
      ))}
    </Sheet>
  )
}

/* ---------- Borrowing board ---------- */

const STATUS_LABEL: Record<Borrow['status'], string> = {
  requested: 'Waiting', approved: 'Yes!', declined: 'Not this time', out: 'Borrowed', returned: 'Returned', cancelled: 'Cancelled',
}

function BorrowBoard({ userId, members }: { userId: string; members: Member[] }) {
  const { list } = useBorrows(userId)
  const [tab, setTab] = useState<'mine' | 'asked'>('mine')
  const [cards, setCards] = useState<Awaited<ReturnType<typeof describeItems>>>(new Map())
  const ids = useMemo(() => [...new Set(list.map((b) => b.item_id))].sort().join(','), [list])
  useEffect(() => { describeItems(ids ? ids.split(',') : []).then(setCards) }, [ids])

  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? 'A friend'
  const mine = list.filter((b) => b.owner_id === userId)
  const asked = list.filter((b) => b.borrower_id === userId)
  const shown = tab === 'mine' ? mine : asked
  const waiting = mine.filter((b) => b.status === 'requested').length

  return (
    <section className="mt-6">
      <h2 className="text-lg font-extrabold">Borrowing</h2>
      <div className="mt-2 flex gap-2">
        <Tab on={tab === 'mine'} onClick={() => setTab('mine')}>Your clothes{waiting ? ` · ${waiting} new` : ''}</Tab>
        <Tab on={tab === 'asked'} onClick={() => setTab('asked')}>You asked</Tab>
      </div>
      <div className="mt-3 space-y-2">
        {shown.length === 0 && <p className="rounded-2xl bg-white p-4 text-center text-sm text-mute ring-1 ring-black/5">{tab === 'mine' ? 'No one has asked to borrow anything yet.' : "Open a friend's closet and tap a piece to ask."}</p>}
        {shown.map((b) => {
          const c = cards.get(b.item_id)
          const other = tab === 'mine' ? nameOf(b.borrower_id) : nameOf(b.owner_id)
          return (
            <div key={b.id} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-black/5">
              <div className="checker h-16 w-16 shrink-0 overflow-hidden rounded-xl">{c?.url && <img src={c.url} alt="" className="h-full w-full object-contain p-1" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold">{c?.name || (c ? CATEGORY_LABEL[c.category as keyof typeof CATEGORY_LABEL] : 'A piece')}</span>
                  <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold">{STATUS_LABEL[b.status]}</span>
                </div>
                <p className="text-xs text-mute">{tab === 'mine' ? `${other} wants it` : `From ${other}`}{b.needed_on ? ` · for ${fmt(b.needed_on)}` : ''}</p>
                {b.note && <p className="mt-0.5 text-sm">“{b.note}”</p>}
                <BorrowActions b={b} owner={tab === 'mine'} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function BorrowActions({ b, owner }: { b: Borrow; owner: boolean }) {
  const act = (s: Borrow['status']) => () => void setBorrowStatus(b.id, s)
  const btn = 'rounded-full px-3 py-1 text-xs font-bold'
  if (owner && b.status === 'requested') return <Row><button onClick={act('approved')} className={btn + ' bg-sage text-white'}>Say yes</button><button onClick={act('declined')} className={btn + ' bg-cream'}>Not this time</button></Row>
  if (owner && b.status === 'approved') return <Row><button onClick={act('out')} className={btn + ' bg-peach text-white'}>I handed it over</button></Row>
  if (owner && b.status === 'out') return <Row><button onClick={act('returned')} className={btn + ' bg-sage text-white'}>Got it back</button></Row>
  if (!owner && (b.status === 'requested' || b.status === 'approved')) return <Row><button onClick={act('cancelled')} className={btn + ' bg-cream'}>Cancel</button></Row>
  return null
}

/* ---------- small bits ---------- */

const inputCls = 'w-full rounded-2xl bg-white px-4 py-3 ring-1 ring-black/10 outline-none focus:ring-peach'
const fmt = (d: string) => new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-bold">{label}</span>{children}</label>
}
function Row({ children }: { children: ReactNode }) { return <div className="mt-2 flex gap-2">{children}</div> }
function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={'rounded-full px-3 py-1.5 text-sm font-bold ' + (on ? 'bg-ink text-white' : 'bg-white ring-1 ring-black/10')}>{children}</button>
}
function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-ink/40" onClick={onClose}>
      <div className="safe-bottom max-h-[90vh] w-full overflow-y-auto rounded-t-[2rem] bg-cream p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-black/15" />
        {children}
      </div>
    </div>
  )
}
