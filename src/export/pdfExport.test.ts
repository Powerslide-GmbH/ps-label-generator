import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument, cmyk } from 'pdf-lib'
import {
  registerCmykImageXObject,
  roundedRectOperators,
  sceneToPdfBytes,
  toPdfColor,
} from '@/export/pdfExport'
import { imageDataToCmykBytes } from '@/export/cmyk'
import type { LabelScene } from '@/templates/scenes'

const fontsDir = resolve(process.cwd(), 'public/content/fonts')
const regularBytes = readFileSync(resolve(fontsDir, 'Gilroy-Regular.ttf'))
const boldBytes = readFileSync(resolve(fontsDir, 'Gilroy-Bold.ttf'))

function pdfLatin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1')
}

describe('toPdfColor', () => {
  it('maps #111/#222 to pure K, never rich black', () => {
    for (const hex of ['#111', '#222', '#000', '#111111']) {
      expect(toPdfColor(hex, 'cmyk', 'brand')).toEqual(cmyk(0, 0, 0, 1))
    }
  })

  it('forces pure K for dark fills when textColorMode is pure-k', () => {
    expect(toPdfColor('#111', 'cmyk', 'pure-k')).toEqual(cmyk(0, 0, 0, 1))
    expect(toPdfColor('#fff', 'cmyk', 'pure-k')).toEqual(cmyk(0, 0, 0, 0))
  })

  it('uses the configured brand ink recipe instead of deriving it from RGB', () => {
    const brand = { hex: '#416BE0', cmyk: { c: 0.76, m: 0.51, y: 0, k: 0 } }
    expect(toPdfColor('#416BE0', 'cmyk', 'brand', brand)).toEqual(
      cmyk(0.76, 0.51, 0, 0),
    )
  })
})

describe('rounded PDF rectangles', () => {
  it('emits four Bézier corners and a combined fill/stroke operation', () => {
    const body = roundedRectOperators({
      x: 10,
      y: 10,
      width: 80,
      height: 30,
      radius: 5,
      color: cmyk(0, 0, 0, 0),
      borderColor: cmyk(0, 0, 0, 1),
      borderWidth: 1,
    })
      .map(String)
      .join('\n')
    expect(body.match(/\sc\b/g)).toHaveLength(4)
    expect(body).toMatch(/\nB$/)
  })
})

describe('CMYK image export', () => {
  it('converts raster pixels to CMYK and pure K when requested', () => {
    const imageData = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255]),
    } as ImageData
    expect([...imageDataToCmykBytes(imageData)]).toEqual([0, 255, 255, 0])
    expect([...imageDataToCmykBytes(imageData, true)]).toEqual([0, 0, 0, 201])
  })

  it('keeps the configured recipe for rasterised brand artwork', () => {
    const imageData = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([65, 107, 224, 255]),
    } as ImageData
    expect([
      ...imageDataToCmykBytes(imageData, false, {
        hex: '#416BE0',
        cmyk: { c: 0.76, m: 0.51, y: 0, k: 0 },
      }),
    ]).toEqual([194, 130, 0, 0])
  })

  it('registers raster artwork as a DeviceCMYK image XObject', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([100, 100])
    const image = registerCmykImageXObject(
      pdf,
      page,
      1,
      1,
      new Uint8Array([0, 255, 255, 0]),
    )
    image.draw(10, 10, 40, 40)
    const bytes = await pdf.save({ useObjectStreams: false })
    expect(pdfLatin1(bytes)).toContain('/ColorSpace /DeviceCMYK')
  })
})

describe('sceneToPdfBytes outlined mode', () => {
  const originalFetch = globalThis.fetch

  beforeAll(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('Gilroy-Regular.ttf')) {
        return new Response(regularBytes, { status: 200 })
      }
      if (url.includes('Gilroy-Bold.ttf')) {
        return new Response(boldBytes, { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  it('exports outlined text without /Font resources', async () => {
    const scene: LabelScene = {
      kind: 'size-normal',
      unit: 'mm',
      width: 45,
      height: 30,
      nodes: [
        {
          type: 'text',
          x: 5,
          y: 15,
          fill: '#111',
          runs: [{ text: 'ZOOM', bold: true, fontSize: 8 }],
        },
      ],
    }

    const bytes = await sceneToPdfBytes(scene, {
      mode: 'k-only',
      pdfFontMode: 'outlined',
      textColorMode: 'pure-k',
      baseUrl: './',
    })

    expect(bytes.byteLength).toBeGreaterThan(100)
    const body = pdfLatin1(bytes)
    // Outlined glyphs are vector paths � no font dictionary / Gilroy subset.
    expect(body).not.toMatch(/\/Font\b/)
    expect(body).not.toMatch(/Gilroy/i)
    expect(body).not.toMatch(/Helvetica/)
  })

  it('fails clearly when Gilroy cannot be loaded', async () => {
    const scene: LabelScene = {
      kind: 'box',
      unit: 'mm',
      width: 140,
      height: 120,
      nodes: [{ type: 'text', x: 1, y: 1, fill: '#111', runs: [{ text: 'X', fontSize: 10 }] }],
    }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      return new Response('missing', { status: 404 })
    })

    await expect(
      sceneToPdfBytes(scene, { mode: 'cmyk', pdfFontMode: 'outlined', baseUrl: './' }),
    ).rejects.toThrow(/Gilroy fonts are required/)
  })

})
