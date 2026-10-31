import { useEffect, useState } from 'react'
import { askToBorrowForRound, loadFriendRack, sendStyledLook, type StyledLook } from '../lib/borrowStyle'
import type { Borrow, FriendItem, Member } from '../lib/friends'
import { CHIPS, CHIP_LABEL, type Chip } from '../lib/game'
import { CATEGORY_LABEL } from '../types'
import { Chip as ChipButton } from './Chip'
import { Stack, type RemotePiece } from './Stack'

/**
 * The Borrow pane of the dressing room: browse a squad mate's closet, ask for
 * a piece for this round, put borrowed pieces on, or style her a whole look.
 */
export function BorrowTab({ roundId, userId, members, asked, borrowed, sent, picked, onToggle, onSent }: {
  roundId: string; userId: string; members: Member[]; asked: Borrow[]; borrowed: RemotePiece[]; sent: StyledLook[]
  picked: string[]; onToggle: (id: string) => void; onSent: () => void
}) {
  const friends = members.filter((m) => m.user_id !== userId)
  const [friend, setFriend] = useState<Member>()

  if (friends.length === 0) {
    return (
      <p className="mt-4 rounded-2xl bg-white p-4 text-center text-sm text-mute ring-1 ring-black/5">
        It’s just you in the squad so far. Invite a friend from the Squad tab and you can borrow from her closet for the round.
      </p>
    )
  }

  return (
    <div className="mt-3">
      {borrowed.length > 0 && (
        <section className="mb-4">
          <h4 className="text-sm font-extrabold">Borrowed for this round</h4>
          <p className="mb-2 text-xs text-mute">She said yes. Tap to put it on, and swap it at school tomorrow.</p>
          <div className="grid grid-cols-3 gap-3">
            {borrowed.map((p) => (
              <RemoteTile key={p.id} url={p.url} name={p.name} sub={`from ${p.owner}`} n={picked.indexOf(p.id) + 1} onClick={() => onToggle(p.id)} />
            ))}
          </div>
        </section>
      )}

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {friends.map((m) => (
          <button key={m.user_id} onClick={() => setFriend(friend?.user_id === m.user_id ? undefined : m)} className="flex w-20 shrink-0 flex-col items-center gap-1 active:scale-95">
            <span className={'flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm ' + (friend?.user_id === m.user_id ? 'ring-4 ring-poppy' : 'ring-2 ring-peach/60')}>{m.emoji}</span>
            <span className="w-full truncate text-center text-xs font-bold">{m.display_name}</span>
          </button>
        ))}
      </div>

      {friend ? (
        <FriendRack key={friend.user_id} roundId={roundId} friend={friend} asked={asked} sent={sent.filter((s) => s.to_user === friend.user_id)} picked={picked} onToggle={onToggle} onSent={onSent} />
      ) : (
        <p className="mt-1 text-xs text-mute">Tap a friend to browse her closet. Ask for a piece, and it shows up here when she says yes.</p>
      )}
    </div>
  )
}

/* ---------- One friend's closet: ask to borrow, or style her ---------- */

