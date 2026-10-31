import * as THREE from 'three'
import type { VRM, MToonMaterial } from '@pixiv/three-vrm'
import type { Garment, Outfit } from '../types'
import type { Body } from './body'
import { garmentColours, shadeOf } from './palette'
import { patternTexture } from './textures'
import { disposeGroup } from './hair'

/**
 * Five outfit slots on one rig.
 *  top    -> the VRM's own tee is recoloured / repatterned
 *  bottom -> the VRM's shorts likewise (+ a skirt cone if the item is a skirt)
 *  dress  -> tee and shorts take the dress colours, plus a longer skirt cone
 *  outer  -> an open-front shell around the torso with sleeves on the arm bones
 *  shoes  -> the VRM's shoes recoloured
 * Step 2 (BRIEF-v3 step 6) replaces the tints with the real cutout projected
 * onto these same surfaces.
 */

type Role = 'top' | 'bottom' | 'shoes'

function paint(body: Body, role: Role, g: Garment | undefined) {
  for (const mat of (body.mats[role] ?? []) as MToonMaterial[]) {
    if (!g) {
      mat.map = body.originalMaps.get(mat) ?? null
      mat.color.set('#ffffff')
      if ('shadeColorFactor' in mat) mat.shadeColorFactor.set(role === 'top' ? '#cfc7c0' : role === 'bottom' ? '#151515' : '#5e5048')
      mat.needsUpdate = true
      continue
    }
    const { primary, secondary } = garmentColours(g)
    if (g.pattern === 'solid') {
      // The tee is painted white so the original map keeps its folds. Shorts and shoes are dark: go flat.
      mat.map = role === 'top' ? body.originalMaps.get(mat) ?? null : null
      mat.color.set(primary)
    } else {
      mat.map = patternTexture(g.pattern, primary, secondary)
      mat.color.set('#ffffff')
    }
    if ('shadeColorFactor' in mat) mat.shadeColorFactor.copy(shadeOf(primary, 0.7))
    mat.needsUpdate = true
  }
}

function toon(g: Garment, side: THREE.Side = THREE.FrontSide) {
  const { primary, secondary } = garmentColours(g)
  const m = new THREE.MeshToonMaterial({ color: g.pattern === 'solid' ? new THREE.Color(primary) : '#ffffff', side })
  if (g.pattern !== 'solid') {
    const tex = patternTexture(g.pattern, primary, secondary).clone()
    tex.repeat.set(2, 2)
    tex.needsUpdate = true
    m.map = tex
  }
  const trim = new THREE.MeshToonMaterial({ color: new THREE.Color(secondary), side })
  return { main: m, trim }
}

/** Hang a mesh off a bone. The normalized rig has world-aligned axes at rest, so offsets here are plain up/forward/sideways. */
export function attach(vrm: VRM, bone: Parameters<VRM['humanoid']['getNormalizedBoneNode']>[0], obj: THREE.Object3D) {
  const node = vrm.humanoid.getNormalizedBoneNode(bone)
  if (node) node.add(obj)
}

function skirt(g: Garment, long: boolean) {
  const { main, trim } = toon(g, THREE.DoubleSide)
  const h = long ? 0.42 : 0.26
  const group = new THREE.Group()
  group.name = 'proc-skirt'
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.135, long ? 0.3 : 0.24, h, 28, 1, true), main)
  cone.position.set(0, -0.02 - h / 2, 0.01)
  cone.scale.set(1.08, 1, 0.9)
  group.add(cone)
  const hem = new THREE.Mesh(new THREE.TorusGeometry(long ? 0.3 : 0.24, 0.008, 6, 36), trim)
  hem.rotation.x = Math.PI / 2
  hem.position.set(0, -0.02 - h, 0.01)
  hem.scale.set(1.08, 0.9, 1)
  group.add(hem)
  const waist = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 36), trim)
  waist.rotation.x = Math.PI / 2
  waist.position.set(0, -0.02, 0.01)
  waist.scale.set(1.08, 0.9, 1)
  group.add(waist)
  return group
}

function jacket(vrm: VRM, g: Garment) {
  const { main, trim } = toon(g, THREE.DoubleSide)
  const parts: THREE.Object3D[] = []
  // torso shell, open at the front (theta 0 is +Z in three's cylinder)
  const shell = new THREE.Group()
  shell.name = 'proc-jacket'
  const gap = 0.55
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.33, 28, 1, true, gap, Math.PI * 2 - gap * 2), main)
  body.scale.set(1.15, 1, 0.78)
  body.position.set(0, -0.06, -0.005)
  shell.add(body)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 6, 32, Math.PI * 1.5), trim)
  collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.75)
  collar.position.set(0, 0.105, -0.005)
  collar.scale.set(1.15, 0.78, 1)
  shell.add(collar)
  attach(vrm, 'chest', shell)
  parts.push(shell)
  // sleeves along each arm bone (+X on the left arm, -X on the right)
  for (const side of ['left', 'right'] as const) {
    const s = side === 'left' ? 1 : -1
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.23, 14, 1, true), main)
    upper.rotation.z = s * -Math.PI / 2
    upper.position.set(s * 0.115, 0, 0)
    upper.name = 'proc-jacket'
    attach(vrm, `${side}UpperArm`, upper)
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.2, 14, 1, true), main)
    lower.rotation.z = s * -Math.PI / 2
    lower.position.set(s * 0.1, 0, 0)
    lower.name = 'proc-jacket'
    attach(vrm, `${side}LowerArm`, lower)
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14, 1, true), trim)
    cuff.rotation.z = s * -Math.PI / 2
    cuff.position.set(s * 0.2, 0, 0)
    cuff.name = 'proc-jacket'
    attach(vrm, `${side}LowerArm`, cuff)
    parts.push(upper, lower, cuff)
  }
  return parts
}

export class OutfitRig {
  private extra: THREE.Object3D[] = []
  private body: Body
  constructor(body: Body) { this.body = body }

  apply(outfit: Outfit) {
    for (const o of this.extra) disposeGroup(o)
    this.extra = []
    const { vrm } = this.body
    const dress = outfit.dress
    paint(this.body, 'top', dress ?? outfit.top)
    paint(this.body, 'bottom', dress ?? outfit.bottom)
    paint(this.body, 'shoes', outfit.shoes)
    if (dress) {
      const sk = skirt(dress, true)
      attach(vrm, 'hips', sk)
      this.extra.push(sk)
    } else if (outfit.bottom?.shape === 'skirt') {
      const sk = skirt(outfit.bottom, false)
      attach(vrm, 'hips', sk)
      this.extra.push(sk)
    }
    if (outfit.outer) this.extra.push(...jacket(vrm, outfit.outer))
  }

  dispose() {
    for (const o of this.extra) disposeGroup(o)
    this.extra = []
  }
}
