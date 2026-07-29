import { describe, expect, it } from 'vitest'
import { packLabels } from '@/domain/packing'
import {
  demoTitle,
  applyBoldToSelection,
  applySizeToSelection,
  plainText,
  mergeRuns,
} from '@/domain/richText'
import { exportBasename } from '@/domain/names'
import {
  parseSizeChartSheet,
  cloneSizeTable,
  validateSizeTable,
  emptySizeRow,
} from '@/domain/sizechart'
import { parseModelJson, parseSizeChartJson } from '@/content/loadCatalog'
import { documentFromPreset, DEFAULT_LEGAL } from '@/domain/presets'

describe('packing', () => {
  it('packs labels on at least A4 and grows if needed', () => {
    const result = packLabels(11, 45, 30, { gap: 0 })
    expect(result.slots).toHaveLength(11)
    expect(result.page.w).toBeGreaterThanOrEqual(297)
    expect(result.page.h).toBeGreaterThanOrEqual(210)
  })

  it('honors a production-sheet column cap', () => {
    const result = packLabels(11, 45, 30, {
      gap: 2,
      marginTop: 22,
      maxColumns: 4,
    })
    expect(result.slots.slice(0, 4).map((slot) => slot.y)).toEqual([
      22, 22, 22, 22,
    ])
    expect(result.slots[4].y).toBeGreaterThan(22)
  })
})

describe('rich text', () => {
  it('builds demo titles and partial bold/size', () => {
    const title = demoTitle('ZOOM TORELLI PRO', '80')
    expect(plainText(title)).toBe('ZOOM TORELLI PRO 80')
    const next = applyBoldToSelection(title, 0, 4, false)
    expect(next[0].bold).toBe(false)
    const sized = applySizeToSelection(title, 0, 4, 14)
    expect(sized[0].fontSize).toBe(14)
    expect(mergeRuns(sized).length).toBeGreaterThan(0)
  })

  it('persists regular weight after applyBoldToSelection (does not remount as bold)', () => {
    const title = [{ text: 'ZOOM TORELLI PRO', bold: true }]
    const regularized = applyBoldToSelection(title, 0, title[0].text.length, false)
    expect(regularized).toEqual([{ text: 'ZOOM TORELLI PRO', bold: false }])
    // Remount / re-merge must keep regular, not collapse into default bold
    expect(mergeRuns(regularized)).toEqual([{ text: 'ZOOM TORELLI PRO', bold: false }])
  })

  it('merges adjacent runs treating undefined bold as true', () => {
    const merged = mergeRuns([
      { text: 'ZOOM', bold: true },
      { text: ' ', bold: undefined },
      { text: 'PRO', bold: true },
      { text: ' 80', bold: false },
    ])
    expect(merged).toEqual([
      { text: 'ZOOM PRO', bold: true },
      { text: ' 80', bold: false },
    ])
  })

  it('splits and re-merges partial regular without dropping the change', () => {
    const title = [{ text: 'ABCDEF', bold: true }]
    const mid = applyBoldToSelection(title, 2, 4, false)
    expect(mid).toEqual([
      { text: 'AB', bold: true },
      { text: 'CD', bold: false },
      { text: 'EF', bold: true },
    ])
    const allRegular = applyBoldToSelection(mid, 0, 6, false)
    expect(allRegular).toEqual([{ text: 'ABCDEF', bold: false }])
  })
})

describe('names', () => {
  it('builds kebab export names', () => {
    expect(exportBasename('908472', 'ZOOM Torelli Pro 80', 'box-label')).toBe(
      '908472-zoom-torelli-pro-80-box-label',
    )
  })
})

describe('sizechart', () => {
  it('detects dual ranges from matrix helper', () => {
    const table = parseSizeChartSheet('demo', [
      ['229-236', '5-5.5', '6-6.5', '4-4.5', '36-37'],
    ])
    expect(table.mode).toBe('dual')
    expect(table.rows[0].eu).toBe('36-37')
  })

  it('clones and validates editable tables', () => {
    const table = parseSizeChartSheet('demo', [['229', '5', '6', '4', '36']])
    const clone = cloneSizeTable(table)
    clone.rows.push(emptySizeRow())
    expect(table.rows).toHaveLength(1)
    expect(validateSizeTable(clone).some((e) => e.includes('Row 2'))).toBe(true)
  })

  it('parses size chart JSON', () => {
    const warnings: { message: string }[] = []
    const table = parseSizeChartJson(
      {
        id: 'ps-urban-next',
        name: 'NEXT',
        mode: 'dual',
        rows: [{ mondo: '229-236', usM: '5-5.5', usW: '', uk: '4-4.5', eu: '36-37' }],
      },
      'next.json',
      warnings,
    )
    expect(table?.id).toBe('ps-urban-next')
    expect(warnings).toHaveLength(0)
  })
})

