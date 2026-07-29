import { describe, expect, it } from 'vitest'
import {
  boxSheetMm,
  decideTableFlow,
  migrateDocument,
} from '@/domain/boxConfig'
import { documentFromPreset } from '@/domain/presets'
import { createEmptySizeTable } from '@/domain/sizechart'
import {
  DEFAULT_LEGAL_DISPLAY,
  DEFAULT_SIZE_SYSTEMS,
  type ModelPreset,
  type SizeChartTable,
  type SizeRow,
} from '@/domain/types'
import {
  buildResponsiveBoxLabelScene,
  lastBoxLayoutMeta,
} from '@/templates/boxScene'
import {
  buildBoxLabelScene,
  buildSizeChartScene,
  buildSizeLabelScene,
} from '@/templates/scenes'
import type { SceneNode } from '@/templates/scenes'

function sceneText(nodes: SceneNode[]): string {
  return nodes
    .filter((n): n is Extract<SceneNode, { type: 'text' }> => n.type === 'text')
    .flatMap((n) => n.runs.map((r) => r.text))
    .join('\n')
}

function basePreset(partial: Partial<ModelPreset> & Pick<ModelPreset, 'id' | 'name' | 'mode'>): ModelPreset {
  return {
    brandColorHex: '#416BE0',
    brandColorCmyk: { c: 0.76, m: 0.51, y: 0, k: 0 },
    brandWordmarkLogoId: 'powerslide_logo_blue',
    badgeLogoId: 'PS_small_CMYK',
    defaultTitle: [{ text: partial.name, bold: true }],
    defaultSku: '900000',
    boxLogos: ['PS_small_CMYK'],
    sizeChartLogos: ['PS_small_CMYK'],
    legalProfileId: 'adult-class-a',
    outputs: {
      sizeLabelNormal: true,
      sizeLabelDouble: false,
      boxLabel: true,
      sizeChart: false,
    },
    boxProductMode: 'single',
    boxDimensionsMm: { width: 140, height: 120 },
    enabledSizeSystems: [...DEFAULT_SIZE_SYSTEMS],
    boxTableFlow: { mode: 'auto' },
    legalDisplay: { ...DEFAULT_LEGAL_DISPLAY },
    pdfFontMode: 'outlined',
    boxTextColorMode: 'pure-k',
    ...partial,
  }
}

function singleRows(count: number): SizeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    mondo: String(229 + i * 7),
    usM: String(5 + i * 0.5),
    usW: String(6 + i * 0.5),
    uk: String(4 + i * 0.5),
    eu: String(36 + i),
  }))
}

function dualRows(count: number, withKids = false): SizeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    mondo: `${170 + i * 15}-${180 + i * 15}`,
    usM: withKids ? '' : `${5 + i}-${5.5 + i}`,
    usW: withKids ? '' : `${6 + i}-${6.5 + i}`,
    usKids: withKids ? `${10 + i}-${11 + i}` : undefined,
    uk: `${4 + i}-${4.5 + i}`,
    eu: `${28 + i * 2}-${29 + i * 2}`,
  }))
}

function tableFor(
  id: string,
  mode: 'single' | 'dual',
  rows: SizeRow[],
): SizeChartTable {
  return { id, name: id, mode, rows }
}

