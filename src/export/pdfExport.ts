import {
  PDFDocument,
  cmyk,
  degrees,
  type PDFFont,
  type PDFPage,
  type RGB,
  type CMYK,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { LabelDocument, PdfFontMode, BoxTextColorMode } from '@/domain/types'
import type { LabelScene, SceneNode } from '@/templates/scenes'
import { MM_TO_PT, PURE_BLACK, BOX_SHEET_MM } from '@/domain/types'
import { urlToCanvas } from './imageDecode'

/** fontkit glyph path (runtime has scale/translate beyond the published d.ts). */
type FkPath = {
  toSVG: () => string
  translate: (x: number, y: number) => FkPath
  scale: (x: number, y: number) => FkPath
}

type FontkitFont = {
  unitsPerEm: number
  layout: (text: string) => {
    glyphs: { path: FkPath }[]
    positions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[]
    advanceWidth: number
  }
}

export type PdfColorMode = 'k-only' | 'cmyk'

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}`)
  return res.arrayBuffer()
}

/** Near-black / dark greys always become K=100 — never rich black. */
function isNearBlackHex(hexOrBlack: string, luminance: number): boolean {
  const h = hexOrBlack.toLowerCase()
  return (
    h === '#000' ||
    h === '#000000' ||
    h === '#111' ||
    h === '#111111' ||
    h === '#222' ||
    h === '#222222' ||
    luminance < 0.2
  )
}

/**
 * Convert hex fills to PDF color.
 * - `k-only` / `textColorMode: pure-k`: greyscale K channel only.
 * - Dark greys (#111/#222/#000) always map to CMYK(0,0,0,1), never rich black.
 * - Brand hex otherwise converts hex→CMYK.
 */
export function toPdfColor(
  hexOrBlack: string,
  mode: PdfColorMode,
  textColorMode: BoxTextColorMode = 'brand',
): RGB | CMYK {
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
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

  if (luminance > 0.95) return cmyk(0, 0, 0, 0)

  const forcePureK =
    mode === 'k-only' || textColorMode === 'pure-k' || isNearBlackHex(hexOrBlack, luminance)

  if (forcePureK) {
    if (isNearBlackHex(hexOrBlack, luminance)) {
      return cmyk(PURE_BLACK.c, PURE_BLACK.m, PURE_BLACK.y, PURE_BLACK.k)
    }
    return cmyk(0, 0, 0, Math.max(0, Math.min(1, 1 - luminance)))
  }

  const k = 1 - Math.max(r, g, b)
  if (k > 0.99) return cmyk(PURE_BLACK.c, PURE_BLACK.m, PURE_BLACK.y, PURE_BLACK.k)
  return cmyk((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k)
}

function unitScale(scene: LabelScene): number {
  return scene.unit === 'mm' ? MM_TO_PT : 1
}

async function loadGilroyBytes(base = './'): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  try {
    const [regular, bold] = await Promise.all([
      fetchBytes(`${base}content/fonts/Gilroy-Regular.ttf`),
      fetchBytes(`${base}content/fonts/Gilroy-Bold.ttf`),
    ])
    return { regular, bold }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Gilroy fonts are required for label PDF export (failed to load from ${base}content/fonts/). ${msg}`,
    )
  }
}

function createFkFont(bytes: ArrayBuffer): FontkitFont {
  return fontkit.create(new Uint8Array(bytes)) as FontkitFont
}

function fkTextWidth(font: FontkitFont, text: string, size: number): number {
  const run = font.layout(text)
  return (run.advanceWidth / font.unitsPerEm) * size
}

/**
 * Outline Gilroy glyphs via fontkit and draw with drawSvgPath.
 * Font design coords are Y-up; drawSvgPath expects SVG Y-down and flips Y,
 * so we scale(1, -1) on the path first. Glyph advances are baked into the
 * path so rotation applies around the run origin (matches drawText).
 */
