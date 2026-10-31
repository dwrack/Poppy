import * as THREE from 'three'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

/**
 * Procedural moves on the VRM normalized rig (T-pose rest, world-aligned
 * axes, model faces +Z). No clips, no retargeting: every pose is a handful
 * of sines and eases written here, so they work on any VRM 1.0 body.
 * Step 2 can swap any of these for a retargeted clip without touching
 * the scene.
 */
export const MOVES = ['idle', 'walk', 'sit', 'twirl', 'runway'] as const
export type Move = (typeof MOVES)[number]
export const MOVE_LABEL: Record<Move, string> = { idle: 'Idle', walk: 'Walk', sit: 'Sit', twirl: 'Twirl', runway: 'Runway' }

const D = Math.PI / 180
type Pose = Partial<Record<VRMHumanBoneName, [number, number, number]>>

const q = new THREE.Quaternion()
const e = new THREE.Euler()

/** Arms hang at about 72 degrees from the T-pose, elbows soft. */
function restArms(p: Pose, swingL = 0, swingR = 0, out = 0) {
  p.leftUpperArm = [swingL, 0, -(72 - out) * D]
  p.rightUpperArm = [swingR, 0, (72 - out) * D]
  p.leftLowerArm = [0, -12 * D, -6 * D]
  p.rightLowerArm = [0, 12 * D, 6 * D]
  p.leftHand = [0, 0, -8 * D]
  p.rightHand = [0, 0, 8 * D]
}

function idle(t: number): Pose {
  const p: Pose = {}
  const b = Math.sin(t * 1.6)
  restArms(p, Math.sin(t * 0.8) * 2 * D, Math.sin(t * 0.8 + 1) * 2 * D)
  p.spine = [b * 1.2 * D, 0, Math.sin(t * 0.5) * 1.5 * D]
  p.chest = [b * 1.5 * D, 0, 0]
  p.neck = [-b * 1 * D, Math.sin(t * 0.35) * 6 * D, 0]
  p.head = [Math.sin(t * 0.6) * 2 * D, Math.sin(t * 0.35) * 5 * D, Math.sin(t * 0.45) * 2.5 * D]
  p.hips = [0, 0, Math.sin(t * 0.5) * 1.5 * D]
  p.leftUpperLeg = [0, 0, -2 * D]
  p.rightUpperLeg = [0, 0, 4 * D]
  p.rightLowerLeg = [6 * D, 0, 0]
  return p
}

/** One step every 0.55 s. Legs swing about X (negative is forward), knees bend on the back swing. */
function walk(t: number, speed = 1): Pose {
  const w = t * (2 * Math.PI / 1.1) * speed
  const s = Math.sin(w)
  const p: Pose = {}
  p.leftUpperLeg = [-s * 28 * D, 0, 0]
  p.rightUpperLeg = [s * 28 * D, 0, 0]
  p.leftLowerLeg = [Math.max(0, Math.sin(w - 0.8)) * 42 * D, 0, 0]
  p.rightLowerLeg = [Math.max(0, Math.sin(w + Math.PI - 0.8)) * 42 * D, 0, 0]
  p.leftFoot = [Math.max(0, -s) * 10 * D, 0, 0]
  p.rightFoot = [Math.max(0, s) * 10 * D, 0, 0]
  restArms(p, s * 22 * D, -s * 22 * D)
  p.spine = [3 * D, s * 4 * D, 0]
  p.chest = [0, s * 3 * D, 0]
  p.hips = [2 * D, -s * 6 * D, Math.sin(w) * 2 * D]
  p.head = [0, -s * 3 * D, 0]
  return p
}