describe('size-label responsive content', () => {
  it('applies stored wordmark and page-badge scales to size-label artwork', () => {
    const table = tableFor('scaled-assets', 'dual', dualRows(1))
    const doc = documentFromPreset(
      basePreset({
        id: 'scaled-assets',
        name: 'SCALED ASSETS',
        mode: 'dual',
        sizeTable: table,
        logoScales: {
          brandWordmark: 1.2,
          pageBadge: 1.5,
          boxLogos: 1,
          sizeChartLogos: 1,
        },
      }),
      migrateDocument({}).legal,
    )
    const scene = buildSizeLabelScene(doc, table, true, {
      pageLogoHref: 'badge.svg',
      sizeWordmarkHref: 'wordmark.svg',
    })
    const badge = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'badge.svg',
    )
    const wordmark = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'wordmark.svg',
    )

    expect(badge?.h).toBe(15)
    expect(wordmark?.h).toBeCloseTo(3.84)
  })

  it('applies the stored scale to size-chart logos', () => {
    const table = tableFor('chart-scale', 'single', singleRows(2))
    const doc = documentFromPreset(
      basePreset({
        id: 'chart-scale',
        name: 'CHART SCALE',
        mode: 'single',
        sizeTable: table,
        logoScales: {
          brandWordmark: 1,
          pageBadge: 1,
          boxLogos: 1,
          sizeChartLogos: 1.5,
        },
      }),
      migrateDocument({}).legal,
    )
    const scene = buildSizeChartScene(doc, table, ['chart-logo.svg'])
    const logo = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'chart-logo.svg',
    )

    expect(logo).toMatchObject({ w: 123, h: 81 })
  })

  it('reserves the rendered page-logo width before starting the sheet title', () => {
    const table = tableFor('wide-logo', 'dual', dualRows(1))
    const doc = documentFromPreset(
      basePreset({
        id: 'wide-logo',
        name: 'ACCEL RACE Ti BOOT ONLY',
        mode: 'dual',
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildSizeLabelScene(doc, table, true, {
      pageLogoHref: 'wide-logo.svg',
      pageLogoAspectRatio: 5.1,
      sizeWordmarkHref: 'iqon.svg',
    })
    const pageLogo = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'wide-logo.svg',
    )
    const title = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'text' }> =>
        node.type === 'text' &&
        node.runs.some((run) => run.text.includes('ACCEL RACE')),
    )
    const pieceWordmark = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'iqon.svg',
    )

    expect(pageLogo).toMatchObject({ x: 8, w: 34, alignX: 'left' })
    expect(title?.x).toBe(45)
    expect(pieceWordmark?.alignX).toBe('left')
  })

  it('shrinks long MONDO ranges only as much as their table cell requires', () => {
    const table = tableFor('long-mondo', 'single', [
      {
        mondo: '236-242',
        usM: '5.5-6',
        usW: '6.5-7',
        uk: '4.5-5',
        eu: '37-38',
      },
    ])
    const doc = documentFromPreset(
      basePreset({
        id: 'long-mondo',
        name: 'ZOOM TORELLI PRO 80',
        mode: 'single',
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildSizeLabelScene(doc, table, false)
    const mondo = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'text' }> =>
        node.type === 'text' &&
        node.runs.some((run) => run.text === '236-242'),
    )

    expect(mondo?.runs[0]?.fontSize).toBeLessThan(2.6)
    expect(mondo?.runs[0]?.fontSize).toBeGreaterThanOrEqual(1.25)
  })
})

describe('box sheet geometry', () => {
  it('matches boxSheetMm for 140120 and 120100', () => {
    const s140 = boxSheetMm({ width: 140, height: 120 })
    const s120 = boxSheetMm({ width: 120, height: 100 })

    const empty = createEmptySizeTable('empty', 'single')
    empty.rows = []

    const doc140 = documentFromPreset(
      basePreset({
        id: 't-140',
        name: 'T140',
        mode: 'single',
        boxDimensionsMm: { width: 140, height: 120 },
        sizeTable: tableFor('t-140', 'single', singleRows(6)),
      }),
      migrateDocument({}).legal,
    )
    const scene140 = buildResponsiveBoxLabelScene(doc140, empty, [], null)
    expect(scene140.width).toBe(s140.width)
    expect(scene140.height).toBe(s140.height)

    const doc120 = documentFromPreset(
      basePreset({
        id: 't-120',
        name: 'T120',
        mode: 'dual',
        boxProductMode: 'dual',
        boxDimensionsMm: { width: 120, height: 100 },
        sizeTable: tableFor('t-120', 'dual', dualRows(3)),
      }),
      migrateDocument({}).legal,
    )
    const scene120 = buildBoxLabelScene(doc120, empty, [], null)
    expect(scene120.width).toBe(s120.width)
    expect(scene120.height).toBe(s120.height)
  })
})