function drawOutlinedText(
  page: PDFPage,
  text: string,
  font: FontkitFont,
  x: number,
  y: number,
  size: number,
  color: CMYK | RGB,
  rotateDeg?: number,
) {
  if (!text) return
  const scale = size / font.unitsPerEm
  const run = font.layout(text)
  let cursor = 0
  const rotation = rotateDeg ? degrees(rotateDeg) : undefined
  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i]
    const pos = run.positions[i]
    const svg = glyph.path
      .translate(cursor + pos.xOffset, pos.yOffset)
      .scale(1, -1)
      .toSVG()
    if (svg) {
      try {
        page.drawSvgPath(svg, {
          x,
          y,
          scale,
          color,
          rotate: rotation,
          borderWidth: 0,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Failed to outline Gilroy glyph for PDF export: ${msg}`)
      }
    }
    cursor += pos.xAdvance
  }
}

type DrawFonts = {
  pdfFontMode: PdfFontMode
  fkRegular: FontkitFont
  fkBold: FontkitFont
  /** Present only in editable mode (embedded, unsubsetted). */
  pdfRegular?: PDFFont
  pdfBold?: PDFFont
}

function drawNodes(
  page: PDFPage,
  nodes: SceneNode[],
  scale: number,
  fonts: DrawFonts,
  mode: PdfColorMode,
  textColorMode: BoxTextColorMode,
  images: Map<
    string,
    { width: number; height: number; draw: (x: number, y: number, w: number, h: number) => void }
  >,
  pageH: number,
) {
  const Y = (y: number, h = 0) => pageH - (y + h) * scale

  for (const node of nodes) {
    if (node.type === 'rect') {
      const color =
        node.fill && node.fill !== 'none'
          ? toPdfColor(node.fill, mode, textColorMode)
          : undefined
      const stroke =
        node.stroke && node.stroke !== 'none'
          ? toPdfColor(node.stroke, mode, textColorMode)
          : undefined
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
        color: toPdfColor(node.stroke, mode, textColorMode) as CMYK | RGB,
        dashArray: node.dash
          ? node.dash.split(/\s+/).map((n) => parseFloat(n) * scale)
          : undefined,
      })
    } else if (node.type === 'text') {
      let x = node.x * scale
      const fontSizeBase = node.runs[0]?.fontSize ?? 10
      const y = Y(node.y) - fontSizeBase * scale * 0.15
      let totalW = 0
      for (const run of node.runs) {
        const fk = run.bold ? fonts.fkBold : fonts.fkRegular
        const size = (run.fontSize ?? 10) * scale
        if (fonts.pdfFontMode === 'editable' && fonts.pdfRegular && fonts.pdfBold) {
          const pdfFont = run.bold ? fonts.pdfBold : fonts.pdfRegular
          totalW += pdfFont.widthOfTextAtSize(run.text, size)
        } else {
          totalW += fkTextWidth(fk, run.text, size)
        }
      }
      if (node.anchor === 'middle') x -= totalW / 2
      if (node.anchor === 'end') x -= totalW
      let cx = x
      for (const run of node.runs) {
        const fk = run.bold ? fonts.fkBold : fonts.fkRegular
        const size = (run.fontSize ?? 10) * scale
        const color = toPdfColor(node.fill, mode, textColorMode) as CMYK | RGB
        if (fonts.pdfFontMode === 'editable' && fonts.pdfRegular && fonts.pdfBold) {
          const pdfFont = run.bold ? fonts.pdfBold : fonts.pdfRegular
          page.drawText(run.text, {
            x: cx,
            y,
            size,
            font: pdfFont,
            color,
            rotate: node.rotate ? degrees(node.rotate) : undefined,
          })
          cx += pdfFont.widthOfTextAtSize(run.text, size)
        } else {
          drawOutlinedText(page, run.text, fk, cx, y, size, color, node.rotate)
          cx += fkTextWidth(fk, run.text, size)
        }
      }
    } else if (node.type === 'image') {
      const img = images.get(node.href)
      if (!img) continue
      const boxX = node.x * scale
      const boxY = Y(node.y, node.h)
      const boxW = node.w * scale
      const boxH = node.h * scale
      const imageRatio = img.width / img.height
      const boxRatio = boxW / boxH
      const drawW = imageRatio > boxRatio ? boxW : boxH * imageRatio
      const drawH = imageRatio > boxRatio ? boxW / imageRatio : boxH
      img.draw(boxX + (boxW - drawW) / 2, boxY + (boxH - drawH) / 2, drawW, drawH)
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

function isPdfHref(href: string): boolean {
  if (/^data:application\/pdf/i.test(href)) return true
  const clean = href.split('?')[0]?.split('#')[0]?.toLowerCase() ?? ''
  return clean.endsWith('.pdf')
}

export async function sceneToPdfBytes(
  scene: LabelScene,
  opts: {
    mode: PdfColorMode
    baseUrl?: string
    pdfFontMode?: PdfFontMode
    textColorMode?: BoxTextColorMode
  },
): Promise<Uint8Array> {
  const base = opts.baseUrl ?? './'
  const pdfFontMode: PdfFontMode = opts.pdfFontMode ?? 'outlined'
  const textColorMode: BoxTextColorMode = opts.textColorMode ?? 'brand'
  const pdf = await PDFDocument.create()

  const { regular, bold } = await loadGilroyBytes(base)
  let fkRegular: FontkitFont
  let fkBold: FontkitFont
  try {
    fkRegular = createFkFont(regular)
    fkBold = createFkFont(bold)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse Gilroy fonts for PDF export: ${msg}`)
  }

  const fonts: DrawFonts = {
    pdfFontMode,
    fkRegular,
    fkBold,
  }

  if (pdfFontMode === 'editable') {
    pdf.registerFontkit(fontkit as never)
    try {
      fonts.pdfRegular = await pdf.embedFont(regular, { subset: false })
      fonts.pdfBold = await pdf.embedFont(bold, { subset: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to embed Gilroy fonts for editable PDF export: ${msg}`)
    }
  }

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
      if (isPdfHref(node.href)) {
        // Preserve CMYK (and vectors) from PDF logos via page embed.
        const pdfBytes = await fetchBytes(node.href)
        const [embedded] = await pdf.embedPdf(pdfBytes, [0])
        images.set(node.href, {
          width: embedded.width,
          height: embedded.height,
          draw: (x, y, w, h) => page.drawPage(embedded, { x, y, width: w, height: h }),
        })
      } else {
        // PNG/JPG/SVG via canvas rasterization — CMYK is not guaranteed for these embeds.
        const canvas = await urlToCanvas(node.href)
        const png = await canvasToPng(canvas)
        const embedded = await pdf.embedPng(png)
        images.set(node.href, {
          width: embedded.width,
          height: embedded.height,
          draw: (x, y, w, h) => page.drawImage(embedded, { x, y, width: w, height: h }),
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

  drawNodes(page, nodes, scale, fonts, opts.mode, textColorMode, images, pageH)
  return pdf.save()
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('toBlob failed'))
        resolve(await blob.arrayBuffer())
      },
      'image/png',
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
  scenes: {
    key: string
    scene: LabelScene
    filename: string
    pdfMode?: PdfColorMode
    pdfFontMode?: PdfFontMode
    textColorMode?: BoxTextColorMode
  }[]
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
        pdfFontMode: entry.pdfFontMode ?? args.doc.pdfFontMode ?? 'outlined',
        textColorMode:
          entry.textColorMode ??
          (entry.scene.kind === 'box' ? args.doc.boxTextColorMode : 'pure-k'),
      })
      items.push({ filename: entry.filename, bytes })
    }
  }
  return items
}
