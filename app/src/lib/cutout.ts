import { removeBackground, preload, type Config } from '@imgly/background-removal'

const config: Config = {
  model: 'isnet_quint8',
  output: { format: 'image/png', quality: 0.9 },
}

let warmed = false
export function warmUp() {
  if (warmed) return
  warmed = true
  preload(config).catch(() => { warmed = false })
}

export async function downscale(file: Blob, maxSide = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // JPEG has no transparency: paint white first so a see-through shop photo does not turn black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9))
}

export async function makeCutout(photo: Blob, onProgress?: (p: number) => void): Promise<Blob> {
  return removeBackground(photo, {
    ...config,
    progress: (_key, current, total) => onProgress?.(total ? current / total : 0),
  })
}