describe('preset json', () => {
  it('parses preset with embedded size table', () => {
    const warnings: { message: string }[] = []
    const preset = parseModelJson(
      {
        id: 'zoom-torelli-pro-80',
        name: 'ZOOM Torelli Pro 80',
        brandColorHex: '#416BE0',
        brandColorCmyk: { c: 0.76, m: 0.51, y: 0, k: 0 },
        brandWordmarkLogoId: 'powerslide_logo_blue',
        mode: 'dual',
        sizeTable: {
          id: 'ps-urban-zoom-torelli',
          name: 'ZOOM',
          mode: 'dual',
          rows: [
            { mondo: '229-236', usM: '5-5.5', usW: '6-6.5', uk: '4-4.5', eu: '36-37' },
          ],
        },
        defaultTitle: [{ text: 'ZOOM TORELLI PRO 80', bold: true }],
        defaultSku: '908472',
        boxLogos: ['PS_small_CMYK', 'seg_FIT'],
        sizeChartLogos: ['PS_small_CMYK'],
        materials: { upper: 'label_syntetic_material' },
        badgeLogoId: 'PS_small_CMYK',
        legalProfileId: 'adult-class-a',
        outputs: {
          sizeLabelNormal: false,
          sizeLabelDouble: true,
          boxLabel: true,
          sizeChart: true,
        },
        boxLayout: {
          template: 'single-standard',
          logoPlacement: 'brand',
          wordmarkScale: 0.85,
          productImageScale: 1.1,
          subtitleSizeMm: 3.4,
          titleColumnPercent: 58,
          brandGapMm: 1,
        },
      },
      'zoom.json',
      warnings,
    )
    expect(preset?.brandWordmarkLogoId).toBe('powerslide_logo_blue')
    expect(preset?.sizeTable?.rows).toHaveLength(1)
    expect(preset?.outputs.sizeLabelDouble).toBe(true)
    const doc = documentFromPreset(preset!, DEFAULT_LEGAL)
    expect(doc.materials.upper).toBe('label_syntetic_material')
    expect(doc.badgeLogoId).toBe('PS_small_CMYK')
    expect(doc.brandWordmarkLogoId).toBe('powerslide_logo_blue')
    expect(doc.outputs.sizeLabelDouble).toBe(true)
    expect(doc.boxLayout.template).toBe('single-standard')
    expect(doc.boxLayout.logoPlacement).toBe('brand')
    expect(doc.boxLayout.wordmarkScale).toBe(0.85)
    expect(doc.boxLayout.subtitleSizeMm).toBe(3.4)
    expect(plainText(doc.title)).toBe('ZOOM TORELLI PRO 80')
  })

  it('maps legacy sizeLabelSingle/Dual output keys', () => {
    const warnings: { message: string }[] = []
    const preset = parseModelJson(
      {
        id: 'legacy',
        name: 'Legacy',
        brandColorHex: '#416BE0',
        brandColorCmyk: { c: 0.76, m: 0.51, y: 0, k: 0 },
        sizeChartId: 'ps-urban-hc-evo',
        mode: 'single',
        defaultTitle: [{ text: 'LEGACY', bold: true }],
        boxLogos: [],
        sizeChartLogos: [],
        legalProfileId: 'adult-class-a',
        outputs: {
          sizeLabelSingle: true,
          sizeLabelDual: false,
          boxLabel: true,
          sizeChart: false,
        },
      },
      'legacy.json',
      warnings,
    )
    expect(preset?.outputs.sizeLabelNormal).toBe(true)
    expect(preset?.outputs.sizeLabelDouble).toBe(false)
  })
})

describe('size table csv/excel', () => {
  it('parses headers in column 1 (label layout)', async () => {
    const { parseSizeMatrix } = await import('@/domain/sizeTableIo')
    const table = parseSizeMatrix('demo', [
      ['MONDO', '229', '236'],
      ['US M', '5', '5.5'],
      ['US W', '6', '6.5'],
      ['UK', '4', '4.5'],
      ['EU', '36', '37'],
    ])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toEqual({
      mondo: '229',
      usM: '5',
      usW: '6',
      usKids: '',
      uk: '4',
      eu: '36',
    })
    expect(table.mode).toBe('single')
  })

  it('parses headers in row 1 and round-trips CSV', async () => {
    const { parseSizeCsv, sizeTableToCsv } = await import('@/domain/sizeTableIo')
    const table = parseSizeCsv(
      'wide',
      'MONDO,US M,US W,UK,EU\n229-236,5-5.5,6-6.5,4-4.5,36-37\n',
    )
    expect(table.mode).toBe('dual')
    expect(table.rows[0].eu).toBe('36-37')
    const again = parseSizeCsv('round', sizeTableToCsv(table))
    expect(again.rows[0].eu).toBe('36-37')
  })
})

