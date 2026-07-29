/** Device-CMYK conversion helpers used by the browser PDF exporter.
 *
 * Loading an ICC file alone does not perform a colour transform. A real FOGRA39
 * conversion still needs a colour-management engine such as LittleCMS.
 */

import type { Cmyk } from '@/domain/types'

export type BrandCmykMapping = {
  hex: string
  cmyk: Cmyk
}

export function rgbToCmykApprox(r: number, g: number, b: number): Cmyk {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const k = 1 - Math.max(R, G, B)
  if (k >= 0.999) return { c: 0, m: 0, y: 0, k: 1 }
  const c = (1 - R - k) / (1 - k)
  const m = (1 - G - k) / (1 - k)
  const y = (1 - B - k) / (1 - k)
  return { c, m, y, k }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Display-only inverse used by the on-screen Device-CMYK simulation. */
export function cmykToHex({ c, m, y, k }: Cmyk): string {
  const channel = (ink: number) =>
    Math.round(255 * (1 - Math.max(0, Math.min(1, ink))) * (1 - Math.max(0, Math.min(1, k))))
  return `#${[channel(c), channel(m), channel(y)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

export async function loadIccProfile(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * Convert interleaved ImageData RGB(A) pixels to interleaved CMYK bytes.
 * `kOnly` is used by monochrome size labels, keeping C/M/Y at zero.
 */
export function imageDataToCmykBytes(
  imageData: ImageData,
  kOnly = false,
  brand?: BrandCmykMapping,
): Uint8Array {
  const { data, width, height } = imageData
  const out = new Uint8Array(width * height * 4)
  const brandRgb = brand ? hexToRgb(brand.hex) : null
  for (let i = 0, p = 0; i < data.length; i += 4, p += 4) {
    if (kOnly) {
      const luminance =
        (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) /
        255
      out[p] = 0
      out[p + 1] = 0
      out[p + 2] = 0
      out[p + 3] = Math.round((1 - luminance) * 255)
      continue
    }
    const isBrandPixel =
      brandRgb &&
      Math.abs(data[i] - brandRgb.r) <= 2 &&
      Math.abs(data[i + 1] - brandRgb.g) <= 2 &&
      Math.abs(data[i + 2] - brandRgb.b) <= 2
    const cmyk =
      isBrandPixel && brand
        ? brand.cmyk
        : rgbToCmykApprox(data[i], data[i + 1], data[i + 2])
    out[p] = Math.round(cmyk.c * 255)
    out[p + 1] = Math.round(cmyk.m * 255)
    out[p + 2] = Math.round(cmyk.y * 255)
    out[p + 3] = Math.round(cmyk.k * 255)
  }
  return out
}

export async function rasterToRgbCanvas(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  maxEdge = 1600,
): Promise<HTMLCanvasElement> {
  const w = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width
  const h =
    'naturalHeight' in source ? source.naturalHeight || source.height : source.height
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}