/** Hips come down, thighs forward, shins hang, hands rest on the thighs. */
function sit(t: number): Pose {
  const b = Math.sin(t * 1.6)
  const p: Pose = {}
  p.leftUpperLeg = [-86 * D, 0, -6 * D]
  p.rightUpperLeg = [-86 * D, 0, 6 * D]
  p.leftLowerLeg = [82 * D, 0, 0]
  p.rightLowerLeg = [82 * D, 0, 0]
  p.leftFoot = [-8 * D, 0, 0]
  p.rightFoot = [-8 * D, 0, 0]
  p.spine = [-6 * D + b * 1 * D, 0, 0]
  p.chest = [b * 1.5 * D, 0, 0]
  p.leftUpperArm = [-38 * D, 0, -74 * D]
  p.rightUpperArm = [-38 * D, 0, 74 * D]
  p.leftLowerArm = [0, -30 * D, -14 * D]
  p.rightLowerArm = [0, 30 * D, 14 * D]
  p.head = [Math.sin(t * 0.6) * 2 * D, Math.sin(t * 0.4) * 8 * D, 0]
  return p
}

/** Catwalk stance: weight on one hip, hand on the other hip, chin up. */
function strike(t: number, side: 1 | -1): Pose {
  const b = Math.sin(t * 1.6)
  const p: Pose = {}
  p.hips = [0, 0, side * 6 * D]
  p.spine = [-3 * D, 0, -side * 4 * D]
  p.chest = [b * 1.2 * D, 0, -side * 3 * D]
  p.head = [-4 * D, side * 12 * D, side * 5 * D]
  p.leftUpperLeg = [0, 0, side > 0 ? 8 * D : -4 * D]
  p.rightUpperLeg = [0, 0, side > 0 ? 4 * D : -8 * D]
  p.rightLowerLeg = [side > 0 ? 0 : 10 * D, 0, 0]
  p.leftLowerLeg = [side > 0 ? 10 * D : 0, 0, 0]
  // hand on hip on `side` (left is +X), other arm long and loose
  if (side > 0) {
    p.leftUpperArm = [8 * D, 0, -52 * D]
    p.leftLowerArm = [0, 0, -112 * D]
    p.leftHand = [0, 0, -30 * D]
    p.rightUpperArm = [4 * D, 0, 76 * D]
    p.rightLowerArm = [0, 10 * D, 6 * D]
  } else {
    p.rightUpperArm = [8 * D, 0, 52 * D]
    p.rightLowerArm = [0, 0, 112 * D]
    p.rightHand = [0, 0, 30 * D]
    p.leftUpperArm = [4 * D, 0, -76 * D]
    p.leftLowerArm = [0, -10 * D, -6 * D]
  }
  return p
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export interface Root { x: number; z: number; yaw: number; bounce: number; hipsDrop: number }

/**
 * What the body should do at time t for a move. Returns bone targets plus
 * where the whole girl stands (used for the runway walk and the twirl).
 */
export function sample(move: Move, t: number): { pose: Pose; root: Root } {
  const root: Root = { x: 0, z: 0, yaw: 0, bounce: 0, hipsDrop: 0 }
  switch (move) {
    case 'idle': return { pose: idle(t), root }
    case 'walk': {
      const w = t * (2 * Math.PI / 1.1)
      root.bounce = Math.abs(Math.sin(w)) * 0.025
      return { pose: walk(t), root }
    }
    case 'sit': root.hipsDrop = 0.4; return { pose: sit(t), root }
    case 'twirl': {
      // 1.6 s of spin (two turns), 1.1 s to land and breathe, repeat
      const T = 2.7, u = t % T
      if (u < 1.6) {
        const k = ease(u / 1.6)
        root.yaw = k * Math.PI * 4
        root.bounce = Math.sin((u / 1.6) * Math.PI) * 0.06
        const p = idle(t)
        const out = Math.sin((u / 1.6) * Math.PI) * 55
        restArms(p, 0, 0, out)
        p.head = [-6 * D, 0, 0]
        p.leftUpperLeg = [0, 0, -4 * D]
        p.rightUpperLeg = [-12 * D, 0, 10 * D]
        p.rightLowerLeg = [30 * D, 0, 0]
        return { pose: p, root }
      }
      return { pose: strike(t, 1), root }
    }
    case 'runway': {
      // walk 3.2 s toward the camera, pose 1.5 s, turn 0.8 s, walk back 3.2 s, turn 0.8 s = 9.5 s loop
      const T = 9.5, u = t % T
      const far = -2.6, near = 0.55
      if (u < 3.2) {
        const k = u / 3.2
        root.z = far + (near - far) * k
        root.bounce = Math.abs(Math.sin(t * (2 * Math.PI / 1.1))) * 0.02
        const p = walk(t, 1)
        p.head = [-3 * D, 0, 0]
        return { pose: p, root }
      }
      if (u < 4.7) {
        root.z = near
        const k = clamp01((u - 3.2) / 0.35)
        const p = strike(t, 1)
        // settle into the pose from the walk
        if (k < 1) { const w = walk(t, 0); return { pose: blend(w, p, ease(k)), root } }
        return { pose: p, root }
      }
      if (u < 5.5) {
        root.z = near
        root.yaw = ease((u - 4.7) / 0.8) * Math.PI
        return { pose: blend(strike(t, 1), walk(t, 1), ease((u - 4.7) / 0.8)), root }
      }
      if (u < 8.7) {
        const k = (u - 5.5) / 3.2
        root.z = near + (far - near) * k
        root.yaw = Math.PI
        root.bounce = Math.abs(Math.sin(t * (2 * Math.PI / 1.1))) * 0.02
        return { pose: walk(t, 1), root }
      }
      root.z = far
      root.yaw = Math.PI + ease((u - 8.7) / 0.8) * Math.PI
      return { pose: walk(t, 0.5), root }
    }
  }
}

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {}
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as VRMHumanBoneName[])
  for (const key of keys) {
    const x = a[key] ?? [0, 0, 0], y = b[key] ?? [0, 0, 0]
    out[key] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]
  }
  return out
}

