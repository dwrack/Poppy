import { photoChip, STUDIO_OFFLINE, type PhotoJob } from '../lib/photos'

const TONE = {
  wait: 'bg-butter text-ink',
  ok: 'bg-sage/15 text-sage',
  bad: 'bg-poppy/10 text-poppy',
  off: 'bg-cream text-mute ring-1 ring-black/10',
} as const

/** The photo-real status chip: queued, rendering, in review, ready, failed, or studio offline (with the exact offline line). */
export function PhotoChip({ job, online, note, className }: { job?: PhotoJob; online: boolean; note?: string; className?: string }) {
  const c = photoChip(job, online)
  if (!c || !job) return null
  return (
    <div className={className} data-testid="photo-chip" data-status={c.offline ? 'offline' : job.status}>
      <span className={'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ' + TONE[c.tone]}>
        📸 {c.label}{note ? <span className="font-semibold opacity-70"> · {note}</span> : null}
      </span>
      {c.offline && <p className="mt-1 inline-block rounded-lg bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-mute">{STUDIO_OFFLINE}</p>}
    </div>
  )
}
