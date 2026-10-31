import { useEffect, useState } from 'react'
import { SEASON_ROUNDS, loadSeasonBadges, loadSeasonSummary, rankSeason, type SeasonBadge, type SeasonRow } from '../lib/game'
import { BadgePill } from './SeasonBadges'

const PLACE_EMOJI = ['', '🥇', '🥈', '🥉']

/** End-of-season podium: every member's season stars, shared places, and the badges awarded when round 12 closed. */
export function SeasonPodium({ groupId, seasonNo, userId }: { groupId: string; seasonNo: number; userId: string }) {
  const [data, setData] = useState<{ rows: SeasonRow[]; badges: SeasonBadge[] }>()
  useEffect(() => {
    let live = true
    Promise.all([loadSeasonSummary(groupId, seasonNo), loadSeasonBadges(groupId, seasonNo)])
      .then(([rows, badges]) => { if (live) setData({ rows, badges }) })
    return () => { live = false }
  }, [groupId, seasonNo])

  if (!data) return <section className="mt-4 rounded-blob bg-white p-4 text-center text-sm text-mute ring-1 ring-black/5">Adding up the season…</section>
  if (data.rows.length === 0) return null

  const ranked = rankSeason(data.rows)
  const iWon = ranked.some((r) => r.place === 1 && r.row.user_id === userId && r.row.stars > 0)
  const byUser = new Map<string, SeasonBadge[]>()
  for (const b of data.badges) byUser.set(b.user_id, [...(byUser.get(b.user_id) ?? []), b])
  const roundsDone = data.rows[0]?.rounds_done ?? 0

  return (
    <section className="mt-4 overflow-hidden rounded-blob p-5 text-white shadow-lg" style={{ background: 'var(--pack-lobby)' }}>
      <div className="text-xs font-bold tracking-wide text-white/60 uppercase">Season {seasonNo} is a wrap</div>
      <h2 className="mt-1 text-2xl leading-tight font-extrabold">{roundsDone} of {SEASON_ROUNDS} rounds walked</h2>
      {iWon && <p className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-extrabold text-ink" style={{ background: 'var(--pack-confetti)' }}>👑 You won the season!</p>}

      <ul className="mt-4 space-y-2">
        {ranked.map(({ place, row }) => (
          <li key={row.user_id} className="rounded-2xl bg-white/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="w-7 text-lg">{place <= 3 ? PLACE_EMOJI[place] : <span className="text-sm font-extrabold text-white/60">{place}</span>}</span>
              <span className="text-xl">{row.emoji}</span>
              <span className="flex-1 truncate font-bold">{row.user_id === userId ? 'You' : row.display_name}</span>
              <span className="font-extrabold tabular-nums" style={{ color: 'var(--pack-confetti)' }}>{row.stars} ⭐</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-9 text-[11px] text-white/70">
              <span>{row.wins} {row.wins === 1 ? 'win' : 'wins'}</span>
              <span>·</span>
              <span>{row.entered}/{roundsDone} looks</span>
              {(byUser.get(row.user_id) ?? []).map((b) => <BadgePill key={b.id} badge={b} compact />)}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs text-white/60">Season {seasonNo + 1} starts with the next theme drop. Stars keep counting on the ladder.</p>
    </section>
  )
}
