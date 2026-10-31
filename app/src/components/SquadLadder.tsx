import { LADDER, ladderFor, useSquadLadder } from '../lib/game'
import { useSquad, useSquads, type Squad } from '../lib/squads'

/**
 * Everyone's stars side by side, with titles, wore-it streaks and where
 * the squad is in its season (12 rounds). Read-only; the ledger is the
 * truth and the server sums it. Shows the active squad (the one picked on
 * the Squad or Runway tab).
 */
export function SquadLadder({ userId }: { userId: string }) {
  const squad = useSquad(userId)
  const { squads } = useSquads(userId)

  if (squad.loading) return null
  if (!squad.group) {
    return (
      <section className="mb-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
        <div className="text-xs font-bold tracking-wide text-mute uppercase">Squad ladder</div>
        <p className="mt-1 text-sm text-mute">Once you have a squad, everyone’s stars show up here side by side.</p>
      </section>
    )
  }
  // Keyed by squad so one squad's rows never sit under another squad's name.
  return <Ladder key={squad.group.id} userId={userId} group={squad.group} many={squads.length > 1} />
}

function Ladder({ userId, group, many }: { userId: string; group: Squad; many: boolean }) {
  const { rows, season } = useSquadLadder(group.id)
  const top = rows?.[0]?.stars ?? 0
  const played = season?.rounds_done ?? 0
  const per = season?.rounds_per_season ?? 12
  const inSeason = season?.round_in_season ?? 0

  return (
    <section className="mb-4 rounded-blob bg-white p-4 ring-1 ring-black/5" data-testid="squad-ladder">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-bold tracking-wide text-mute uppercase">Squad ladder</div>
          <h3 className="text-lg font-extrabold">{group.name}</h3>
        </div>
        <div className="text-right">
          <div className="text-sm font-extrabold">Season {season?.season_no ?? 1}</div>
          <div className="text-xs text-mute">round {inSeason} of {per}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: per }, (_, i) => (
          <span key={i} className={'h-1.5 flex-1 rounded-full ' + (i < inSeason ? 'bg-poppy' : 'bg-black/10')} />
        ))}
      </div>

      {!rows ? (
        <p className="mt-4 text-center text-sm text-mute">Counting stars…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r, i) => {
            const lad = ladderFor(r.stars)
            const pct = top ? Math.max(6, Math.round((r.stars / top) * 100)) : 6
            const me = r.user_id === userId
            return (
              <li key={r.user_id} className={'rounded-2xl p-2.5 ' + (me ? 'bg-butter/40' : 'bg-cream')}>
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs font-extrabold text-mute">{i + 1}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{me ? 'You' : r.display_name} <span className="font-semibold text-mute">· {lad.title}</span></div>
                    <div className="text-[11px] text-mute">
                      {r.rounds_played} {r.rounds_played === 1 ? 'round' : 'rounds'}
                      {r.wore_count > 0 && ` · wore it ${r.wore_count}×`}
                      {r.streak > 1 && ` · 🔥 ${r.streak} streak`}
                    </div>
                  </div>
                  <span className="text-base font-extrabold tabular-nums">{r.stars} ⭐</span>
                </div>
                <div className="mt-1.5 ml-7 h-1.5 overflow-hidden rounded-full bg-black/5"><div className={'h-full rounded-full ' + (me ? 'bg-poppy' : 'bg-ink/60')} style={{ width: pct + '%' }} /></div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-mute">
        Titles: {LADDER.map((l) => `${l.title} ${l.at}`).join(' · ')}. Season {season?.season_no ?? 1} ends after round {per}{played ? ` (${played} played so far)` : ''}.
        {many && ' Stars here are from this squad only. Switch squads on the Squad or Runway tab.'}
      </p>
    </section>
  )
}
