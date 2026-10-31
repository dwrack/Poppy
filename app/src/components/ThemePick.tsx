import { useCallback, useEffect, useState } from 'react'
import { canPickTheme, loadThemeNames, loadThemeOptions, setThemePick, type Round, type ThemeOption } from '../lib/game'

/**
 * The theme prop. Shown under the "This week" card while the round is still
 * upcoming. Only last round's winner(s) get the sheet; everyone else sees a
 * one-liner if a pick has been made. Nothing is typed: pick from the pool or
 * veto one, that's it.
 */
export function ThemePick({ round, groupId, userId, onChanged }: { round: Round; groupId: string; userId: string; onChanged: () => void }) {
  const [canPick, setCanPick] = useState<boolean>()
  const [options, setOptions] = useState<ThemeOption[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [err, setErr] = useState<string>()

  const load = useCallback(async () => {
    const [ok, opts, nm] = await Promise.all([canPickTheme(groupId), loadThemeOptions(groupId), loadThemeNames([round.theme_pick_id, round.theme_veto_id])])
    setCanPick(ok); setOptions(opts); setNames(nm)
  }, [groupId, round.theme_pick_id, round.theme_veto_id])
  useEffect(() => { void load() }, [load])

  const pick = round.theme_pick_id ?? null
  const veto = round.theme_veto_id ?? null
  const mine = round.theme_pick_by === userId

  async function set(patch: Parameters<typeof setThemePick>[1], key: string) {
    if (!navigator.onLine) { setErr('You’re offline. Try again when you’re back on wifi.'); return }
    setBusy(key); setErr(undefined)
    try { await setThemePick(round.id, patch); onChanged(); await load() } catch (x) { setErr((x as Error).message) } finally { setBusy(undefined) }
  }

  if (canPick === undefined) return null

  // Everyone who isn't the winner: just the news, if any.
  if (!canPick) {
    if (!pick && !veto) return null
    return (
      <p className="mt-3 rounded-2xl bg-butter/50 p-3 text-center text-xs font-semibold text-ink/70">
        {pick ? '🎁 Last round’s winner has already picked next theme. It drops Friday.' : '🚫 Last round’s winner vetoed one theme from the pool.'}
      </p>
    )
  }

  return (
    <section className="mt-4 rounded-blob bg-white p-4 ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold tracking-wide text-mute uppercase">Winner’s prop</div>
          <h3 className="text-lg font-extrabold">You pick next theme 🏆</h3>
          <p className="mt-0.5 text-xs text-mute">Choose one to play, or veto one you don’t want. Locks when it drops.</p>
        </div>
        {!open && <button onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-poppy px-4 py-2 text-sm font-bold text-white">{pick || veto ? 'Change' : 'Pick'}</button>}
      </div>

      {(pick || veto) && !open && (
        <div className="mt-3 space-y-1 text-sm">
          {pick && <p><span className="font-bold">Playing next:</span> {names.get(pick) ?? '…'}{mine ? '' : ' (a co-winner picked)'}</p>}
          {veto && <p><span className="font-bold">Vetoed:</span> {names.get(veto) ?? '…'}</p>}
        </div>
      )}

      {open && (
        <ul className="mt-3 space-y-2">
          {options.length === 0 && <li className="text-center text-sm text-mute">The pool is empty for your squad. A new pack drops soon.</li>}
          {options.map((t) => {
            const isPick = t.id === pick, isVeto = t.id === veto
            return (
              <li key={t.id} className={'flex items-center gap-2 rounded-2xl px-3 py-2 ring-1 ' + (isPick ? 'bg-butter/60 ring-butter' : isVeto ? 'bg-cream ring-black/5 opacity-60' : 'bg-cream ring-black/5')}>
                <span className={'flex-1 text-sm font-semibold ' + (isVeto ? 'line-through' : '')}>{t.text}</span>
                <button
                  onClick={() => set({ theme_pick_id: isPick ? null : t.id, ...(isVeto ? { theme_veto_id: null } : {}) }, 'p' + t.id)}
                  disabled={!!busy}
                  className={'rounded-full px-3 py-1 text-xs font-bold ' + (isPick ? 'bg-ink text-white' : 'bg-white ring-1 ring-black/10')}
                >{busy === 'p' + t.id ? '…' : isPick ? 'Picked ✓' : 'Play it'}</button>
                <button
                  onClick={() => set({ theme_veto_id: isVeto ? null : t.id, ...(isPick ? { theme_pick_id: null } : {}) }, 'v' + t.id)}
                  disabled={!!busy}
                  className={'rounded-full px-3 py-1 text-xs font-bold ' + (isVeto ? 'bg-poppy text-white' : 'bg-white ring-1 ring-black/10')}
                >{busy === 'v' + t.id ? '…' : isVeto ? 'Vetoed' : 'Veto'}</button>
              </li>
            )
          })}
          <li><button onClick={() => setOpen(false)} className="mt-1 w-full rounded-full py-2 text-sm font-bold text-mute">Done</button></li>
        </ul>
      )}
      {err && <p className="mt-2 text-center text-sm text-poppy">{err}</p>}
    </section>
  )
}
