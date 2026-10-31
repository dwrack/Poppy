import { lazy } from 'react'

/**
 * Everything three.js lives behind these two imports, so the Closet tab's
 * first paint never downloads the avatar chunk. Vite splits it on its own;
 * vite.config.ts also pins the three/drei/vrm vendors to one named chunk.
 */
export const LazyDressMe = lazy(() => import('../avatar/DressMe'))
export const LazyAvatarScene = lazy(() => import('../avatar/AvatarScene'))
