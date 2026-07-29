import type { LogoRef } from './types'

export type InlineLogo = Extract<LogoRef, { kind: 'inline' }>

/** Read a local vector PDF/SVG or raster PNG/JPG into the document. */
export async function readInlineLogoFromFile(file: File): Promise<InlineLogo> {
  const lower = file.name.toLowerCase()
  const ok =
    lower.endsWith('.pdf') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    /^(application\/pdf|image\/(svg\+xml|png|jpeg))$/i.test(file.type)
  if (!ok) {
    throw new Error('Use a vector PDF/SVG or a PNG/JPG logo file.')
  }

  const isPdf =
    lower.endsWith('.pdf') || file.type.toLowerCase() === 'application/pdf'
  const isSvg =
    lower.endsWith('.svg') || file.type.toLowerCase() === 'image/svg+xml'

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsDataURL(file)
  })

  let aspectRatio = 1
  if (!isPdf) {
    aspectRatio = await new Promise<number>((resolve) => {
      const img = new Image()
      img.onload = () =>
        resolve(img.naturalWidth / Math.max(img.naturalHeight, 1))
      img.onerror = () => resolve(1)
      img.src = data
    })
  }

  return {
    kind: 'inline',
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    mime: file.type || (isPdf ? 'application/pdf' : 'image/*'),
    data,
    aspectRatio,
    cmykPreserving: isPdf,
    sourceFormat: isPdf ? 'pdf' : isSvg ? 'svg' : 'raster',
  }
}

export function inlineLogoToAssetRef(logo: InlineLogo) {
  return {
    id: logo.id,
    path: logo.data,
    label: logo.name,
    name: logo.name,
    aspectRatio: logo.aspectRatio,
    mime: logo.mime,
    colorSpace: logo.cmykPreserving ? ('cmyk' as const) : ('unknown' as const),
  }
}