describe('sizechart module surface', () => {
  it('keeps workbook parsing in sizeTableIo, not sizechart', async () => {
    const mod = await import('@/domain/sizechart')
    expect('parseSizeChartWorkbook' in mod).toBe(false)
    const io = await import('@/domain/sizeTableIo')
    expect(typeof io.parseSizeWorkbook).toBe('function')
  })
})

describe('box config migration & class helpers', () => {
  it('migrateDocument fills box defaults', async () => {
    const { migrateDocument } = await import('@/domain/boxConfig')
    const {
      DEFAULT_BOX_DIMENSIONS_MM,
      DEFAULT_BOX_LAYOUT,
      DEFAULT_BOX_TABLE_FLOW,
      DEFAULT_LEGAL_DISPLAY,
      DEFAULT_LOGO_SCALES,
      DEFAULT_SIZE_LABEL_SHEET,
      DEFAULT_SIZE_SYSTEMS,
    } = await import('@/domain/types')
    const doc = migrateDocument({
      sku: '1',
      title: [{ text: 'DEMO', bold: true }],
      boxProductMode: 'single',
      boxDimensionsMm: { width: 140, height: 120 },
    })
    expect(doc.boxProductMode).toBe('single')
    expect(doc.boxDimensionsMm).toEqual(DEFAULT_BOX_DIMENSIONS_MM)
    expect(doc.enabledSizeSystems).toEqual(DEFAULT_SIZE_SYSTEMS)
    expect(doc.boxTableFlow).toEqual(DEFAULT_BOX_TABLE_FLOW)
    expect(doc.boxLayout).toEqual(DEFAULT_BOX_LAYOUT)
    expect(doc.sizeLabelSheet).toEqual(DEFAULT_SIZE_LABEL_SHEET)
    expect(doc.logoScales).toEqual(DEFAULT_LOGO_SCALES)
    expect(doc.legalDisplay).toEqual(DEFAULT_LEGAL_DISPLAY)
    expect(doc.pdfFontMode).toBe('outlined')
    expect(doc.boxTextColorMode).toBe('pure-k')
    expect(doc.boxProducts).toHaveLength(1)
    expect(doc.customLogos).toEqual([])
  })

  it('bulkAssignClassByEu assigns A/B and reports crosses', async () => {
    const { bulkAssignClassByEu } = await import('@/domain/boxConfig')
    const table = {
      id: 'cls',
      name: 'cls',
      mode: 'dual' as const,
      rows: [
        { mondo: '160', usM: '', usW: '', uk: '', eu: '30' },
        { mondo: '240', usM: '', usW: '', uk: '', eu: '38' },
        { mondo: '200-250', usM: '', usW: '', uk: '', eu: '32-36' },
      ],
    }
    const { table: next, crosses } = bulkAssignClassByEu(table)
    expect(next.rows[0].legalProfileId).toBe('kids-class-b')
    expect(next.rows[1].legalProfileId).toBe('adult-class-a')
    expect(crosses).toEqual([2])
  })
})

describe('size table headers for US Kids + CLASS', () => {
  it('matchSizeHeader recognizes US Kids and CLASS aliases', async () => {
    const { matchSizeHeader } = await import('@/domain/sizeTableIo')
    expect(matchSizeHeader('US Kids')).toBe('usKids')
    expect(matchSizeHeader('US Junior')).toBe('usKids')
    expect(matchSizeHeader('CLASS')).toBe('legalProfileId')
    expect(matchSizeHeader('Class A B')).toBe('legalProfileId')
  })

  it('parseSizeMatrix keeps US Kids and CLASS columns', async () => {
    const { parseSizeMatrix } = await import('@/domain/sizeTableIo')
    const table = parseSizeMatrix('kids-class', [
      ['MONDO', '170-185', '190-205'],
      ['US Kids', '10.5-12.5', '13-2'],
      ['UK', '10-12', '12.5-1.5'],
      ['EU', '28-31', '32-34'],
      ['CLASS', 'B', 'A'],
    ])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toMatchObject({
      mondo: '170-185',
      usKids: '10.5-12.5',
      uk: '10-12',
      eu: '28-31',
      legalProfileId: 'kids-class-b',
    })
    expect(table.rows[1].legalProfileId).toBe('adult-class-a')
    expect(table.mode).toBe('dual')
  })
})
