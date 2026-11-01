import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { db } from '../db'
import { useBorrowedPieces, useRoundBorrows, useStyledLooks, wearStyledLook, type StyledLook } from '../lib/borrowStyle'
import type { Borrow, Member } from '../lib/friends'
import { useSquad, type Squad } from '../lib/squads'
import {
  CHIPS, CHIP_LABEL, castVote, countdown, loadLookbook, loadMyEntry, loadMyVotes, loadResults, loadRunway,
  packFor, phaseEnds, rank, seededShuffle, setSquadTimeZone, startRoundNow, submitEntry, useActivePack, useRound, useSubmitted, SEASON_ROUNDS,
  type Chip, type EntryCard, type MyEntry, type PastRound, type Result, type Round, type Vote,
} from '../lib/game'
import { coversLook, ownPieces, queueEntryPhoto, useMyPhotoJobs, usePhotoAllowed, useStudio, type PhotoPiece } from '../lib/photos'
import { useObjectUrl } from '../lib/useObjectUrl'
import { CATEGORIES, CATEGORY_LABEL, type Category, type Item } from '../types'
import { AvatarStage } from './AvatarStage'
import { BorrowTab } from './BorrowTab'
import { Chip as ChipButton } from './Chip'
import { PhotoChip } from './PhotoChip'
import { SeasonPodium } from './SeasonPodium'
import { SeasonStrip } from './SeasonStrip'
import { SquadSwitcher } from './SquadSwitcher'
import { CardStack, LocalStack, type RemotePiece } from './Stack'
import { StyledLooks } from './StyledLooks'
import { ThemePick } from './ThemePick'
import { WoreIt } from './WoreIt'

export function Runway({ userId, onAdd, onGoSquad }: { userId: string; onAdd: () => void; onGoSquad: () => void }) {
  const squad = useSquad(userId)
  if (squad.loading) return <div className="p-8 text-center text-mute">Loading…</div>
  if (!squad.group) return <NoSquad onGoSquad={onGoSquad} />
  // Keyed by squad: switching squads starts the whole runway fresh (round, looks, votes, borrows, styled looks).
  return <SquadRunway key={squad.group.id} userId={userId} group={squad.group} members={squad.members} onAdd={onAdd} />
}

function SquadRunway({ userId, group, members, onAdd }: { userId: string; group: Squad; members: Member[]; onAdd: () => void }) {
  const { loading, current, last, now, refresh } = useRound(group.id)
  const isOwner = group.owner_id === userId
  const todayPack = useActivePack()
  const pack = packFor(current, last, todayPack)

  // The owner's phone decides what "Friday 5pm" means for the squad, once.
  useEffect(() => { if (isOwner && !group.tz) void setSquadTimeZone(group.id) }, [group.id, group.tz, isOwner])

  return (
    <div className="safe-top flex min-h-full flex-col px-4 pt-3 pb-28" style={{ '--pack-lobby': pack.lobby_colour, '--pack-confetti': pack.confetti_colour } as CSSProperties}>
      <SquadSwitcher userId={userId} />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Runway</h1>
          <p className="text-sm text-mute">{group.name} · one round a week{pack.name !== 'Everyday' && ` · ${pack.name} pack`}</p>
        </div>
      </div>
      {current && <SeasonStrip round={current.status === 'upcoming' && last ? last : current} packName={pack.name} />}

      {loading ? (
        <p className="py-10 text-center text-mute">Checking the clock…</p>
      ) : !current ? (
        <p className="py-10 text-center text-mute">Setting up your first round…</p>
      ) : current.status === 'upcoming' ? (
        <>
          <Upcoming round={current} now={now} isOwner={isOwner} groupId={group.id} onStarted={refresh} />
          <ThemePick round={current} groupId={group.id} userId={userId} onChanged={refresh} />
          {last?.round_no === SEASON_ROUNDS && last.season_no && <SeasonPodium groupId={group.id} seasonNo={last.season_no} userId={userId} />}
          {last && <LastRound round={last} userId={userId} now={now} />}
        </>
      ) : current.status === 'open' ? (
        <OpenRound round={current} userId={userId} members={members} now={now} onAdd={onAdd} />
      ) : (
        <Show round={current} userId={userId} now={now} />
      )}

      <Lookbook groupId={group.id} userId={userId} skipId={last?.id} refreshKey={current?.id} />
    </div>
  )
}

