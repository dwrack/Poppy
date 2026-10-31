import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { db } from '../db'
import { useSquad, type Member } from '../lib/friends'
import {
  CHIPS, CHIP_LABEL, castVote, countdown, loadLookbook, loadMyEntry, loadMyVotes, loadResults, loadRunway, loadSubmitted,
  phaseEnds, rank, seededShuffle, setSquadTimeZone, startRoundNow, submitEntry, useActivePack, useRound, SEASON_ROUNDS,
  type Chip, type EntryCard, type PastRound, type Result, type Round, type Vote,
} from '../lib/game'
import { useObjectUrl } from '../lib/useObjectUrl'
import { CATEGORIES, CATEGORY_LABEL, type Category, type Item } from '../types'
import { Chip as ChipButton } from './Chip'
import { SeasonPodium } from './SeasonPodium'
import { SeasonStrip } from './SeasonStrip'

export function Runway({ userId, onAdd, onGoSquad }: { userId: string; onAdd: () => void; onGoSquad: () => void }) {
  const squad = useSquad(userId)
  const group = squad.group
  const { loading, current, last, now, refresh } = useRound(group?.id)
  const isOwner = group?.owner_id === userId
  const pack = useActivePack()

  // The owner's phone decides what "Friday 5pm" means for the squad, once.
  useEffect(() => { if (group && isOwner && !group.tz) void setSquadTimeZone(group.id) }, [group, isOwner])

  if (squad.loading) return <div className="p-8 text-center text-mute">Loading…</div>
  if (!group) return <NoSquad onGoSquad={onGoSquad} />

  return (
    <div className="safe-top flex min-h-full flex-col px-4 pt-3 pb-28" style={{ '--pack-lobby': pack.lobby_colour, '--pack-confetti': pack.confetti_colour } as CSSProperties}>
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
          {last?.round_no === SEASON_ROUNDS && last.season_no && <SeasonPodium groupId={group.id} seasonNo={last.season_no} userId={userId} />}
          {last && <LastRound round={last} userId={userId} />}
        </>
      ) : current.status === 'open' ? (
        <OpenRound round={current} userId={userId} members={squad.members} now={now} onAdd={onAdd} />
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
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  async function start() {
    setBusy(true); setErr(undefined)
    try { await startRoundNow(groupId); onStarted() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  const when = new Date(round.opens_at).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  return (
    <RoundCard round={round} now={now}>
      <p className="mt-3 text-sm text-white/70">Drops {when}. You get 24 hours to build a look from your closet, then the runway plays and everyone votes.</p>
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
  const [entry, setEntry] = useState<{ outfit: { items: string[] } } | null>()
  const [editing, setEditing] = useState(false)
  const [submitted, setSubmitted] = useState<string[]>([])

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([loadMyEntry(round.id, userId), loadSubmitted(round.id)])
    setEntry(e); setSubmitted(s)
  }, [round.id, userId])

  useEffect(() => {
    void load()
    const t = setInterval(() => void loadSubmitted(round.id).then(setSubmitted), 30_000)
    window.addEventListener('focus', load)
    return () => { clearInterval(t); window.removeEventListener('focus', load) }
  }, [load, round.id])

  if (entry === undefined) return <RoundCard round={round} now={now} />

  if (!entry || editing) {
    return (
      <>
        <RoundCard round={round} now={now} />
        <DressingRoom
          initial={entry?.outfit.items ?? []}
          onAdd={onAdd}
          onCancel={entry ? () => setEditing(false) : undefined}
          onSubmit={async (ids) => { await submitEntry(round.id, userId, ids); setEditing(false); await load() }}
        />
      </>
    )
  }

  return (
    <>
      <RoundCard round={round} now={now} />
      <section className="mt-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Your look is in ✓</h3>
          <button onClick={() => setEditing(true)} className="text-sm font-bold text-poppy">Change it</button>
        </div>
        <div className="mt-3 flex justify-center">
          <LocalStack ids={entry.outfit.items} className="h-72 w-56" />
        </div>
        <p className="mt-3 text-center text-xs text-mute">Nobody sees it until the runway. No copying possible.</p>
      </section>
      <WhoIsIn members={members} submitted={submitted} userId={userId} />
    </>
  )
}

function WhoIsIn({ members, submitted, userId }: { members: Member[]; submitted: string[]; userId: string }) {
  const inSet = new Set(submitted)
  return (
    <section className="mt-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
      <h3 className="text-lg font-extrabold">Who’s in</h3>
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

function DressingRoom({ initial, onAdd, onCancel, onSubmit }: { initial: string[]; onAdd: () => void; onCancel?: () => void; onSubmit: (ids: string[]) => Promise<void> }) {
  const items = useLiveQuery(() => db.items.where('status').equals('active').reverse().sortBy('createdAt'), []) ?? []
  const [picked, setPicked] = useState<string[]>(initial)
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  // A piece added mid-round lands in the closet first, then shows up here, newest first.
  const visible = items.filter((i) => cat === 'all' || i.category === cat)
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 8 ? p : [...p, id]))

  async function send() {
    setBusy(true); setErr(undefined)
    try { await onSubmit(picked) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  return (
    <section className="mt-4">
      <div className="rounded-blob bg-white p-4 ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Dressing room</h3>
          <span className="text-xs font-bold text-mute">{picked.length}/8 pieces</span>
        </div>
        <div className="mt-3 flex justify-center">
          <LocalStack ids={picked} className="h-72 w-56" />
        </div>
        <p className="mt-2 text-center text-xs text-mute">Tap pieces below to put them on. Tap again to take off.</p>
      </div>

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

      <div className="mt-5 flex gap-2">
        {onCancel && <button onClick={onCancel} className="flex-1 rounded-full py-3 font-bold text-mute">Keep my old look</button>}
        <button onClick={send} disabled={busy || picked.length === 0} className="flex-1 rounded-full bg-poppy py-3 font-bold text-white shadow-lg shadow-poppy/40 disabled:opacity-40">
          {busy ? '…' : '🚶‍♀️ Send it down the runway'}
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

/* ---------- The cutout stack (avatar stand-in for step 1) ---------- */

const POS: Record<Category, string> = {
  hat: 'top-0 left-1/2 -translate-x-1/2 h-[22%] w-[45%] z-20',
  scarf: 'top-[14%] left-1/2 -translate-x-1/2 h-[22%] w-[42%] z-30',
  outerwear: 'top-[16%] left-[56%] -translate-x-1/2 h-[46%] w-[72%] z-30',
  top: 'top-[18%] left-1/2 -translate-x-1/2 h-[38%] w-[62%] z-20',
  dress: 'top-[18%] left-1/2 -translate-x-1/2 h-[60%] w-[62%] z-20',
  bottom: 'top-[50%] left-1/2 -translate-x-1/2 h-[36%] w-[55%] z-10',
  shoes: 'bottom-0 left-1/2 -translate-x-1/2 h-[18%] w-[45%] z-20',
  bag: 'top-[46%] left-[1%] h-[26%] w-[30%] z-30',
  accessory: 'top-[6%] right-[2%] h-[16%] w-[22%] z-30',
}

type Layer = { key: string; category: Category; url?: string; blob?: Blob }

function Stack({ layers, className }: { layers: Layer[]; className: string }) {
  const seen: Partial<Record<Category, number>> = {}
  return (
    <div className={'relative overflow-hidden rounded-blob bg-gradient-to-b from-butter/40 to-peach/20 ring-1 ring-black/5 ' + className}>
      {layers.length === 0 && <div className="flex h-full flex-col items-center justify-center text-mute"><span className="text-5xl">🧍‍♀️</span><span className="mt-1 text-xs font-semibold">Nothing on yet</span></div>}
      {layers.map((l) => {
        const nth = seen[l.category] ?? 0
        seen[l.category] = nth + 1
        return <StackLayer key={l.key} layer={l} offset={nth} />
      })}
    </div>
  )
}

function StackLayer({ layer, offset }: { layer: Layer; offset: number }) {
  const local = useObjectUrl(layer.blob)
  const src = layer.url ?? local
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className={'pop absolute object-contain drop-shadow-md ' + POS[layer.category]}
      style={offset ? { transform: `translate(${-50 + offset * 14}%, ${offset * 6}%)` } : undefined}
    />
  )
}

/** Stack built from the local closet (my own look). */
function LocalStack({ ids, className }: { ids: string[]; className: string }) {
  const items = useLiveQuery(() => db.items.bulkGet(ids), [ids.join(',')]) ?? []
  const layers: Layer[] = items.flatMap((i) => (i ? [{ key: i.id, category: i.category, blob: i.cutout }] : []))
  return <Stack layers={layers} className={className} />
}

/** Stack built from a runway card (anyone's look, signed URLs). */
function CardStack({ card, className }: { card: EntryCard; className: string }) {
  return <Stack layers={card.pieces.map((p) => ({ key: p.id, category: p.category, url: p.url }))} className={className} />
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
          <div key={card.entry_id} className="flip-in rounded-blob bg-white p-4 ring-1 ring-black/5">
            <CardStack card={card} className="mx-auto h-80 w-60" />
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-2xl">{card.emoji}</span>
              <span className="text-lg font-extrabold">{card.user_id === userId ? 'You' : card.display_name}</span>
            </div>
            {card.user_id === userId ? (
              <p className="mt-2 text-center text-sm text-mute">That’s you ✨ No voting for yourself.</p>
            ) : (
              <VoteBox key={card.entry_id} entryId={card.entry_id} existing={myVote} onVoted={reload} />
            )}
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
              <CardStack card={c} className="h-20 w-16 shrink-0" />
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

function LastRound({ round, userId }: { round: Round; userId: string }) {
  const [data, setData] = useState<{ cards: EntryCard[]; results: Result[] }>()
  useEffect(() => { Promise.all([loadRunway(round.id), loadResults(round.id)]).then(([cards, results]) => setData({ cards, results })) }, [round.id])
  if (!data || data.cards.length === 0) return null
  return <Podium round={round} cards={data.cards} results={data.results} userId={userId} confetti title="Last round" />
}

const PLACE_EMOJI = ['', '🥇', '🥈', '🥉']

function Podium({ round, cards, results, userId, confetti, title }: { round: Round; cards: EntryCard[]; results: Result[]; userId: string; confetti?: boolean; title: string }) {
  const ranked = rank(cards, results)
  const top = ranked.filter((r) => r.place <= 3)
  const iWon = top.some((r) => r.place === 1 && r.card.user_id === userId)
  // Podium order: 2nd, 1st, 3rd; ties share a block.
  const blocks = [2, 1, 3].map((p) => ({ place: p, rows: top.filter((r) => r.place === p) })).filter((b) => b.rows.length)
  const heights: Record<number, string> = { 1: 'h-24', 2: 'h-16', 3: 'h-12' }

  return (
    <section className="relative mt-4 overflow-hidden rounded-blob bg-white p-4 ring-1 ring-black/5">
      {confetti && <Confetti />}
      <div className="text-xs font-bold tracking-wide text-mute uppercase">{title}</div>
      <h3 className="text-lg font-extrabold">{round.theme}</h3>
      {iWon && <p className="mt-1 inline-block rounded-full bg-butter px-3 py-1 text-sm font-extrabold">🏆 You won this round!</p>}

      <div className="mt-4 flex items-end justify-center gap-3">
        {blocks.map((b) => (
          <div key={b.place} className="flex flex-1 flex-col items-center">
            <div className="flex -space-x-6">
              {b.rows.map((r) => <CardStack key={r.card.entry_id} card={r.card} className="h-32 w-24" />)}
            </div>
            <div className="mt-1 text-center text-xs font-bold">
              {b.rows.map((r) => (r.card.user_id === userId ? 'You' : r.card.display_name)).join(' & ')}
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
            <span className="flex-1 truncate font-semibold">{r.card.emoji} {r.card.user_id === userId ? 'You' : r.card.display_name}</span>
            <span className="flex flex-wrap justify-end gap-1">
              {(Object.entries(r.result.chips) as [Chip, number][]).map(([c, n]) => (
                <span key={c} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold ring-1 ring-black/5">{CHIP_LABEL[c]}{n > 1 ? ` ×${n}` : ''}</span>
              ))}
            </span>
            <span className="w-12 text-right font-extrabold">{r.result.total} ⭐</span>
          </li>
        ))}
      </ul>
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
        {shown.map(({ round, cards, results }) => {
          const ranked = rank(cards, results)
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
                      <CardStack card={r.card} className="h-24 w-20" />
                      {r.place <= 3 && <span className="absolute -top-1 -left-1 text-lg">{PLACE_EMOJI[r.place]}</span>}
                    </div>
                    <div className="mt-1 truncate text-[11px] font-bold">{r.card.user_id === userId ? 'You' : r.card.display_name}</div>
                    <div className="text-[10px] text-mute">{r.result.total} ⭐</div>
                  </div>
                ))}
              </div>
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
