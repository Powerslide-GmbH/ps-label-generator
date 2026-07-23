import UTIF from 'utif'

export async function decodeImageFile(file: File | Blob): Promise<HTMLCanvasElement> {
  const name = 'name' in file ? file.name.toLowerCase() : ''
  const type = file.type.toLowerCase()
  const isTiff =
    name.endsWith('.tif') ||
    name.endsWith('.tiff') ||
    type.includes('tif')

  if (isTiff) {
    const buf = await file.arrayBuffer()
    const ifds = UTIF.decode(buf)
    UTIF.decodeImage(buf, ifds[0])
    const rgba = UTIF.toRGBA8(ifds[0])
    const canvas = document.createElement('canvas')
    canvas.width = ifds[0].width
    canvas.height = ifds[0].height
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(canvas.width, canvas.height)
    img.data.set(rgba)
    ctx.putImageData(img, 0, 0)
    return canvas
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await loadHtmlImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

export async function urlToCanvas(url: string): Promise<HTMLCanvasElement> {
  if (url.toLowerCase().match(/\.tiff?($|\?)/)) {
    const res = await fetch(url)
    const blob = await res.blob()
    return decodeImageFile(blob)
  }
  const img = await loadHtmlImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return canvas
}

export function canvasToSquare(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const size = Math.max(canvas.width, canvas.height)
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  const x = (size - canvas.width) / 2
  const y = (size - canvas.height) / 2
  ctx.drawImage(canvas, x, y)
  return out
}