/* ---------- Round card ---------- */

const PHASE_LABEL: Record<Round['status'], string> = {
  upcoming: 'Next theme drops in', open: 'Dressing room closes in', reveal: 'Runway is on · voting closes in',
  voting: 'Voting closes in', done: 'Done',
}

function RoundCard({ round, now, children }: { round: Round; now: number; children?: ReactNode }) {
  const left = (round.status === 'reveal' ? Date.parse(round.voting_ends_at) : phaseEnds(round)) - now
  return (
    <section className="mt-4 rounded-blob p-5 text-white shadow-lg" style={{ background: 'var(--pack-lobby)' }}>
      <div className="text-xs font-bold tracking-wide text-white/60 uppercase">{round.status === 'upcoming' ? 'This week' : 'The theme'}</div>
      <h2 className="mt-1 text-2xl leading-tight font-extrabold">{round.theme ?? 'Shh, it’s a secret until it drops'}</h2>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-white/70">{PHASE_LABEL[round.status]}</span>
        <span className="rounded-full bg-butter px-3 py-1 font-extrabold text-ink tabular-nums">{countdown(left)}</span>
      </div>
      {children}
    </section>
  )
}

function Upcoming({ round, now, isOwner, groupId, onStarted }: { round: Round; now: number; isOwner: boolean; groupId: string; onStarted: () => void }) {
  const picked = !!round.theme_pick_id
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  async function start() {
    setBusy(true); setErr(undefined)
    try { await startRoundNow(groupId); onStarted() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  const when = new Date(round.opens_at).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  return (
    <RoundCard round={round} now={now}>
      <p className="mt-3 text-sm text-white/70">Drops {when}. You get 24 hours to build a look from your closet, then the runway plays and everyone votes.{picked ? ' Last round’s winner picked this one.' : ''}</p>
      {isOwner && (
        <>
          <button onClick={start} disabled={busy} className="mt-4 w-full rounded-full bg-poppy py-3 font-bold text-white disabled:opacity-50">
            {busy ? '…' : '🎬 Start a round now'}
          </button>
          <p className="mt-1.5 text-center text-xs text-white/50">Only you see this. Good for trying it out tonight.</p>
          {err && <p className="mt-1 text-center text-sm text-butter">{err}</p>}
        </>
      )}
    </RoundCard>
  )
}

/* ---------- Open round: dressing room, then waiting ---------- */

function OpenRound({ round, userId, members, now, onAdd }: { round: Round; userId: string; members: Member[]; now: number; onAdd: () => void }) {
  const [entry, setEntry] = useState<MyEntry | null>()
  const [editing, setEditing] = useState(false)
  // Who's in arrives over Realtime (private broadcast + entries changes), with a slow poll as the fallback.
  const { submitted, live, refresh: refreshSubmitted } = useSubmitted(round.id)
  const { list: borrows, loaded: borrowsLoaded } = useRoundBorrows(round.id)
  const asked = borrows.filter((b) => b.borrower_id === userId)
  const { pieces: borrowed, loading: borrowsLoading } = useBorrowedPieces(asked, members, borrowsLoaded)
  const { looks, refresh: refreshLooks } = useStyledLooks(round.id)
  const forMe = looks.filter((l) => l.to_user === userId)
  const sent = looks.filter((l) => l.from_user === userId)

  const load = useCallback(async () => {
    const [e] = await Promise.all([loadMyEntry(round.id, userId), refreshSubmitted()])
    setEntry(e)
  }, [round.id, userId, refreshSubmitted])

  useEffect(() => {
    void load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  if (entry === undefined) return <RoundCard round={round} now={now} />

  const wear = async (look: StyledLook) => {
    await wearStyledLook(round.id, userId, look); setEditing(false)
    const e = await loadMyEntry(round.id, userId)
    // the studio renders the styled look too; fire and forget, like every runway photo
    if (e) void closetPieces(e.outfit.items).then((pieces) => queueEntryPhoto(e.id, pieces, e.outfit.borrowed), () => {})
    await Promise.all([load(), refreshLooks()])
  }
  const wornId = entry?.styled_look_id ?? null

  if (!entry || editing) {
    return (
      <>
        <RoundCard round={round} now={now} />
        <StyledLooks looks={forMe} wornId={wornId} onWear={wear} />
        <DressingRoom
          round={round} userId={userId} members={members} asked={asked} borrowed={borrowed} borrowsLoading={borrowsLoading} sent={sent}
          initial={entry?.outfit.items ?? []}
          onAdd={onAdd}
          onCancel={entry ? () => setEditing(false) : undefined}
          onSent={refreshLooks}
          onSubmit={async (pieces, b) => {
            const id = await submitEntry(round.id, userId, pieces.map((p) => p.id), b)
            if (id) queueEntryPhoto(id, pieces, b) // photo-real render of her own pieces for the reveal; the avatar covers it if it never comes
            setEditing(false); await load()
          }}
        />
      </>
    )
  }

  const styledBy = wornId ? forMe.find((l) => l.id === wornId)?.from_name : undefined
  const lent = borrowed.filter((p) => entry.outfit.items.includes(p.id))
  return (
    <>
      <RoundCard round={round} now={now} />
      <section className="mt-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Your look is in ✓</h3>
          <button onClick={() => setEditing(true)} className="text-sm font-bold text-poppy">Change it</button>
        </div>
        <div className="mt-3 flex justify-center">
          <LocalStack ids={entry.outfit.items} remote={borrowed} className="h-72 w-56" />
        </div>
        {styledBy && <p className="mt-2 text-center text-xs font-bold text-poppy">✨ Styled by {styledBy}</p>}
        {lent.length > 0 && <p className="mt-1 text-center text-xs text-mute">Borrowed: {lent.map((p) => `${p.name} from ${p.owner}`).join(', ')}</p>}
        <EntryPhoto entryId={entry.id} look={ownPieces(entry.outfit.items, entry.outfit.borrowed)} />
        <p className="mt-3 text-center text-xs text-mute">Nobody sees it until the runway. No copying possible.</p>
      </section>
      <StyledLooks looks={forMe} wornId={wornId} onWear={wear} />
      <WhoIsIn members={members} submitted={submitted} userId={userId} live={live} />
    </>
  )
}

/** Her own pieces of a look with their categories, from her closet on this phone (a styled look is built from it). */
async function closetPieces(ids: string[]): Promise<PhotoPiece[]> {
  const items = await db.items.bulkGet(ids)
  return items.flatMap((it) => (it ? [{ id: it.id, category: it.category }] : []))
}

/** Nothing photo-real on the runway card unless a parent switched it on for her (photoreal_children). */
function EntryPhoto(props: { entryId: string; look: string[] }) {
  return usePhotoAllowed() ? <EntryPhotoChip {...props} /> : null
}

/**
 * Where the studio is with the photo of my runway look. Hidden until a job
 * exists. A photo of a look she has since changed never shows on the
 * runway (entry_photo_job), so the chip says "earlier look" instead.
 */
function EntryPhotoChip({ entryId, look }: { entryId: string; look: string[] }) {
  const { latest } = useMyPhotoJobs('entry', entryId)
  const { online } = useStudio()
  if (!latest) return null
  const note = !coversLook(latest, look) ? 'earlier look' : latest.status === 'done' ? 'shows on the runway' : undefined
  return <PhotoChip job={latest} online={online} className="mt-2 text-center" note={note} />
}

/** A small picture of a look: the photo-real render when there is one, else the cutout stack. */
function LookThumb({ card, className }: { card: EntryCard; className: string }) {
  if (card.photoUrl) return <img src={card.photoUrl} alt="" className={'rounded-xl object-cover ' + className} loading="lazy" data-testid="look-photo" />
  return <CardStack card={card} className={className} />
}

function WhoIsIn({ members, submitted, userId, live }: { members: Member[]; submitted: string[]; userId: string; live: boolean }) {
  const inSet = new Set(submitted)
  return (
    <section className="mt-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold">Who’s in</h3>
        <span className={'flex items-center gap-1 text-[11px] font-bold ' + (live ? 'text-sage' : 'text-mute')}>
          <span className={'h-1.5 w-1.5 rounded-full ' + (live ? 'bg-sage' : 'bg-mute')} />{live ? 'live' : 'checking every so often'}
        </span>
      </div>
      <p className="mb-3 text-xs text-mute">{submitted.length} of {members.length} looks in. Names only, looks stay secret.</p>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-xl">{m.emoji}</span>
            <span className="flex-1 font-semibold">{m.user_id === userId ? 'You' : m.display_name}</span>
            <span className={'rounded-full px-2.5 py-0.5 text-xs font-bold ' + (inSet.has(m.user_id) ? 'bg-sage/15 text-sage' : 'bg-cream text-mute')}>
              {inSet.has(m.user_id) ? 'Look in ✓' : 'Still dressing'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DressingRoom({ round, userId, members, asked, borrowed, borrowsLoading, sent, initial, onAdd, onCancel, onSent, onSubmit }: {
  round: Round; userId: string; members: Member[]; asked: Borrow[]; borrowed: RemotePiece[]; borrowsLoading: boolean; sent: StyledLook[]
  initial: string[]; onAdd: () => void; onCancel?: () => void; onSent: () => void; onSubmit: (pieces: PhotoPiece[], borrowed: string[]) => Promise<void>
}) {
  const items = useLiveQuery(() => db.items.where('status').equals('active').reverse().sortBy('createdAt'), []) ?? []
  const [picked, setPicked] = useState<string[]>(initial)
  const [pane, setPane] = useState<'closet' | 'borrow'>('closet')
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  // A piece added mid-round lands in the closet first, then shows up here, newest first.
  const visible = items.filter((i) => cat === 'all' || i.category === cat)
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 8 ? p : [...p, id]))
  const borrowedIds = new Set(borrowed.map((p) => p.id))
  // What is on the stack right now, in order, with who lent it.
  const worn = picked.flatMap((id) => {
    const mine = items.find((i) => i.id === id)
    if (mine) return [{ id, label: mine.name || CATEGORY_LABEL[mine.category], category: mine.category }]
    const b = borrowed.find((p) => p.id === id)
    return b ? [{ id, label: `${b.name} · from ${b.owner}`, category: b.category }] : []
  })

  async function send() {
    if (borrowsLoading) return // a saved look's borrowed pieces are not in `worn` yet; sending now would strip them
    setBusy(true); setErr(undefined)
    const pieces = worn.map(({ id, category }) => ({ id, category })) // drops anything that is no longer yours or no longer a yes (borrows are loaded by now)
    try { await onSubmit(pieces, pieces.filter((p) => borrowedIds.has(p.id)).map((p) => p.id)) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  return (
    <section className="mt-4">
      <div className="rounded-blob bg-white p-4 ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Dressing room</h3>
          <span className="text-xs font-bold text-mute">{picked.length}/8 pieces</span>
        </div>
        <div className="mt-3 flex justify-center">
          <LocalStack ids={picked} remote={borrowed} className="h-72 w-56" />
        </div>
        {worn.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {worn.map((w) => (
              <button key={w.id} onClick={() => toggle(w.id)} className={'rounded-full px-2.5 py-1 text-[11px] font-bold ' + (borrowedIds.has(w.id) ? 'bg-butter text-ink' : 'bg-cream text-ink/80')}>{w.label} ×</button>
            ))}
          </div>
        )}
        <p className="mt-2 text-center text-xs text-mute">Tap pieces below to put them on. Tap again to take off.</p>
      </div>

      <div className="mt-4 flex rounded-full bg-white p-1 ring-1 ring-black/10">
        {(['closet', 'borrow'] as const).map((p) => (
          <button key={p} onClick={() => setPane(p)} className={'flex-1 rounded-full py-2 text-sm font-bold ' + (pane === p ? 'bg-ink text-white' : 'text-mute')}>
            {p === 'closet' ? '🧥 My closet' : `🙋 Borrow${borrowed.length ? ` · ${borrowed.length}` : ''}`}
          </button>
        ))}
      </div>

      {pane === 'borrow' ? (
        <BorrowTab roundId={round.id} userId={userId} members={members} asked={asked} borrowed={borrowed} sent={sent} picked={picked} onToggle={toggle} onSent={onSent} />
      ) : (
        <>
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <ChipButton on={cat === 'all'} onClick={() => setCat('all')}>All</ChipButton>
            {CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => (
              <ChipButton key={c} on={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</ChipButton>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <button onClick={onAdd} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-poppy/50 bg-poppy/5 text-poppy active:scale-[0.98]">
              <span className="text-3xl">📸</span>
              <span className="text-xs font-bold">Add a piece</span>
            </button>
            {visible.map((i) => <PickTile key={i.id} item={i} n={picked.indexOf(i.id) + 1} onClick={() => toggle(i.id)} />)}
          </div>
          {items.length === 0 && <p className="mt-4 text-center text-sm text-mute">Your closet is empty. Add a few pieces and they’ll show up here.</p>}
        </>
      )}

      <div className="mt-5 flex gap-2">
        {onCancel && <button onClick={onCancel} className="flex-1 rounded-full py-3 font-bold text-mute">Keep my old look</button>}
        <button onClick={send} disabled={busy || borrowsLoading || worn.length === 0} className="flex-1 rounded-full bg-poppy py-3 font-bold text-white shadow-lg shadow-poppy/40 disabled:opacity-40">
          {busy || borrowsLoading ? '…' : '🚶 Send it down the runway'}
        </button>
      </div>
      {err && <p className="mt-2 text-center text-sm text-poppy">{err}</p>}
    </section>
  )
}

function PickTile({ item, n, onClick }: { item: Item; n: number; onClick: () => void }) {
  const url = useObjectUrl(item.cutout)
  const on = n > 0
  return (
    <button onClick={onClick} className="relative text-left active:scale-[0.98]">
      <div className={'checker aspect-square overflow-hidden rounded-2xl ' + (on ? 'ring-4 ring-poppy' : 'ring-1 ring-black/10')}>
        {url && <img src={url} alt={item.name} className="h-full w-full object-contain p-1.5" loading="lazy" />}
      </div>
      {on && <span className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-poppy text-xs font-extrabold text-white">{n}</span>}
      <div className="mt-1 truncate px-0.5 text-xs font-semibold">{item.name || CATEGORY_LABEL[item.category]}</div>
    </button>
  )
}

/* ---------- Reveal + voting ---------- */

function useShowData(round: Round) {
  const [cards, setCards] = useState<EntryCard[]>()
  const [votes, setVotes] = useState<Vote[]>([])
  const load = useCallback(async () => {
    const c = await loadRunway(round.id)
    setCards(c)
    setVotes(await loadMyVotes(c.map((x) => x.entry_id)))
  }, [round.id])
  useEffect(() => { void load() }, [load])
  return { cards, votes, reload: load }
}

function Show({ round, userId, now }: { round: Round; userId: string; now: number }) {
  const { cards, votes, reload } = useShowData(round)
  const order = useMemo(() => (cards ? seededShuffle(cards, round.id) : []), [cards, round.id])
  const [idx, setIdx] = useState(0)
  const [walking, setWalking] = useState(true)

  if (!cards) return <RoundCard round={round} now={now} />
  if (cards.length === 0) {
    return (
      <RoundCard round={round} now={now}>
        <p className="mt-3 text-sm text-white/70">Nobody got a look in this round. Next one drops Friday.</p>
      </RoundCard>
    )
  }

  const others = order.filter((c) => c.user_id !== userId)
  const voted = new Set(votes.map((v) => v.entry_id))
  const mineVoted = others.filter((c) => voted.has(c.entry_id)).length
  const card = order[idx]
  const myVote = votes.find((v) => v.entry_id === card.entry_id)

  return (
    <>
      <RoundCard round={round} now={now} />

      {walking ? (
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-mute">
            <span>Look {idx + 1} of {order.length}</span>
            <button onClick={() => setWalking(false)} className="text-poppy">Skip to the list ›</button>
          </div>
          <div className="rounded-blob bg-white p-4 ring-1 ring-black/5">
            {/* one canvas for the whole reveal: the stage stays, the girl, her clothes and the clock swap */}
            {/* the photo-real render is the picture when it is in; AvatarStage keeps her behind it (tap to flip) */}
            <AvatarStage card={card} mode="reveal" className="mx-auto h-80 w-full max-w-[300px]" fallback={<CardStack card={card} className="h-full w-full" />} />
            <div key={card.entry_id} className="flip-in">
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="text-2xl">{card.emoji}</span>
                <span className="text-lg font-extrabold">{card.user_id === userId ? 'You' : card.display_name}</span>
              </div>
              <Credits card={card} />
              {card.user_id === userId ? (
                <p className="mt-2 text-center text-sm text-mute">That’s you ✨ No voting for yourself.</p>
              ) : (
                <VoteBox key={card.entry_id} entryId={card.entry_id} existing={myVote} onVoted={reload} />
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="rounded-full bg-white px-4 py-3 font-bold ring-1 ring-black/10 disabled:opacity-30">‹</button>
            {idx + 1 < order.length ? (
              <button onClick={() => setIdx((i) => i + 1)} className="flex-1 rounded-full bg-ink py-3 font-bold text-white">Next look ›</button>
            ) : (
              <button onClick={() => setWalking(false)} className="flex-1 rounded-full bg-ink py-3 font-bold text-white">That’s everyone ✓</button>
            )}
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {order.map((c, i) => <span key={c.entry_id} className={'h-1.5 rounded-full transition-all ' + (i === idx ? 'w-5 bg-poppy' : 'w-1.5 bg-black/15')} />)}
          </div>
        </section>
      ) : (
        <section className="mt-4 space-y-2">
          {order.map((c, i) => (
            <button key={c.entry_id} onClick={() => { setIdx(i); setWalking(true) }} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-black/5 active:scale-[0.99]">
              <LookThumb card={c} className="h-20 w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{c.emoji} {c.user_id === userId ? 'You' : c.display_name}</div>
                <div className="text-xs text-mute">{c.pieces.length} {c.pieces.length === 1 ? 'piece' : 'pieces'}</div>
              </div>
              {c.user_id === userId ? <span className="text-xs font-bold text-mute">you</span>
                : voted.has(c.entry_id) ? <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-bold text-sage">Voted ✓</span>
                : <span className="rounded-full bg-poppy px-2.5 py-0.5 text-xs font-bold text-white">Vote</span>}
            </button>
          ))}
        </section>
      )}

      <p className="mt-4 rounded-2xl bg-butter/50 p-3 text-center text-xs font-semibold text-ink/70">
        {others.length === 0 ? 'Only your look this round. Results come when the clock runs out.'
          : `You’ve voted on ${mineVoted} of ${others.length}. Scores stay sealed until everyone’s voted, or ${new Date(round.voting_ends_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`}
      </p>
    </>
  )
}

/** Who styled it and who lent what, under a runway card. */
function Credits({ card }: { card: EntryCard }) {
  const lent = card.pieces.filter((p) => p.owner && p.owner_id !== card.user_id)
  if (!card.styled_by && lent.length === 0) return null
  return (
    <div className="mt-1 text-center text-xs">
      {card.styled_by && <div className="font-bold text-poppy">✨ styled by {card.styled_by}</div>}
      {lent.length > 0 && <div className="text-mute">borrowed from {[...new Set(lent.map((p) => p.owner))].join(' & ')}</div>}
    </div>
  )
}

function VoteBox({ entryId, existing, onVoted }: { entryId: string; existing?: Vote; onVoted: () => void }) {
  const [stars, setStars] = useState<number>(existing?.stars ?? 0)
  const [chip, setChip] = useState<Chip | undefined>(existing?.chip)
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>(existing ? 'saved' : 'idle')
  const [err, setErr] = useState<string>()

  async function pick(s: number, c?: Chip) {
    setStars(s); setChip(c); setErr(undefined)
    if (!s || !c) return
    setState('busy')
    try { await castVote(entryId, s, c); setState('saved'); onVoted() } catch (x) { setErr((x as Error).message); setState('idle') }
  }

  return (
    <div className="mt-4">
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => pick(n, chip)} className={'text-4xl transition active:scale-90 ' + (n <= stars ? '' : 'opacity-25 grayscale')} aria-label={`${n} stars`}>⭐</button>
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-mute">{stars ? ['', 'Hmm', 'Cute', 'Love it', 'Obsessed', 'Iconic'][stars] : 'Tap the stars'}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {CHIPS.map((c) => <ChipButton key={c} on={chip === c} onClick={() => pick(stars, c)}>{CHIP_LABEL[c]}</ChipButton>)}
      </div>
      <p className="mt-2 text-center text-xs font-semibold">
        {state === 'saved' ? <span className="text-sage">Vote in ✓ You can change it until voting closes.</span>
          : state === 'busy' ? <span className="text-mute">Saving…</span>
          : !stars ? <span className="text-mute">Stars first, then one compliment.</span>
          : !chip ? <span className="text-mute">Now pick one compliment.</span> : null}
      </p>
      {err && <p className="text-center text-sm text-poppy">{err}</p>}
    </div>
  )
}

/* ---------- Podium ---------- */

function LastRound({ round, userId, now }: { round: Round; userId: string; now: number }) {
  const [data, setData] = useState<{ cards: EntryCard[]; results: Result[] }>()
  const [woreKey, setWoreKey] = useState(0)
  useEffect(() => { Promise.all([loadRunway(round.id), loadResults(round.id)]).then(([cards, results]) => setData({ cards, results })) }, [round.id])
  if (!data || data.cards.length === 0) return null
  const entered = data.cards.some((c) => c.user_id === userId)
  return (
    <Podium round={round} cards={data.cards} results={data.results} userId={userId} confetti title="Last round">
      <WoreIt key={woreKey} round={round} userId={userId} entered={entered} now={now} onDone={() => setWoreKey((k) => k + 1)} />
    </Podium>
  )
}

const PLACE_EMOJI = ['', '🥇', '🥈', '🥉']

function Podium({ round, cards, results, userId, confetti, title, children }: { round: Round; cards: EntryCard[]; results: Result[]; userId: string; confetti?: boolean; title: string; children?: ReactNode }) {
  const ranked = rank(cards, results)
  const top = ranked.filter((r) => r.place <= 3)
  const iWon = top.some((r) => r.place === 1 && r.card.user_id === userId)
  // Podium order: 2nd, 1st, 3rd; ties share a block.
  const blocks = [2, 1, 3].map((p) => ({ place: p, rows: top.filter((r) => r.place === p) })).filter((b) => b.rows.length)
  const heights: Record<number, string> = { 1: 'h-24', 2: 'h-16', 3: 'h-12' }
  // One body on screen (iPhone rule), so the podium shows one girl at a time: the winner first, tap a block for the others.
  const [picked, setPicked] = useState<string>()
  const shown = top.find((r) => r.card.entry_id === picked) ?? top[0]

  return (
    <section className="relative mt-4 overflow-hidden rounded-blob bg-white p-4 ring-1 ring-black/5">
      {confetti && <Confetti />}
      <div className="text-xs font-bold tracking-wide text-mute uppercase">{title}</div>
      <h3 className="text-lg font-extrabold">{round.theme}</h3>
      {iWon && <p className="mt-1 inline-block rounded-full bg-butter px-3 py-1 text-sm font-extrabold">🏆 You won this round!</p>}

      {shown && (
        <AvatarStage card={shown.card} mode="podium" podium={Math.min(3, shown.place) as 1 | 2 | 3} className="mx-auto mt-3 h-64 w-full max-w-[300px]" fallback={<CardStack card={shown.card} className="h-full w-full" />} />
      )}

      <div className="mt-3 flex items-end justify-center gap-3">
        {blocks.map((b) => (
          <div key={b.place} className="flex flex-1 flex-col items-center">
            <div className="flex -space-x-6">
              {b.rows.map((r) => (
                <button key={r.card.entry_id} onClick={() => setPicked(r.card.entry_id)} className={'rounded-blob active:scale-95 ' + (shown?.card.entry_id === r.card.entry_id ? 'ring-[3px] ring-poppy' : '')} aria-label={`Show ${r.card.display_name} on the podium`}>
                  <LookThumb card={r.card} className="h-24 w-[72px]" />
                </button>
              ))}
            </div>
            <div className="mt-1 text-center text-xs font-bold">
              {b.rows.map((r) => (r.card.user_id === userId ? 'You' : r.card.display_name)).join(' & ')}
              {b.rows.some((r) => r.card.styled_by) && <div className="text-[10px] text-poppy">✨ styled by {b.rows.flatMap((r) => (r.card.styled_by ? [r.card.styled_by] : [])).join(' & ')}</div>}
              <div className="text-mute">{b.rows[0].result.total} ⭐</div>
            </div>
            <div className={'mt-1 flex w-full items-start justify-center rounded-t-xl pt-1 text-xl ' + heights[b.place] + ' ' + (b.place === 1 ? '' : 'bg-cream')} style={b.place === 1 ? { background: 'var(--pack-confetti)' } : undefined}>
              {PLACE_EMOJI[b.place]}{b.place === 1 && <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-extrabold text-white">WINNER</span>}
            </div>
          </div>
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {ranked.map((r) => (
          <li key={r.card.entry_id} className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
            <span className="w-6 font-extrabold text-mute">{r.place}</span>
            <span className="flex-1 truncate font-semibold">{r.card.emoji} {r.card.user_id === userId ? 'You' : r.card.display_name}{r.card.styled_by && <span className="text-xs font-bold text-poppy"> · styled by {r.card.styled_by}</span>}</span>
            <span className="flex flex-wrap justify-end gap-1">
              {(Object.entries(r.result.chips) as [Chip, number][]).map(([c, n]) => (
                <span key={c} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold ring-1 ring-black/5">{CHIP_LABEL[c]}{n > 1 ? ` ×${n}` : ''}</span>
              ))}
            </span>
            <span className="w-12 text-right font-extrabold">{r.result.total} ⭐</span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  )
}

const CONFETTI_COLOURS = ['var(--pack-confetti)', '#f4a261', '#ffe8b6', '#2a9d8f', '#f9c6d0', '#9b5de5', 'var(--pack-confetti)']

function Confetti() {
  const [on, setOn] = useState(true)
  useEffect(() => { const t = setTimeout(() => setOn(false), 7000); return () => clearTimeout(t) }, [])
  const bits = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    // Spread by a fixed scatter so it looks random without impure calls in render.
    left: (i * 37) % 100, delay: ((i * 13) % 25) / 10, dur: 3 + ((i * 7) % 25) / 10, colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length], rot: (i * 53) % 360,
  })), [])
  if (!on) return null
  return (
    <>
      {bits.map((b, i) => (
        <span key={i} className="confetti" style={{ left: `${b.left}%`, background: b.colour, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </>
  )
}

/* ---------- Lookbook ---------- */

function Lookbook({ groupId, userId, skipId, refreshKey }: { groupId: string; userId: string; skipId?: string; refreshKey?: string }) {
  const [past, setPast] = useState<PastRound[]>()
  useEffect(() => { loadLookbook(groupId).then(setPast) }, [groupId, refreshKey])
  const shown = (past ?? []).filter((p) => p.round.id !== skipId && p.cards.length > 0)
  if (!past || shown.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="text-lg font-extrabold">Lookbook</h2>
      <p className="mb-3 text-xs text-mute">Every round the squad has walked.</p>
      <div className="space-y-3">
        {shown.map(({ round, cards, results, woreIt }) => {
          const ranked = rank(cards, results)
          const wore = new Map(woreIt.map((w) => [w.user_id, w]))
          return (
            <div key={round.id} className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
              <div className="flex items-baseline justify-between">
                <span className="font-bold">{round.theme}</span>
                <span className="text-xs text-mute">{new Date(round.closes_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {ranked.map((r) => (
                  <div key={r.card.entry_id} className="w-20 shrink-0 text-center">
                    <div className="relative">
                      <LookThumb card={r.card} className="h-24 w-20" />
                      {r.place <= 3 && <span className="absolute -top-1 -left-1 text-lg">{PLACE_EMOJI[r.place]}</span>}
                      {wore.has(r.card.user_id) && <span className="absolute -right-1 -bottom-1 rounded-full bg-sage px-1.5 text-[10px] font-extrabold text-white" title="Wore it for real">👗</span>}
                    </div>
                    <div className="mt-1 truncate text-[11px] font-bold">{r.card.user_id === userId ? 'You' : r.card.display_name}</div>
                    <div className="text-[10px] text-mute">{r.result.total} ⭐</div>
                  </div>
                ))}
              </div>
              {woreIt.some((w) => w.photoUrl) && (
                <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                  {woreIt.filter((w) => w.photoUrl).map((w) => (
                    <figure key={w.user_id} className="w-20 shrink-0 text-center">
                      <img src={w.photoUrl} alt="" className="h-24 w-20 rounded-xl object-cover" loading="lazy" />
                      <figcaption className="mt-1 truncate text-[10px] font-bold text-mute">{w.emoji} {w.user_id === userId ? 'You' : w.display_name} wore it</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ---------- No squad yet ---------- */

function NoSquad({ onGoSquad }: { onGoSquad: () => void }) {
  return (
    <div className="safe-top flex min-h-full flex-col items-center justify-center gap-3 px-8 pb-28 text-center">
      <div className="text-6xl">🏆</div>
      <h1 className="text-2xl font-extrabold">Runway</h1>
      <p className="text-mute">A theme drops every Friday. You build a look from your real closet, nobody sees it until the runway, then everyone votes. You need a squad first.</p>
      <button onClick={onGoSquad} className="mt-2 rounded-full bg-poppy px-6 py-3 font-bold text-white shadow-lg shadow-poppy/40">Set up your squad</button>
    </div>
  )
}
