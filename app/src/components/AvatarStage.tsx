import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { outfitOf, type EntryCard } from '../lib/game'
import type { Move } from '../avatar/anim'
import { LazyAvatarScene, webglOk } from './avatarLazy'

/**
 * One entry's avatar on the Runway tab, with her real cutouts as small cards
 * beside her. Used for the reveal (she walks in, poses, turns, holds) and
 * the podium (she holds the pose on her block). Tap her to twirl.
 *
 * Rules from AVATAR-STEP1: ONE WebGL canvas. The parent keeps a single
 * AvatarStage mounted and swaps `card`; the scene, body and GPU textures
 * stay put, only look, outfit and the clock change. The cutout stack
 * (`fallback`) shows while the avatar chunk and body load, and for good if
 * WebGL is missing or the body fails, so the game never depends on 3D.
 */
export function AvatarStage({ card, mode, podium, fallback, className }: {
  card: EntryCard
  mode: 'reveal' | 'podium'
  podium?: 1 | 2 | 3
  fallback: ReactNode
  className?: string
}) {
  const key = card.entry_id
  // Photo-real (BRIEF-v4): when the studio's photo of this look is in, it is the picture and she
  // stands behind it, still loaded, so a tap flips to her instantly and back. One canvas either way.
  const [flip, setFlip] = useState<{ key: string; photo: boolean }>({ key: '', photo: true })
  const [broken, setBroken] = useState<string>()
  const photoUrl = card.photoUrl && card.photoUrl !== broken ? card.photoUrl : undefined
  const showPhoto = !!photoUrl && (flip.key === key ? flip.photo : true)
  const outfit = useMemo(() => outfitOf(card), [card])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // a tap spins her; on the podium she spins once on arrival too
  const [spin, setSpin] = useState<{ key: string; n: number }>({ key: '', n: 0 })
  const tapped = spin.key === key
  const clock = `${key}/${tapped ? spin.n : 0}`
  const [calmFor, setCalmFor] = useState<string>()
  const calm = calmFor === clock
  useEffect(() => {
    if (!ready || !(mode === 'podium' || tapped)) return
    const t = setTimeout(() => setCalmFor(clock), 2600) // one twirl cycle lands in the strike pose
    return () => clearTimeout(t)
  }, [ready, mode, tapped, clock])
  const move: Move = mode === 'podium' ? (calm ? 'strike' : 'twirl') : tapped ? (calm ? 'strike' : 'twirl') : 'reveal'
  const avatar = webglOk() && !failed

  return (
    <div
      className={'relative overflow-hidden rounded-blob bg-gradient-to-b from-white to-butter/50 ring-1 ring-black/5 ' + (className ?? '')}
      data-testid="avatar-stage"
      data-ready={avatar && ready ? '1' : '0'}
      data-photo={showPhoto ? '1' : '0'}
      onClick={() => { if (showPhoto) setFlip({ key, photo: false }); else if (avatar && ready) setSpin((s) => ({ key, n: s.key === key ? s.n + 1 : 1 })) }}
    >
      {avatar && (
        <Suspense fallback={null}>
          <LazyAvatarScene look={card.look} outfit={outfit} move={move} restartKey={key} podium={podium} onReady={() => setReady(true)} onError={() => setFailed(true)} />
        </Suspense>
      )}
      {/* the cutout stack: the whole picture until she is ready, the permanent picture without WebGL */}
      {!(avatar && ready) && <div className="absolute inset-0">{fallback}</div>}
      {showPhoto && (
        <img src={photoUrl} alt={`${card.display_name}'s look`} className="absolute inset-0 z-10 h-full w-full object-cover" data-testid="photo-real" onError={() => setBroken(photoUrl)} />
      )}
      {photoUrl && (
        <button
          onClick={(e) => { e.stopPropagation(); setFlip({ key, photo: !showPhoto }) }}
          className="absolute top-2 left-2 z-20 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold shadow ring-1 ring-black/10 active:scale-95"
          data-testid="photo-flip"
        >{showPhoto ? '🧍 3D' : '📸 Photo'}</button>
      )}
      {showPhoto && <p className="pointer-events-none absolute bottom-1.5 left-0 right-0 z-20 text-center text-[10px] font-semibold text-white drop-shadow">tap to see it in 3D</p>}
      {avatar && ready && !showPhoto && (
        <>
          <div className="pointer-events-none absolute top-2 right-2 flex flex-col gap-1" data-testid="piece-cards">
            {card.pieces.map((p) => (
              <div key={p.id} className="checker h-11 w-11 overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/10">
                {p.url && <img src={p.url} alt={p.name} className="h-full w-full object-contain p-0.5" />}
              </div>
            ))}
          </div>
          <p className="pointer-events-none absolute bottom-1.5 left-0 right-0 text-center text-[10px] font-semibold text-mute">tap to twirl</p>
        </>
      )}
    </div>
  )
}