const ALL_BONES: VRMHumanBoneName[] = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
]

export class Animator {
  private t = 0
  private blinkAt = 2.5
  private move: Move = 'idle'
  private switchedAt = 0
  private root: Root = { x: 0, z: 0, yaw: 0, bounce: 0, hipsDrop: 0 }
  private vrm: VRM
  private restHipsY: number
  constructor(vrm: VRM, restHipsY: number) { this.vrm = vrm; this.restHipsY = restHipsY }

  setMove(m: Move) {
    if (m === this.move) return
    this.move = m
    this.switchedAt = this.t
  }
  get current() { return this.move }

  /** Advance by dt seconds. Smooths toward the sampled pose so switching moves never pops. */
  update(dt: number) {
    this.t += dt
    const local = this.t - this.switchedAt
    const { pose, root } = sample(this.move, this.move === 'idle' ? this.t : local)
    const k = 1 - Math.exp(-dt * 14)
    const h = this.vrm.humanoid
    for (const name of ALL_BONES) {
      const node = h.getNormalizedBoneNode(name)
      if (!node) continue
      const r = pose[name] ?? [0, 0, 0]
      // swing (x) is applied last, in the parent frame, so lowered arms swing forward and back
      e.set(0, r[1], r[2], 'XYZ')
      q.setFromEuler(e)
      if (r[0]) q.premultiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, r[0]))
      node.quaternion.slerp(q, k)
    }
    const hips = h.getNormalizedBoneNode('hips')
    if (hips) hips.position.y += (this.restHipsY - root.hipsDrop + root.bounce - hips.position.y) * k
    // root motion: position and facing of the whole girl
    const rk = this.move === 'runway' || this.move === 'twirl' ? 1 : k
    this.root.x += (root.x - this.root.x) * rk
    this.root.z += (root.z - this.root.z) * rk
    this.root.yaw += (root.yaw - this.root.yaw) * rk
    this.vrm.scene.position.x = this.root.x
    this.vrm.scene.position.z = this.root.z
    this.vrm.scene.rotation.y = this.root.yaw
    // blink
    const em = this.vrm.expressionManager
    if (em) {
      const since = this.t - this.blinkAt
      if (since > 0) {
        const w = since < 0.08 ? since / 0.08 : since < 0.2 ? 1 - (since - 0.08) / 0.12 : 0
        em.setValue('blink', Math.max(0, w))
        if (since > 0.2) this.blinkAt = this.t + 2.2 + Math.random() * 2.8
      }
    }
    this.vrm.update(dt)
  }

  /** Jump straight to the pose (first frame after load, no slerp). */
  snap() { for (let i = 0; i < 40; i++) this.update(1 / 30) }
}

const X_AXIS = new THREE.Vector3(1, 0, 0)
