import { lazy } from 'react'

/**
 * Everything three.js lives behind these two imports, so the Closet tab's
 * first paint never downloads the avatar chunk. Vite splits it on its own;
 * vite.config.ts also pins the three/drei/vrm vendors to one named chunk.
 */
export const LazyDressMe = lazy(() => import('../avatar/DressMe'))
export const LazyAvatarScene = lazy(() => import('../avatar/AvatarScene'))

let gl: boolean | undefined
/** Can this phone do WebGL at all? Checked once; without it the cutout stack stays and the avatar chunk is never downloaded. */
export function webglOk() {
  if (gl === undefined) {
    try {
      const c = document.createElement('canvas')
      gl = !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch { gl = false }
  }
  return gl
}
