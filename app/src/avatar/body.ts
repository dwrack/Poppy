import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM, type MToonMaterial } from '@pixiv/three-vrm'
import type { AvatarLook } from '../types'
import { eyeHex, hairHex, shadeOf, skinHex, tintFactor } from './palette'

/**
 * The base body. One VRM 1.0 girl (see public/avatar/LICENSE.txt), about
 * 1.60 m tall. Everything the app changes about her happens at runtime on
 * the loaded copy: skin, hair, eyes, clothing tints, extra meshes on bones.
 * Swap the file and the code path stays the same.
 */
export const BASE_URL = `${import.meta.env.BASE_URL}avatar/poppy-base.vrm`
/** Height of the base model in inches, used to scale from her real height. */
export const BASE_HEIGHT_IN = 63

/** Average texture colours of the base model, measured once. Tints are relative to these. */
const BASE = { bodySkin: '#eedacb', faceSkin: '#f8e5d7', hair: '#6c4a39', iris: '#8a5a32' }

/** Which painted material is what. Matched by name so a different VRM only needs this table. */
export const MATERIAL_ROLE: Record<string, 'skin' | 'face' | 'hair' | 'hairBack' | 'iris' | 'top' | 'bottom' | 'shoes'> = {
  Body_00_SKIN: 'skin', Face_00_SKIN: 'face', Hair_00_HAIR: 'hair', HairBack_00_HAIR: 'hairBack', EyeIris_00_EYE: 'iris',
  Tops_01_CLOTH: 'top', Bottoms_01_CLOTH: 'bottom', Shoes_01_CLOTH: 'shoes',
}

let bytes: Promise<ArrayBuffer> | null = null

/** Fetch once per page load, parse per mount. GPU resources are disposed on unmount; the 5 MB stays in memory. */
function fetchBase() {
  if (!bytes) {
    bytes = fetch(BASE_URL).then((r) => { if (!r.ok) throw new Error(`avatar download failed: ${r.status}`); return r.arrayBuffer() })
    bytes.catch(() => { bytes = null })
  }
  return bytes
}

export type Role = (typeof MATERIAL_ROLE)[string]
export type Paintable = MToonMaterial | THREE.MeshStandardMaterial

export interface Body {
  vrm: VRM
  /** material role -> every material with that name (MToon adds an outline copy per material) */
  mats: Partial<Record<Role, Paintable[]>>
  /** material role -> the meshes that wear it, so a whole piece (the long back hair) can be hidden */
  meshes: Partial<Record<Role, THREE.Mesh[]>>
  /** original maps, so solid tints can be undone when a slot is cleared */
  originalMaps: Map<THREE.Material, THREE.Texture | null>
  restHipsY: number
}

export async function loadBody(): Promise<Body> {
  const buf = await fetchBase()
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }))
  const gltf = await loader.parseAsync(buf.slice(0), '')
  const vrm = gltf.userData.vrm as VRM
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.combineMorphs(vrm)
  vrm.scene.traverse((o) => { o.frustumCulled = false })

  const body: Body = { vrm, mats: {}, meshes: {}, originalMaps: new Map(), restHipsY: 0 }
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const role = MATERIAL_ROLE[mat.name]
      if (!role) continue
      const mm = mat as MToonMaterial
      ;(body.mats[role] ??= []).push(mm)
      ;(body.meshes[role] ??= []).push(m)
      body.originalMaps.set(mm, mm.map ?? null)
    }
  })
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')
  body.restHipsY = hips?.position.y ?? 0.9
  return body
}

export function disposeBody(body: Body) {
  VRMUtils.deepDispose(body.vrm.scene)
}

/** Skin tone, hair colour, eye colour, and the resting face. */
export function applyLook(body: Body, look: AvatarLook) {
  const { mats, vrm } = body
  const skin = skinHex(look.skin)
  tint(body, mats.skin, tintFactor(skin, BASE.bodySkin, 1.15), shadeOf(skin, 0.78))
  tint(body, mats.face, tintFactor(skin, BASE.faceSkin, 1.15), shadeOf(skin, 0.8))
  // Hair: multiply the painted strands when the colour is reachable from brown; go flat for blonde, pink, blue.
  const hair = hairHex(look.hairColour)
  const hf = tintFactor(hair, BASE.hair, 2.2)
  const flat = Math.max(hf.r, hf.g, hf.b) >= 2.19
  tint(body, mats.hair, flat ? new THREE.Color(hair) : hf, shadeOf(hair, 0.62), flat)
  tint(body, mats.hairBack, flat ? new THREE.Color(hair) : hf, shadeOf(hair, 0.62), flat)
  const eye = eyeHex(look.eyes)
  tint(body, mats.iris, tintFactor(eye, BASE.iris, 3.2), shadeOf(eye, 0.6))

  const em = vrm.expressionManager
  if (em) {
    for (const n of ['happy', 'relaxed', 'surprised', 'neutral', 'sad', 'angry']) em.setValue(n, 0)
    if (look.face === 'sweet') em.setValue('relaxed', 0.3)
    if (look.face === 'sunny') em.setValue('happy', 0.65)
    if (look.face === 'chill') em.setValue('relaxed', 0.95)
    if (look.face === 'wow') em.setValue('surprised', 0.7)
  }
}

function tint(body: Body, mats: Paintable[] | undefined, color: THREE.Color, shade: THREE.Color, flat = false) {
  for (const mat of mats ?? []) {
    mat.map = flat ? null : body.originalMaps.get(mat) ?? null
    mat.color.copy(color)
    if ('shadeColorFactor' in mat) mat.shadeColorFactor.copy(shade)
    mat.needsUpdate = true
  }
}

export function setVisible(body: Body, role: Role, on: boolean) {
  for (const m of body.meshes[role] ?? []) m.visible = on
}