describe('layoutStrategy', () => {
  it('applies the stored scale to box sublogos', () => {
    const table = tableFor('box-logo-scale', 'single', singleRows(6))
    const doc = documentFromPreset(
      basePreset({
        id: 'box-logo-scale',
        name: 'BOX LOGO SCALE',
        mode: 'single',
        sizeTable: table,
        logoScales: {
          brandWordmark: 1,
          pageBadge: 1,
          boxLogos: 1.5,
          sizeChartLogos: 1,
        },
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(
      doc,
      table,
      [{ href: 'sublogo.svg', aspectRatio: 1 }],
      null,
    )
    const sublogo = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'sublogo.svg',
    )

    expect(sublogo?.h).toBeCloseTo(10.8)
  })

  it('sizes a narrow box wordmark to its natural ratio at the title origin', () => {
    const table = tableFor('narrow-wordmark', 'single', singleRows(6))
    const doc = documentFromPreset(
      basePreset({
        id: 'narrow-wordmark',
        name: 'ZOOM TORELLI PRO 80',
        mode: 'single',
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(doc, table, [], null, {
      boxWordmarkHref: 'aeon.svg',
      boxWordmarkAspectRatio: 3.6034,
    })
    const wordmark = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'aeon.svg',
    )
    const productTitle = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'text' }> =>
        node.type === 'text' &&
        node.y > 20 &&
        node.runs.some((run) => run.text.includes('ZOOM TORELLI')),
    )

    expect(wordmark?.alignX).toBe('left')
    expect(wordmark?.x).toBe(productTitle?.x)
    expect((wordmark?.w ?? 0) / (wordmark?.h ?? 1)).toBeCloseTo(3.6034, 3)
  })

  it('uses single-standard for a short single-size run', () => {
    const rows = singleRows(6)
    const table = tableFor('short', 'single', rows)
    const doc = documentFromPreset(
      basePreset({
        id: 'short',
        name: 'Short',
        mode: 'single',
        boxTableFlow: { mode: 'auto' },
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(doc, table, [], null)
    expect(scene.layoutStrategy).toBe('single-standard')
    expect(lastBoxLayoutMeta?.strategy).toBe('single-standard')
  })

  it('uses single-split-table for a long single run with auto flow', () => {
    const rows = singleRows(16)
    const table = tableFor('long', 'single', rows)
    const doc = documentFromPreset(
      basePreset({
        id: 'long',
        name: 'Long',
        mode: 'single',
        boxDimensionsMm: { width: 140, height: 120 },
        boxTableFlow: { mode: 'auto' },
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const decision = decideTableFlow({
      flow: doc.boxTableFlow,
      rowCount: rows.length,
      availableWidthMm: 101,
      productMode: 'single',
    })
    expect(decision.split).toBe(true)

    const scene = buildResponsiveBoxLabelScene(doc, table, [], 'product.tif', {
      wordmarkHref: 'wordmark.svg',
    })
    expect(scene.layoutStrategy).toBe('single-split-table')
    const images = scene.nodes.filter((node) => node.type === 'image')
    expect(images.find((node) => node.href === 'wordmark.svg')).toMatchObject({
      alignX: 'left',
    })
    expect(images.find((node) => node.href === 'product.tif')).toMatchObject({
      alignX: 'center',
      alignY: 'bottom',
    })
  })

  it('uses dual-* strategies for dual product mode', () => {
    const adultTable = tableFor('dual-adult', 'dual', dualRows(8))
    const adultDoc = documentFromPreset(
      basePreset({
        id: 'dual-adult',
        name: 'Dual Adult',
        mode: 'dual',
        boxProductMode: 'dual',
        enabledSizeSystems: [...DEFAULT_SIZE_SYSTEMS],
        sizeTable: adultTable,
      }),
      migrateDocument({}).legal,
    )
    const adultScene = buildResponsiveBoxLabelScene(adultDoc, adultTable, [], null)
    expect(adultScene.layoutStrategy).toBe('dual-wide-table')

    const kidsTable = tableFor('dual-kids', 'dual', dualRows(5, true))
    const kidsDoc = documentFromPreset(
      basePreset({
        id: 'dual-kids',
        name: 'Dual Kids',
        mode: 'dual',
        boxProductMode: 'dual',
        boxDimensionsMm: { width: 120, height: 100 },
        enabledSizeSystems: [
          'MONDO',
          'US Kids',
          'UK',
          'EU',
        ],
        legalProfileId: 'kids-class-b',
        sizeTable: kidsTable,
      }),
      migrateDocument({}).legal,
    )
    const kidsScene = buildResponsiveBoxLabelScene(kidsDoc, kidsTable, [], null)
    expect(kidsScene.layoutStrategy).toBe('dual-compact-junior')
  })

  it('switches a dual adult model to side-by-side when its size run becomes short', () => {
    const longTable = tableFor('dual-adaptive', 'single', singleRows(13))
    const doc = documentFromPreset(
      basePreset({
        id: 'dual-adaptive',
        name: 'Dual Adaptive',
        mode: 'dual',
        boxProductMode: 'dual',
        boxDimensionsMm: { width: 120, height: 100 },
        enabledSizeSystems: [...DEFAULT_SIZE_SYSTEMS],
        boxLayout: { template: 'auto' },
        sizeTable: longTable,
      }),
      migrateDocument({}).legal,
    )

    expect(buildResponsiveBoxLabelScene(doc, longTable, [], null).layoutStrategy)
      .toBe('dual-wide-table')

    const fiveRows = { ...longTable, rows: longTable.rows.slice(0, 5) }
    expect(buildResponsiveBoxLabelScene(doc, fiveRows, [], null).layoutStrategy)
      .toBe('dual-wide-table')

    const shortTable = { ...longTable, rows: longTable.rows.slice(0, 4) }
    expect(buildResponsiveBoxLabelScene(doc, shortTable, [], null).layoutStrategy)
      .toBe('dual-side-by-side-junior')
  })

  it('keeps panoramic single-product artwork outside the text column', () => {
    const table = tableFor('single-panorama', 'dual', dualRows(13))
    const doc = documentFromPreset(
      basePreset({
        id: 'single-panorama',
        name: 'PANORAMIC PRODUCT',
        mode: 'dual',
        boxProductMode: 'single',
        boxDimensionsMm: { width: 120, height: 100 },
        boxLayout: { titleColumnPercent: 50 },
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(doc, table, [], 'panorama.tif', {
      wordmarkHref: 'wordmark.svg',
    })
    const title = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'text' }> =>
        node.type === 'text' &&
        node.runs.some((run) => run.text.includes('PANORAMIC PRODUCT')),
    )
    const image = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'panorama.tif',
    )
    expect(title).toBeDefined()
    expect(image).toBeDefined()
    expect((image?.x ?? 0) - (title?.x ?? 0)).toBeGreaterThan(40)
  })

  it('caps product title and SKU sizes when a large preset switches to dual', () => {
    const table = tableFor('dual-from-large', 'dual', dualRows(6))
    const doc = documentFromPreset(
      basePreset({
        id: 'dual-from-large',
        name: 'SHARED MODEL',
        mode: 'dual',
        boxProductMode: 'dual',
        titleSizes: { box: 8 },
        boxProducts: [
          {
            title: [{ text: 'COLOR ONE', bold: true }],
            sku: 'SKU-ONE',
            imagePath: null,
            imageName: null,
          },
          {
            title: [{ text: 'COLOR TWO', bold: true }],
            sku: 'SKU-TWO',
            imagePath: null,
            imageName: null,
          },
        ],
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(doc, table, [], null)
    const productText = scene.nodes.filter(
      (node): node is Extract<SceneNode, { type: 'text' }> =>
        node.type === 'text' &&
        node.y > 20 &&
        node.runs.some(
          (run) => run.text === 'COLOR ONE' || run.text === 'SKU-ONE',
        ),
    )
    expect(productText.length).toBeGreaterThanOrEqual(2)
    expect(
      Math.max(...productText.flatMap((node) => node.runs.map((run) => run.fontSize ?? 0))),
    ).toBeLessThanOrEqual(3.2)
  })
})

describe('decideTableFlow', () => {
  it('keeps one table for short runs and splits when columns > 13', () => {
    const short = decideTableFlow({
      flow: { mode: 'auto' },
      rowCount: 6,
      availableWidthMm: 101,
      productMode: 'single',
    })
    expect(short.split).toBe(false)

    const atThreshold = decideTableFlow({
      flow: { mode: 'auto' },
      rowCount: 13,
      availableWidthMm: 101,
      productMode: 'single',
    })
    expect(atThreshold.split).toBe(false)

    const long = decideTableFlow({
      flow: { mode: 'auto' },
      rowCount: 16,
      availableWidthMm: 101,
      productMode: 'single',
    })
    expect(long.split).toBe(true)
    expect(long.splitIndex).toBe(8)

    const forced = decideTableFlow({
      flow: { mode: 'split', splitIndex: 6 },
      rowCount: 11,
      availableWidthMm: 101,
      productMode: 'single',
    })
    // Force modes are ignored; 11 columns stays as one table.
    expect(forced.split).toBe(false)

    const overThreshold = decideTableFlow({
      flow: { mode: 'split', splitIndex: 6 },
      rowCount: 14,
      availableWidthMm: 101,
      productMode: 'single',
    })
    expect(overThreshold.split).toBe(true)
    expect(overThreshold.splitIndex).toBe(7)
  })
})

describe('US Kids and legal visibility', () => {
  it('renders US Kids label text when enabled with data', () => {
    const table = tableFor('kids', 'dual', dualRows(3, true))
    const doc = documentFromPreset(
      basePreset({
        id: 'kids-vis',
        name: 'Kids Vis',
        mode: 'dual',
        boxProductMode: 'dual',
        enabledSizeSystems: [
          'MONDO',
          'US Kids',
          'UK',
          'EU',
        ],
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(doc, table, [], null)
    expect(sceneText(scene.nodes)).toContain('US Kids')
  })

  it('omits company text when showCompany is false', () => {
    const table = tableFor('noco', 'single', singleRows(4))
    const doc = documentFromPreset(
      basePreset({
        id: 'noco',
        name: 'No Company',
        mode: 'single',
        sizeTable: table,
        legalDisplay: {
          ...DEFAULT_LEGAL_DISPLAY,
          showCompany: false,
        },
      }),
      migrateDocument({}).legal,
    )
    expect(doc.legal.company).toContain('POWERSLIDE')
    const scene = buildResponsiveBoxLabelScene(doc, table, [], null)
    const text = sceneText(scene.nodes)
    expect(text).not.toContain(doc.legal.company)
  })
})

describe('dynamic footer rules', () => {
  it('places dual-product sublogos above a populated regulatory block', () => {
    const table = tableFor('footer-legal', 'dual', dualRows(3, true))
    const doc = documentFromPreset(
      basePreset({
        id: 'footer-legal',
        name: 'Footer Legal',
        mode: 'dual',
        boxProductMode: 'dual',
        boxDimensionsMm: { width: 120, height: 100 },
        enabledSizeSystems: ['MONDO', 'US Kids', 'UK', 'EU'],
        boxLayout: { logoPlacement: 'auto' },
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(
      doc,
      table,
      [{ href: 'sublogo.svg', aspectRatio: 1 }],
      null,
      { classLogoHref: 'class.svg' },
    )
    const sublogo = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'sublogo.svg',
    )
    const standard = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'text' }> =>
        node.type === 'text' &&
        node.runs.some((run) => run.text === doc.legal.standard),
    )
    expect(sublogo).toBeDefined()
    expect(standard).toBeDefined()
    expect((sublogo?.y ?? 0) + (sublogo?.h ?? 0)).toBeLessThan(
      standard?.y ?? 0,
    )
  })

  it('uses a horizontal made-in line when the dual footer is otherwise free', () => {
    const table = tableFor('footer-free', 'single', singleRows(6))
    const doc = documentFromPreset(
      basePreset({
        id: 'footer-free',
        name: 'Footer Free',
        mode: 'dual',
        boxProductMode: 'dual',
        boxDimensionsMm: { width: 120, height: 100 },
        boxLayout: { logoPlacement: 'auto' },
        legalDisplay: {
          showCompany: false,
          showPostalAddress: false,
          showPhoneFax: false,
          showWebEmail: false,
          showStandard: false,
          showClass: false,
          showWeight: false,
          showMadeIn: true,
        },
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    const scene = buildResponsiveBoxLabelScene(
      doc,
      table,
      [{ href: 'sublogo.svg', aspectRatio: 1 }],
      null,
      { classLogoHref: 'class.svg' },
    )
    const classIcon = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'image' }> =>
        node.type === 'image' && node.href === 'class.svg',
    )
    const madeIn = scene.nodes.find(
      (node): node is Extract<SceneNode, { type: 'text' }> =>
        node.type === 'text' &&
        node.runs.some((run) => run.text === doc.legal.madeIn.toUpperCase()),
    )
    expect(classIcon).toBeDefined()
    expect(madeIn?.anchor).toBeUndefined()
    expect(madeIn?.x ?? 0).toBeGreaterThan(
      (classIcon?.x ?? 0) + (classIcon?.w ?? 0),
    )
  })
})

describe('dual model title', () => {
  it('keeps defaultTitle as doc.title for dual presets (Triple X header)', () => {
    const table = tableFor('triple', 'dual', dualRows(2, true))
    const doc = documentFromPreset(
      basePreset({
        id: 'triple',
        name: 'Triple',
        mode: 'dual',
        boxProductMode: 'dual',
        defaultTitle: [{ text: 'TRIPLE X EVO ADJUSTABLE', bold: true }],
        boxDimensionsMm: { width: 125, height: 110 },
        boxLayout: {
          template: 'dual-side-by-side-junior',
          logoPlacement: 'footer',
        },
        enabledSizeSystems: ['MONDO', 'US Kids', 'UK', 'EU'],
        boxProducts: [
          {
            title: [{ text: 'TRIPLE X EVO Dark Grey', bold: true }],
            subtitle: 'adj.',
            sku: '904719',
            imagePath: null,
            imageName: null,
          },
          {
            title: [{ text: 'TRIPLE X EVO Hot Pink', bold: true }],
            subtitle: 'adj.',
            sku: '904720',
            imagePath: null,
            imageName: null,
          },
        ],
        sizeTable: table,
      }),
      migrateDocument({}).legal,
    )
    expect(doc.title.map((r) => r.text).join('')).toContain('ADJUSTABLE')
    const scene = buildResponsiveBoxLabelScene(doc, table, [], null, {
      wordmarkHref: 'wm.svg',
    })
    expect(scene.layoutStrategy).toBe('dual-side-by-side-junior')
    const text = sceneText(scene.nodes).replace(/\n/g, ' ')
    expect(text).toContain('ADJUSTABLE')
    expect(text).toContain('TRIPLE X EVO Dark Grey')
  })
})
