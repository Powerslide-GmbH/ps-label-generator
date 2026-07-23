import {
  PDFDocument,
  StandardFonts,
  cmyk,
  degrees,
  type PDFFont,
  type PDFPage,
  type RGB,
  type CMYK,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { LabelDocument } from '@/domain/types'
import type { LabelScene, SceneNode } from '@/templates/scenes'
import { MM_TO_PT, PURE_BLACK, DEFAULT_RICH_BLACK, BOX_SHEET_MM } from '@/domain/types'
import { urlToCanvas, canvasToSquare } from './imageDecode'

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}`)
  return res.arrayBuffer()
}

function toPdfColor(hexOrBlack: string, mode: 'k-only' | 'cmyk'): RGB | CMYK {
  if (mode === 'k-only') return cmyk(0, 0, 0, 1)
  if (
    hexOrBlack === '#000' ||
    hexOrBlack === '#000000' ||
    hexOrBlack === '#111' ||
    hexOrBlack === '#222'
  ) {
    return cmyk(
      DEFAULT_RICH_BLACK.c,
      DEFAULT_RICH_BLACK.m,
      DEFAULT_RICH_BLACK.y,
      DEFAULT_RICH_BLACK.k,
    )
  }
  const h = hexOrBlack.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full || '000000', 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const k = 1 - Math.max(r, g, b)
  if (k > 0.99) return cmyk(PURE_BLACK.c, PURE_BLACK.m, PURE_BLACK.y, PURE_BLACK.k)
  return cmyk((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k)
}

function unitScale(scene: LabelScene): number {
  return scene.unit === 'mm' ? MM_TO_PT : 1
}

async function embedGilroy(pdf: PDFDocument, base = './') {
  pdf.registerFontkit(fontkit as never)
  const [regular, bold] = await Promise.all([
    fetchBytes(`${base}content/fonts/Gilroy-Regular.ttf`),
    fetchBytes(`${base}content/fonts/Gilroy-Bold.ttf`),
  ])
  const fontRegular = await pdf.embedFont(regular, { subset: true })
  const fontBold = await pdf.embedFont(bold, { subset: true })
  return { fontRegular, fontBold }
}

function drawNodes(
  page: PDFPage,
  nodes: SceneNode[],
  scale: number,
  fonts: { fontRegular: PDFFont; fontBold: PDFFont },
  mode: 'k-only' | 'cmyk',
  images: Map<string, { width: number; height: number; draw: (x: number, y: number, w: number, h: number) => void }>,
  pageH: number,
) {
  const Y = (y: number, h = 0) => pageH - (y + h) * scale

  for (const node of nodes) {
    if (node.type === 'rect') {
      const color = node.fill && node.fill !== 'none' ? toPdfColor(node.fill, mode) : undefined
      const stroke = node.stroke && node.stroke !== 'none' ? toPdfColor(node.stroke, mode) : undefined
      page.drawRectangle({
        x: node.x * scale,
        y: Y(node.y, node.h),
        width: node.w * scale,
        height: node.h * scale,
        color: color as CMYK | RGB | undefined,
        borderColor: stroke as CMYK | RGB | undefined,
        borderWidth: (node.strokeWidth ?? 0) * scale,
      })
    } else if (node.type === 'line') {
      page.drawLine({
        start: { x: node.x1 * scale, y: Y(node.y1) },
        end: { x: node.x2 * scale, y: Y(node.y2) },
        thickness: (node.strokeWidth ?? 0.5) * scale,
        color: toPdfColor(node.stroke, mode) as CMYK | RGB,
        dashArray: node.dash
          ? node.dash.split(/\s+/).map((n) => parseFloat(n) * scale)
          : undefined,
      })
    } else if (node.type === 'text') {
      let x = node.x * scale
      const fontSizeBase = node.runs[0]?.fontSize ?? 10
      const y = Y(node.y) - fontSizeBase * scale * 0.15
      // approximate anchor by measuring
      let totalW = 0
      for (const run of node.runs) {
        const font = run.bold ? fonts.fontBold : fonts.fontRegular
        const size = (run.fontSize ?? 10) * scale
        totalW += font.widthOfTextAtSize(run.text, size)
      }
      if (node.anchor === 'middle') x -= totalW / 2
      if (node.anchor === 'end') x -= totalW
      let cx = x
      for (const run of node.runs) {
        const font = run.bold ? fonts.fontBold : fonts.fontRegular
        const size = (run.fontSize ?? 10) * scale
        page.drawText(run.text, {
          x: cx,
          y,
          size,
          font,
          color: toPdfColor(node.fill, mode) as CMYK | RGB,
          rotate: node.rotate ? degrees(node.rotate) : undefined,
        })
        cx += font.widthOfTextAtSize(run.text, size)
      }
    } else if (node.type === 'image') {
      const img = images.get(node.href)
      if (!img) continue
      img.draw(node.x * scale, Y(node.y, node.h), node.w * scale, node.h * scale)
    }
  }
}

function offsetNodes(nodes: SceneNode[], dx: number, dy: number): SceneNode[] {
  return nodes.map((node) => {
    if (node.type === 'rect' || node.type === 'image' || node.type === 'text') {
      return { ...node, x: node.x + dx, y: node.y + dy }
    }
    if (node.type === 'line') {
      return {
        ...node,
        x1: node.x1 + dx,
        y1: node.y1 + dy,
        x2: node.x2 + dx,
        y2: node.y2 + dy,
      }
    }
    return node
  })
}

export async function sceneToPdfBytes(
  scene: LabelScene,
  opts: {
    mode: 'k-only' | 'cmyk'
    baseUrl?: string
  },
): Promise<Uint8Array> {
  const base = opts.baseUrl ?? './'
  const pdf = await PDFDocument.create()
  const fonts = await embedGilroy(pdf, base).catch(async () => {
    const fontRegular = await pdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
    return { fontRegular, fontBold }
  })

  const scale = unitScale(scene)
  // Box label draws at 140×120; pad to production sheet size for print
  const padBox = scene.kind === 'box' && scene.unit === 'mm'
  const sheetW = padBox ? BOX_SHEET_MM.w : scene.width
  const sheetH = padBox ? BOX_SHEET_MM.h : scene.height
  const padX = padBox ? (BOX_SHEET_MM.w - scene.width) / 2 : 0
  const padY = padBox ? (BOX_SHEET_MM.h - scene.height) / 2 : 0
  const nodes = padBox ? offsetNodes(scene.nodes, padX, padY) : scene.nodes
  const pageW = sheetW * scale
  const pageH = sheetH * scale
  const page = pdf.addPage([pageW, pageH])

  const images = new Map<
    string,
    {
      width: number
      height: number
      draw: (x: number, y: number, w: number, h: number) => void
    }
  >()

  for (const node of nodes) {
    if (node.type !== 'image' || images.has(node.href)) continue
    try {
      if (node.href.match(/\.(svg)($|\?)/i)) {
        // rasterize SVG via Image
        const canvas = await urlToCanvas(node.href)
        const jpeg = await canvasToJpeg(canvas)
        const embedded = await pdf.embedJpg(jpeg)
        images.set(node.href, {
          width: embedded.width,
          height: embedded.height,
          draw: (x, y, w, h) =>
            page.drawImage(embedded, { x, y, width: w, height: h }),
        })
      } else {
        const canvas = canvasToSquare(await urlToCanvas(node.href))
        const jpeg = await canvasToJpeg(canvas)
        const embedded = await pdf.embedJpg(jpeg)
        images.set(node.href, {
          width: embedded.width,
          height: embedded.height,
          draw: (x, y, w, h) =>
            page.drawImage(embedded, { x, y, width: w, height: h }),
        })
      }
    } catch {
      // skip missing images
    }
  }

  // White sheet background for padded box pages
  if (padBox) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageW,
      height: pageH,
      color: cmyk(0, 0, 0, 0) as CMYK,
    })
  }

  drawNodes(page, nodes, scale, fonts, opts.mode, images, pageH)
  return pdf.save()
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('toBlob failed'))
        resolve(await blob.arrayBuffer())
      },
      'image/jpeg',
      quality,
    )
  })
}

export async function exportSizeChartImage(
  scene: LabelScene,
  format: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw via temporary SVG serialization
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('width', String(scene.width))
  svg.setAttribute('height', String(scene.height))
  svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`)

  // Use foreignObject-free path: paint nodes manually
  for (const node of scene.nodes) {
    if (node.type === 'rect') {
      ctx.fillStyle = node.fill && node.fill !== 'none' ? node.fill : 'transparent'
      if (node.fill && node.fill !== 'none') {
        roundRect(ctx, node.x, node.y, node.w, node.h, node.radius ?? 0)
        ctx.fill()
      }
      if (node.stroke && node.stroke !== 'none') {
        ctx.strokeStyle = node.stroke
        ctx.lineWidth = node.strokeWidth ?? 1
        roundRect(ctx, node.x, node.y, node.w, node.h, node.radius ?? 0)
        ctx.stroke()
      }
    } else if (node.type === 'line') {
      ctx.beginPath()
      ctx.strokeStyle = node.stroke
      ctx.lineWidth = node.strokeWidth ?? 1
      if (node.dash) ctx.setLineDash(node.dash.split(/\s+/).map(Number))
      else ctx.setLineDash([])
      ctx.moveTo(node.x1, node.y1)
      ctx.lineTo(node.x2, node.y2)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (node.type === 'text') {
      let x = node.x
      ctx.fillStyle = node.fill
      ctx.textBaseline = 'alphabetic'
      // measure for anchor
      let total = 0
      for (const run of node.runs) {
        ctx.font = `${run.bold ? '700' : '400'} ${run.fontSize ?? 16}px Gilroy, sans-serif`
        total += ctx.measureText(run.text).width
      }
      if (node.anchor === 'middle') x -= total / 2
      if (node.anchor === 'end') x -= total
      for (const run of node.runs) {
        ctx.font = `${run.bold ? '700' : '400'} ${run.fontSize ?? 16}px Gilroy, sans-serif`
        ctx.fillText(run.text, x, node.y)
        x += ctx.measureText(run.text).width
      }
    } else if (node.type === 'image') {
      try {
        const imgCanvas = await urlToCanvas(node.href)
        ctx.drawImage(imgCanvas, node.x, node.y, node.w, node.h)
      } catch {
        /* skip */
      }
    }
  }

  void svg
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('export failed'))),
      format,
      0.85,
    )
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export type ExportBundleItem = {
  filename: string
  bytes: Uint8Array | Blob
}

export async function buildExports(args: {
  doc: LabelDocument
  scenes: { key: string; scene: LabelScene; filename: string; pdfMode?: 'k-only' | 'cmyk' }[]
  baseUrl?: string
}): Promise<ExportBundleItem[]> {
  const items: ExportBundleItem[] = []
  for (const entry of args.scenes) {
    if (entry.scene.kind === 'sizechart') {
      const blob = await exportSizeChartImage(entry.scene, 'image/jpeg')
      items.push({ filename: entry.filename, bytes: blob })
    } else {
      const bytes = await sceneToPdfBytes(entry.scene, {
        mode: entry.pdfMode ?? (entry.scene.kind === 'box' ? 'cmyk' : 'k-only'),
        baseUrl: args.baseUrl,
      })
      items.push({ filename: entry.filename, bytes })
    }
  }
  return items
}
