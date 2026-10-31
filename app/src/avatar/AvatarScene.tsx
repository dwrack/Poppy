import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { AvatarLook, Outfit } from '../types'
import { applyLook, BASE_HEIGHT_IN, disposeBody, loadBody, setVisible, type Body } from './body'
import { buildHair, disposeGroup } from './hair'
import { attach, OutfitRig } from './garments'
import { Animator, type Move } from './anim'
import { hairHex } from './palette'
import { disposeTextures } from './textures'

export interface AvatarSceneProps {
  look: AvatarLook
  outfit?: Outfit
  move?: Move
  /** her real height; scales the whole rig from the base body's 5'3" */
  heightIn?: number
  /** tighter framing for the You-tab card */
  compact?: boolean
  /**
   * Change this to play the current move again from its first frame (the
   * next girl on the runway). The scene, body and GPU resources stay put;
   * only look, outfit and the clock change.
   */
  restartKey?: string | number
  /** A podium block under her feet: 1 is the tall centre one. */
  podium?: 1 | 2 | 3
  onReady?: () => void
  onError?: (e: unknown) => void
}

const PODIUM_H: Record<1 | 2 | 3, number> = { 1: 0.16, 2: 0.1, 3: 0.06 }

/**
 * The avatar on a canvas. iPhone Safari rules live here: no antialias,
 * low-power GPU, pixel ratio capped at 2, demand frames while idle,
 * everything disposed on unmount.
 */
export default function AvatarScene(props: AvatarSceneProps) {
  const move = props.move ?? 'idle'
  const [dragging, setDragging] = useState(false)
  // `reveal` is a one-shot: once she is holding the final pose, drop back to demand frames
  const clock = `${move}/${props.restartKey ?? ''}`
  const [heldFor, setHeldFor] = useState<string>()
  const holding = heldFor === clock
  const idle = (move === 'idle' || move === 'strike' || holding) && !dragging
  const lift = props.podium ? PODIUM_H[props.podium] : 0
  return (
    <Canvas
      flat
      frameloop={idle ? 'demand' : 'always'}
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: 'low-power', alpha: true }}
      camera={{ fov: props.compact ? 24 : 28, position: [0, props.compact ? 1.25 : 1.0, props.compact ? 2.4 : 3.5], near: 0.3, far: 30 }}
      style={{ touchAction: 'none' }}
    >
      <hemisphereLight args={['#fffaf3', '#cdbcae', 1.15]} />
      <directionalLight position={[1.5, 3, 2.5]} intensity={1.3} />
      <directionalLight position={[-2, 2, -1.5]} intensity={0.35} />
      <Girl {...props} move={move} idle={idle} lift={lift} onHold={() => setHeldFor(clock)} />
      {props.podium ? (
        <mesh position-y={lift / 2}>
          <cylinderGeometry args={[0.5, 0.55, lift, 40]} />
          <meshToonMaterial color={props.podium === 1 ? '#ffe8b6' : '#f1e4d6'} />
        </mesh>
      ) : (
        <mesh rotation-x={-Math.PI / 2} position-y={0.002}>
          <circleGeometry args={[0.55, 40]} />
          <meshBasicMaterial color="#f1e4d6" />
        </mesh>
      )}
      <OrbitControls
        target={[0, (props.compact ? 1.25 : 0.88) + lift, 0]}
        enableZoom={false}
        enablePan={false}
        enableDamping={false}
        minPolarAngle={1.35}
        maxPolarAngle={1.62}
        rotateSpeed={0.9}
        onStart={() => setDragging(true)}
        onEnd={() => setDragging(false)}
      />
    </Canvas>
  )
}

function Girl({ look, outfit, move, heightIn, onReady, onError, idle, restartKey, lift, onHold }: AvatarSceneProps & { move: Move; idle: boolean; lift: number; onHold: () => void }) {
  const { scene, camera, invalidate } = useThree()
  // three.js objects are mutable by nature, so the body lives in a ref; `loaded` ticks when it arrives
  const bodyRef = useRef<Body>(null)
  const [loaded, setLoaded] = useState(0)
  const rig = useRef<OutfitRig>(null)
  const anim = useRef<Animator>(null)
  const hair = useRef<THREE.Group>(null)
  const ready = useRef(false)
  const held = useRef(false)
  // callbacks live in a ref: parents pass inline arrows, and a dependency on them
  // re-ran this load on every parent render (found in step 2: the reveal re-parsed
  // the 5 MB body on each state change and she was never on screen)
  const cb = useRef({ onReady, onError, onHold })
  useEffect(() => { cb.current = { onReady, onError, onHold } })

  // load once per mount
  useEffect(() => {
    let alive = true
    loadBody().then((b) => { if (alive) { bodyRef.current = b; setLoaded((n) => n + 1) } else disposeBody(b) })
      .catch((e) => { console.warn('avatar load failed', e); cb.current.onError?.(e) })
    return () => { alive = false }
  }, [])

  // mount into the scene; everything is torn down on unmount
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    scene.add(body.vrm.scene)
    if (body.vrm.lookAt) body.vrm.lookAt.target = camera
    rig.current = new OutfitRig(body)
    anim.current = new Animator(body.vrm, body.restHipsY)
    return () => {
      rig.current?.dispose(); rig.current = null
      if (hair.current) { disposeGroup(hair.current); hair.current = null }
      scene.remove(body.vrm.scene)
      disposeBody(body)
      disposeTextures()
      anim.current = null
      ready.current = false
      bodyRef.current = null
    }
  }, [loaded, scene, camera])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    if (hair.current) disposeGroup(hair.current)
    hair.current = dress(body, look)
    invalidate()
  }, [loaded, look, invalidate])

  useEffect(() => {
    if (!bodyRef.current) return
    rig.current?.apply(outfit ?? {})
    invalidate()
  }, [loaded, outfit, invalidate])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    setHeight(body, heightIn)
    invalidate()
  }, [loaded, heightIn, invalidate])

  useEffect(() => {
    if (!bodyRef.current) return
    anim.current?.setMove(move)
    invalidate()
  }, [loaded, move, invalidate])

  // same move, next girl: play it again from the first frame
  useEffect(() => {
    if (!bodyRef.current) return
    anim.current?.restart()
    held.current = false
    invalidate()
  }, [loaded, restartKey, invalidate])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    body.vrm.scene.position.y = lift
    invalidate()
  }, [loaded, lift, invalidate])

  // idle: a gentle 20 fps heartbeat instead of a full render loop
  useEffect(() => {
    if (!loaded || !idle) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') invalidate() }, 50)
    return () => clearInterval(id)
  }, [loaded, idle, invalidate])

  useFrame((_, dt) => {
    const a = anim.current
    if (!a) return
    if (!ready.current) { a.snap(); ready.current = true; cb.current.onReady?.() }
    a.update(Math.min(dt, 0.05))
    if (!held.current && a.holding) { held.current = true; cb.current.onHold() }
  })

  return null
}

/** Skin, eyes, face, and a fresh hairdo on the head bone. Returns the hair group so it can be disposed. */
function dress(body: Body, look: AvatarLook) {
  applyLook(body, look)
  const h = buildHair(look.hair, hairHex(look.hairColour))
  attach(body.vrm, 'head', h.group)
  setVisible(body, 'hair', h.showStrands)
  return h.group
}

function setHeight(body: Body, heightIn?: number) {
  const k = heightIn ? Math.min(1.2, Math.max(0.8, heightIn / BASE_HEIGHT_IN)) : 1
  body.vrm.scene.scale.setScalar(k)
}
