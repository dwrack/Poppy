import * as THREE from 'three'
import type { AvatarHair } from '../types'
import { shadeOf } from './palette'

/**
 * Ten hair styles out of one VRM hairdo. The model ships with a long
 * strands mesh (fringe plus the long back hair, one piece) and a scalp cap.
 * "Long" and "Half up" keep the strands. Every other style hides them and
 * builds a toon cap over the skull plus the style's own pieces, all hung
 * off the normalized head bone (world-aligned axes: +Y up, +Z forward) in
 * the hair colour. Not a stylist's work, but each one reads as a different
 * girl at phone size, which is what the runway needs.
 */
export interface HairBuild {
  group: THREE.Group
  /** keep the VRM's own strands (fringe + long back) visible */
  showStrands: boolean
}

export function buildHair(style: AvatarHair, colourHex: string): HairBuild {
  const g = new THREE.Group()
  g.name = 'proc-hair'
  const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(colourHex) })
  const dark = new THREE.MeshToonMaterial({ color: shadeOf(colourHex, 0.8) })
  const tie = new THREE.MeshToonMaterial({ color: new THREE.Color('#e76f51') })
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: [number, number, number], scale?: [number, number, number]) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    if (rot) mesh.rotation.set(...rot)
    if (scale) mesh.scale.set(...scale)
    g.add(mesh)
    return mesh
  }
  // Head bone is at the base of the skull. Skull centre ~0.09 up, eyes ~0.105 up, crown ~0.19 up.
  const sphere = (r: number) => new THREE.SphereGeometry(r, 18, 12)
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12)
  // Bowl cap: a top-of-sphere shell whose front edge sits at the brow, so it reads as hair with a fringe.
  const cap = () => add(new THREE.SphereGeometry(0.112, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.47), mat, 0, 0.108, -0.012, undefined, [1.02, 1.0, 1.04])

  if (style === 'long') return { group: g, showStrands: true }
  if (style === 'halfup') {
    add(sphere(0.045), mat, 0, 0.2, -0.05)
    add(new THREE.TorusGeometry(0.03, 0.009, 8, 16), tie, 0, 0.17, -0.045, [Math.PI / 2.4, 0, 0])
    return { group: g, showStrands: true }
  }

  cap()
  switch (style) {
    case 'bob':
      // sides and back come down to the jaw
      add(new THREE.SphereGeometry(0.118, 24, 14, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.45), mat, 0, 0.085, -0.03, undefined, [1.02, 1.15, 0.95])
      break
    case 'pixie':
      add(new THREE.SphereGeometry(0.112, 24, 14, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.25), dark, 0, 0.1, -0.035, undefined, [1.0, 1.0, 0.95])
      break
    case 'ponytail':
      add(sphere(0.035), tie, 0, 0.12, -0.11)
      add(capsule(0.036, 0.22), mat, 0, -0.01, -0.15, [0.25, 0, 0])
      add(capsule(0.028, 0.12), dark, 0, -0.17, -0.2, [0.1, 0, 0])
      break
    case 'pigtails':
      for (const s of [-1, 1]) {
        add(sphere(0.028), tie, s * 0.105, 0.075, -0.065)
        add(capsule(0.033, 0.17), mat, s * 0.12, -0.05, -0.07, [0, 0, s * -0.15])
      }
      break
    case 'buns':
      for (const s of [-1, 1]) {
        add(sphere(0.046), mat, s * 0.088, 0.2, -0.025)
        add(new THREE.TorusGeometry(0.03, 0.008, 8, 16), tie, s * 0.088, 0.168, -0.025, [0, 0, s * 0.4])
      }
      break
    case 'bun':
      add(sphere(0.056), mat, 0, 0.225, -0.035)
      add(new THREE.TorusGeometry(0.036, 0.009, 8, 16), tie, 0, 0.18, -0.035, [Math.PI / 2, 0, 0])
      break
    case 'braid': {
      for (let i = 0; i < 7; i++) {
        add(sphere(0.034 - i * 0.002), i % 2 ? dark : mat, (i % 2 ? 1 : -1) * 0.012, 0.03 - i * 0.055, -0.105 - i * 0.004)
      }
      add(sphere(0.02), tie, 0, 0.03 - 7 * 0.055 + 0.02, -0.13)
      break
    }
    case 'curls':
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        add(sphere(0.037 - i * 0.004), i % 2 ? dark : mat, s * (0.105 + (i % 2) * 0.02), 0.03 - i * 0.06, -0.035 - i * 0.01)
      }
      add(sphere(0.04), dark, 0, -0.02, -0.11)
      break
  }
  return { group: g, showStrands: false }
}

export function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose()
  })
  g.removeFromParent()
}
