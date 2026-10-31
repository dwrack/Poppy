import * as THREE from 'three'
import {
  AVATAR_EYES, AVATAR_HAIR_COLOURS, AVATAR_SKINS, type AvatarEye, type AvatarHairColour, type AvatarSkin, type Colour, type Garment,
} from '../types'

/** Closet colour words to something the avatar can wear. */
export const COLOUR_HEX: Record<Colour, string> = {
  black: '#232323', white: '#f6f4f0', grey: '#9a9a9a', navy: '#22304f', blue: '#3b6fd1', denim: '#4a6fa0',
  green: '#3d8a4f', olive: '#6f7a3a', brown: '#6b4a2e', tan: '#c9a77c', cream: '#f3e8d2', red: '#cf3a3a',
  pink: '#f08cb8', orange: '#ef8a3a', yellow: '#f2d048', purple: '#7b4fb3', multi: '#e76f51',
}

/** Primary fill and secondary trim for a garment. "multi" alone becomes a two-colour pair. */
export function garmentColours(g: Garment): { primary: string; secondary: string } {
  const named = g.colours.filter((c) => c !== 'multi')
  const primary = COLOUR_HEX[named[0] ?? g.colours[0] ?? 'grey']
  let secondary = named[1] ? COLOUR_HEX[named[1]] : undefined
  if (!secondary) {
    if (g.colours.includes('multi')) secondary = named[0] ? '#2a9d8f' : '#2a9d8f'
    else secondary = contrastTrim(primary)
  }
  return { primary, secondary }
}

/** A trim that reads against the fill: lighter for dark fills, darker for light ones. */
export function contrastTrim(hex: string) {
  const c = new THREE.Color(hex)
  const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
  return l > 0.55 ? '#' + c.clone().multiplyScalar(0.55).getHexString() : '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.45).getHexString()
}

export const skinHex = (id: AvatarSkin) => AVATAR_SKINS.find((s) => s.id === id)?.hex ?? AVATAR_SKINS[1].hex
export const hairHex = (id: AvatarHairColour) => AVATAR_HAIR_COLOURS.find((s) => s.id === id)?.hex ?? AVATAR_HAIR_COLOURS[2].hex
export const eyeHex = (id: AvatarEye) => AVATAR_EYES.find((s) => s.id === id)?.hex ?? AVATAR_EYES[0].hex

/**
 * Multiplier that turns a texture whose average colour is `base` into `target`.
 * MToon multiplies the texture by `color`, so this is how skin, hair and eyes
 * are recoloured without touching the painted detail. Capped so highlights
 * don't blow out.
 */
export function tintFactor(target: string, base: string, cap = 2.6): THREE.Color {
  const t = new THREE.Color(target), b = new THREE.Color(base)
  return new THREE.Color(Math.min(cap, t.r / Math.max(b.r, 0.02)), Math.min(cap, t.g / Math.max(b.g, 0.02)), Math.min(cap, t.b / Math.max(b.b, 0.02)))
}

export function shadeOf(hex: string, k = 0.72) {
  return new THREE.Color(hex).multiplyScalar(k)
}
