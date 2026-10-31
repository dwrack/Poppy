import { SEASON_ROUNDS, type Round } from '../lib/game'

/** "Season 2 · round 7 of 12" with one dot per round. Renders nothing for a round that hasn't opened yet (no number until the drop). */
export function SeasonStrip({ round, packName }: { round: Round; packName: string }) {
  if (!round.season_no || !round.round_no) return null
  const done = round.status === 'done' ? round.round_no : round.round_no - 1
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-black/5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">Season {round.season_no} · round {round.round_no} of {SEASON_ROUNDS}</div>
        <div className="truncate text-[11px] text-mute">
          {packName === 'Everyday' ? 'Everyday themes' : `${packName} pack`}
          {round.round_no === SEASON_ROUNDS ? ' · last round of the season' : ` · ${SEASON_ROUNDS - round.round_no} more after this one`}
        </div>
      </div>
      <div className="flex gap-1" aria-label={`round ${round.round_no} of ${SEASON_ROUNDS}`}>
        {Array.from({ length: SEASON_ROUNDS }, (_, i) => (
          <span
            key={i}
            className={'h-1.5 w-1.5 rounded-full ' + (i < done ? 'bg-ink' : i === done && round.status !== 'done' ? 'bg-[var(--pack-confetti)] ring-2 ring-[var(--pack-confetti)]/30' : 'bg-black/10')}
          />
        ))}
      </div>
    </div>
  )
}
