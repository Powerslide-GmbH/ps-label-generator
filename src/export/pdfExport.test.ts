import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cmyk } from 'pdf-lib'
import { sceneToPdfBytes, toPdfColor } from '@/export/pdfExport'
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
    // Outlined glyphs are vector paths — no font dictionary / Gilroy subset.
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
