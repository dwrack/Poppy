import * as THREE from 'three'
import type { Pattern } from '../types'

const SIZE = 512
const cache = new Map<string, THREE.CanvasTexture>()

/**
 * Small procedural fabric prints drawn on a canvas. 512px, tiled, never
 * larger than the 1024 iPhone limit. Cached by (pattern, colours) and
 * released with disposeTextures() when the avatar unmounts.
 */
export function patternTexture(pattern: Pattern, primary: string, secondary: string): THREE.CanvasTexture {
  const key = `${pattern}|${primary}|${secondary}`
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  draw(ctx, pattern, primary, secondary)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false // glTF convention, so the same texture works on VRM materials
  tex.anisotropy = 2
  cache.set(key, tex)
  return tex
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose()
  cache.clear()
}

function draw(ctx: CanvasRenderingContext2D, pattern: Pattern, a: string, b: string) {
  ctx.fillStyle = a
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = b
  switch (pattern) {
    case 'stripe': {
      const n = 8, h = SIZE / n
      for (let i = 0; i < n; i += 2) ctx.fillRect(0, i * h, SIZE, h * 0.9)
      break
    }
    case 'check': {
      ctx.globalAlpha = 0.55
      const n = 4, w = SIZE / n
      for (let i = 0; i < n; i += 2) { ctx.fillRect(i * w, 0, w * 0.7, SIZE); ctx.fillRect(0, i * w, SIZE, w * 0.7) }
      ctx.globalAlpha = 0.9
      for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) ctx.fillRect(i * w, j * w, w * 0.7, w * 0.7)
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = b; ctx.lineWidth = 6
      for (let i = 1; i < n; i += 2) { line(ctx, i * w + w * 0.35, 0, i * w + w * 0.35, SIZE); line(ctx, 0, i * w + w * 0.35, SIZE, i * w + w * 0.35) }
      ctx.globalAlpha = 1
      break
    }
    case 'floral': {
      const rnd = mulberry(7)
      for (let i = 0; i < 26; i++) {
        const x = rnd() * SIZE, y = rnd() * SIZE, r = 14 + rnd() * 14
        flower(ctx, x, y, r, b, a)
        // tile-safe copies near edges
        if (x < 40) flower(ctx, x + SIZE, y, r, b, a)
        if (y < 40) flower(ctx, x, y + SIZE, r, b, a)
        if (x > SIZE - 40) flower(ctx, x - SIZE, y, r, b, a)
        if (y > SIZE - 40) flower(ctx, x, y - SIZE, r, b, a)
      }
      break
    }
    case 'print': {
      // polka dots, offset rows
      const step = SIZE / 6, r = step * 0.22
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
        const x = i * step + (j % 2 ? step / 2 : 0) + step / 2, y = j * step + step / 2
        dot(ctx, x, y, r); if (x > SIZE - r) dot(ctx, x - SIZE, y, r)
      }
      break
    }
    case 'texture': {
      // soft knit: diagonal hatching in a slightly different tone
      ctx.globalAlpha = 0.22
      ctx.strokeStyle = b; ctx.lineWidth = 4
      for (let i = -SIZE; i < SIZE * 2; i += 20) line(ctx, i, 0, i + SIZE, SIZE)
      ctx.globalAlpha = 0.12
      for (let i = -SIZE; i < SIZE * 2; i += 20) line(ctx, i, SIZE, i + SIZE, 0)
      ctx.globalAlpha = 1
      break
    }
    default: break // solid: fill only
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
}
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, centre: string) {
  ctx.fillStyle = petal
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    dot(ctx, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42)
  }
  ctx.fillStyle = '#ffe8b6'
  dot(ctx, x, y, r * 0.28)
  ctx.fillStyle = centre
}
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
