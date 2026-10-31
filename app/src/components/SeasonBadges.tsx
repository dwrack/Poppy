import { useEffect, useState } from 'react'
import { BADGE_EMOJI, loadMyBadges, type SeasonBadge } from '../lib/game'
import { useSquads } from '../lib/squads'

/** One pill per badge the player has earned, newest season first, from every squad. Hidden until there is at least one. */
export function SeasonBadges({ userId }: { userId: string }) {
  const [badges, setBadges] = useState<SeasonBadge[]>()
  const { squads } = useSquads(userId)
  useEffect(() => {
    const load = () => loadMyBadges(userId).then(setBadges)
    void load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [userId])
  if (!badges || badges.length === 0) return null
  // With more than one squad, say which squad each badge came from.
  const squadName = (b: SeasonBadge) => (squads.length > 1 ? squads.find((s) => s.id === b.group_id)?.name : undefined)
  return (
    <section className="mb-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
      <h2 className="text-lg font-extrabold">Season badges</h2>
      <p className="mb-3 text-xs text-mute">Earned at the end of each 12-round season. They never go away.</p>
      <div className="flex flex-wrap gap-2">
        {badges.map((b) => <BadgePill key={b.id} badge={b} squad={squadName(b)} />)}
      </div>
    </section>
  )
}

export function BadgePill({ badge, compact, squad }: { badge: SeasonBadge; compact?: boolean; squad?: string }) {
  return (
    <span className={'inline-flex items-center gap-1 rounded-full bg-butter font-bold text-ink ' + (compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-sm')}>
      <span>{BADGE_EMOJI[badge.badge]}</span>
      <span>{badge.badge}</span>
      {!compact && <span className="text-mute">· {squad ? `${squad} ` : ''}S{badge.season_no}</span>}
    </span>
  )
}