function FriendRack({ roundId, friend, asked, sent, picked, onToggle, onSent }: {
  roundId: string; friend: Member; asked: Borrow[]; sent: StyledLook[]; picked: string[]; onToggle: (id: string) => void; onSent: () => void
}) {
  const [items, setItems] = useState<FriendItem[]>()
  const [failed, setFailed] = useState(false)
  const [styling, setStyling] = useState(false)
  const [busyId, setBusyId] = useState<string>()
  const [err, setErr] = useState<string>()

  // Keyed by friend in BorrowTab, so a fresh mount handles each closet.
  useEffect(() => {
    let live = true
    loadFriendRack(friend.user_id).then((x) => { if (live) setItems(x) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [friend.user_id])

  async function ask(item: FriendItem) {
    setBusyId(item.id); setErr(undefined)
    try { await askToBorrowForRound(item, roundId) } catch (x) { setErr((x as Error).message) } finally { setBusyId(undefined) }
  }

  if (failed) return <p className="mt-4 rounded-2xl bg-white p-4 text-center text-sm text-mute ring-1 ring-black/5">Can’t reach {friend.display_name}’s closet right now. Check your connection and try again.</p>
  if (!items) return <p className="py-8 text-center text-sm text-mute">Opening {friend.display_name}’s closet…</p>
  if (items.length === 0) return <p className="mt-4 rounded-2xl bg-white p-4 text-center text-sm text-mute ring-1 ring-black/5">{friend.display_name} hasn’t added any pieces yet.</p>

  if (styling) return <StyleFriend roundId={roundId} friend={friend} items={items} onDone={() => { setStyling(false); onSent() }} onCancel={() => setStyling(false)} />

  const byItem = new Map(asked.filter((b) => b.owner_id === friend.user_id).map((b) => [b.item_id, b]))

  return (
    <section className="mt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-extrabold">{friend.display_name}’s closet</h4>
        <button onClick={() => setStyling(true)} className="rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white">✨ Style {friend.display_name}</button>
      </div>
      {sent.length > 0 && <p className="mt-1 text-xs font-semibold text-sage">You sent her {sent.length === 1 ? 'a look' : `${sent.length} looks`} this round ✓</p>}
      <p className="mt-1 mb-2 text-xs text-mute">Tap a piece to ask for it. If she says yes it goes on your stack.</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map((i) => {
          const b = byItem.get(i.id)
          const yes = b?.status === 'approved' || b?.status === 'out'
          const waiting = b?.status === 'requested'
          const no = b?.status === 'declined'
          const n = yes ? picked.indexOf(i.id) + 1 : 0
          return (
            <RemoteTile
              key={i.id} url={i.cutoutUrl} name={i.name || CATEGORY_LABEL[i.category]} n={n} dim={i.status === 'laundry'}
              badge={busyId === i.id ? '…' : yes ? 'Yes! ✓' : waiting ? 'Asked' : no ? 'Not this time' : undefined}
              badgeTone={yes ? 'sage' : waiting ? 'butter' : 'cream'}
              onClick={() => { if (yes) onToggle(i.id); else if (!b || b.status === 'cancelled') void ask(i) }}
            />
          )
        })}
      </div>
      {err && <p className="mt-2 text-center text-sm text-poppy">{err}</p>}
    </section>
  )
}

/* ---------- Build a look for her, from her closet, with one compliment ---------- */

function StyleFriend({ roundId, friend, items, onDone, onCancel }: { roundId: string; friend: Member; items: FriendItem[]; onDone: () => void; onCancel: () => void }) {
  const [pick, setPick] = useState<string[]>([])
  const [chip, setChip] = useState<Chip>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 8 ? p : [...p, id]))
  const byId = new Map(items.map((i) => [i.id, i]))
  const layers = pick.flatMap((id) => { const i = byId.get(id); return i ? [{ key: id, category: i.category, url: i.cutoutUrl }] : [] })

  async function send() {
    if (!chip || pick.length === 0) return
    setBusy(true); setErr(undefined)
    try { await sendStyledLook(roundId, friend.user_id, pick, chip); onDone() } catch (x) { setErr((x as Error).message); setBusy(false) }
  }

  return (
    <section className="mt-3">
      <div className="rounded-blob bg-white p-4 ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-extrabold">Style {friend.display_name}</h4>
          <span className="text-xs font-bold text-mute">{pick.length}/8 pieces</span>
        </div>
        <div className="mt-3 flex justify-center"><Stack layers={layers} className="h-72 w-56" /></div>
        <p className="mt-2 text-center text-xs text-mute">Her pieces, your eye. She can wear it as her look with one tap.</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {items.map((i) => (
          <RemoteTile key={i.id} url={i.cutoutUrl} name={i.name || CATEGORY_LABEL[i.category]} n={pick.indexOf(i.id) + 1} dim={i.status === 'laundry'} onClick={() => toggle(i.id)} />
        ))}
      </div>

      <p className="mt-4 text-center text-xs font-bold text-mute">Send it with one compliment</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {CHIPS.map((c) => <ChipButton key={c} on={chip === c} onClick={() => setChip(c)}>{CHIP_LABEL[c]}</ChipButton>)}
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-full py-3 font-bold text-mute">Never mind</button>
        <button onClick={send} disabled={busy || !chip || pick.length === 0} className="flex-1 rounded-full bg-poppy py-3 font-bold text-white shadow-lg shadow-poppy/40 disabled:opacity-40">
          {busy ? '…' : `✨ Send to ${friend.display_name}`}
        </button>
      </div>
      {err && <p className="mt-2 text-center text-sm text-poppy">{err}</p>}
    </section>
  )
}

/* ---------- A tile for a piece we only have by URL ---------- */

function RemoteTile({ url, name, sub, n, dim, badge, badgeTone = 'cream', onClick }: {
  url?: string; name: string; sub?: string; n: number; dim?: boolean; badge?: string; badgeTone?: 'sage' | 'butter' | 'cream'; onClick: () => void
}) {
  const on = n > 0
  const tone = { sage: 'bg-sage text-white', butter: 'bg-butter text-ink', cream: 'bg-cream text-mute' }[badgeTone]
  return (
    <button onClick={onClick} className="relative text-left active:scale-[0.98]">
      <div className={'checker aspect-square overflow-hidden rounded-2xl ' + (on ? 'ring-4 ring-poppy' : 'ring-1 ring-black/10') + (dim ? ' opacity-50' : '')}>
        {url && <img src={url} alt={name} className="h-full w-full object-contain p-1.5" loading="lazy" />}
      </div>
      {on && <span className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-poppy text-xs font-extrabold text-white">{n}</span>}
      {badge && !on && <span className={'absolute bottom-7 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ' + tone}>{badge}</span>}
      <div className="mt-1 truncate px-0.5 text-xs font-semibold">{name}</div>
      {sub && <div className="truncate px-0.5 text-[10px] text-mute">{sub}</div>}
    </button>
  )
}
