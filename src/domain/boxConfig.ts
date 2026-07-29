import { richFromPlain } from './richText'
import type {
  BoxDimensionsMm,
  BoxLayoutSettings,
  BoxProductMode,
  BoxProductSlot,
  BoxTableFlow,
  LabelDocument,
  LegalDisplayOptions,
  LegalProfile,
  LogoScaleSettings,
  LogoRef,
  ModelPreset,
  SizeChartTable,
  SizeLabelSheetSettings,
  SizeRow,
  SizeSystem,
  SizeSystemKey,
} from './types'
import {
  DEFAULT_BOX_DIMENSIONS_MM,
  DEFAULT_BOX_LAYOUT,
  DEFAULT_BOX_TABLE_FLOW,
  DEFAULT_LEGAL_DISPLAY,
  DEFAULT_LOGO_SCALES,
  DEFAULT_SIZE_LABEL_SHEET,
  DEFAULT_SIZE_SYSTEMS,
  LEGACY_LEGAL_DISPLAY,
  MIN_BOX_DIMENSIONS_MM,
} from './types'

export const LEGAL_PROFILES: Record<string, LegalProfile> = {
  'adult-class-a': {
    id: 'adult-class-a',
    classText: 'Class A',
    standard: 'EN 13843:2009',
    weightRange: '60-100kg/ 132-220lbs',
    company: 'POWERSLIDE Sportartikelvertriebs GmbH',
    address: 'Esbachgraben 1, 95463 Bindlach, Germany,',
    phone: 'Ph. +49-(0)9208-6010-0',
    fax: 'Fx. +49-(0)9208-9421',
    web: 'www.powerslide.com',
    email: 'powerslide@powerslide.de',
    madeIn: 'MADE IN CHINA',
  },
  'kids-class-b': {
    id: 'kids-class-b',
    classText: 'Class B',
    standard: 'EN 13843:2009',
    weightRange: 'max 60kg / 132lbs',
    company: 'POWERSLIDE Sportartikelvertriebs GmbH',
    address: 'Esbachgraben 1, 95463 Bindlach, Germany,',
    phone: 'Ph. +49-(0)9208-6010-0',
    fax: 'Fx. +49-(0)9208-9421',
    web: 'www.powerslide.com',
    email: 'powerslide@powerslide.de',
    madeIn: 'MADE IN CHINA',
  },
  none: {
    id: 'none',
    classText: '',
    standard: '',
    weightRange: '',
    company: 'POWERSLIDE Sportartikelvertriebs GmbH',
    address: 'Esbachgraben 1, 95463 Bindlach, Germany,',
    phone: 'Ph. +49-(0)9208-6010-0',
    fax: 'Fx. +49-(0)9208-9421',
    web: 'www.powerslide.com',
    email: 'powerslide@powerslide.de',
    madeIn: 'MADE IN CHINA',
  },
}

export function legalProfileById(id: string | undefined | null): LegalProfile {
  if (id && LEGAL_PROFILES[id]) return structuredClone(LEGAL_PROFILES[id])
  return structuredClone(LEGAL_PROFILES['adult-class-a'])
}

export const SIZE_SYSTEM_TO_KEY: Record<SizeSystem, SizeSystemKey> = {
  MONDO: 'mondo',
  'US M': 'usM',
  'US W': 'usW',
  'US Kids': 'usKids',
  UK: 'uk',
  EU: 'eu',
}

export const SIZE_KEY_TO_SYSTEM: Record<SizeSystemKey, SizeSystem> = {
  mondo: 'MONDO',
  usM: 'US M',
  usW: 'US W',
  usKids: 'US Kids',
  uk: 'UK',
  eu: 'EU',
}

export function emptyBoxProductSlot(
  title = 'PRODUCT NAME',
  sku = '',
): BoxProductSlot {
  return {
    title: richFromPlain(title, { bold: true }),
    sku,
    imagePath: null,
    imageName: null,
  }
}

export function clampBoxDimensions(dims: BoxDimensionsMm): BoxDimensionsMm {
  return {
    width: Math.max(MIN_BOX_DIMENSIONS_MM.width, Math.round(dims.width * 10) / 10),
    height: Math.max(
      MIN_BOX_DIMENSIONS_MM.height,
      Math.round(dims.height * 10) / 10,
    ),
  }
}

export function boxSheetMm(label: BoxDimensionsMm): BoxDimensionsMm {
  const d = clampBoxDimensions(label)
  return {
    width: d.width + 2 * 28.15,
    height: d.height + 2 * 13.79,
  }
}

export function normalizeEnabledSystems(
  systems: SizeSystem[] | undefined,
  rows?: SizeRow[],
): SizeSystem[] {
  const base =
    systems && systems.length
      ? systems.filter((s, i, arr) => arr.indexOf(s) === i)
      : [...DEFAULT_SIZE_SYSTEMS]
  if (rows?.some((r) => (r.usKids ?? '').trim()) && !base.includes('US Kids')) {
    // Keep order: insert US Kids after US W when present in data
    const idx = base.indexOf('US W')
    if (idx >= 0) base.splice(idx + 1, 0, 'US Kids')
    else base.splice(Math.max(base.indexOf('US M') + 1, 1), 0, 'US Kids')
  }
  return base.length ? base : [...DEFAULT_SIZE_SYSTEMS]
}

export function normalizeLegalDisplay(
  raw: Partial<LegalDisplayOptions> | undefined,
  legacy = false,
): LegalDisplayOptions {
  const base = legacy ? LEGACY_LEGAL_DISPLAY : DEFAULT_LEGAL_DISPLAY
  return { ...base, ...raw }
}

export function normalizeBoxTableFlow(
  raw: Partial<BoxTableFlow> | undefined,
): BoxTableFlow {
  if (!raw) return { ...DEFAULT_BOX_TABLE_FLOW }
  const mode = raw.mode === 'single' || raw.mode === 'split' ? raw.mode : 'auto'
  return {
    mode,
    splitIndex:
      typeof raw.splitIndex === 'number' && raw.splitIndex > 0
        ? Math.floor(raw.splitIndex)
        : undefined,
  }
}

function finiteInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function normalizeBoxLayout(
  raw: Partial<BoxLayoutSettings> | undefined,
): BoxLayoutSettings {
  const template =
    raw?.template === 'single-standard' ||
    raw?.template === 'single-split-table' ||
    raw?.template === 'dual-wide-table' ||
    raw?.template === 'dual-compact-junior' ||
    raw?.template === 'dual-side-by-side-junior'
      ? raw.template
      : 'auto'
  const logoPlacement =
    raw?.logoPlacement === 'table' ||
    raw?.logoPlacement === 'brand' ||
    raw?.logoPlacement === 'footer'
      ? raw.logoPlacement
      : 'auto'
  const wordmarkAlign =
    raw?.wordmarkAlign === 'left' ||
    raw?.wordmarkAlign === 'center' ||
    raw?.wordmarkAlign === 'right'
      ? raw.wordmarkAlign
      : 'auto'
  const optionalMargin = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(24, Math.max(2, value))
      : undefined

  return {
    ...DEFAULT_BOX_LAYOUT,
    template,
    logoPlacement,
    wordmarkAlign,
    wordmarkScale: finiteInRange(raw?.wordmarkScale, 1, 0.5, 1.8),
    productImageScale: finiteInRange(raw?.productImageScale, 1, 0.5, 1.5),
    subtitleSizeMm: finiteInRange(raw?.subtitleSizeMm, 2.35, 1.5, 5),
    titleColumnPercent: finiteInRange(raw?.titleColumnPercent, 50, 30, 75),
    brandGapMm: finiteInRange(raw?.brandGapMm, 0, -4, 12),
    marginX: optionalMargin(raw?.marginX),
    marginTop: optionalMargin(raw?.marginTop),
    marginBottom: optionalMargin(raw?.marginBottom),
  }
}

export function normalizeSizeLabelSheet(
  raw: Partial<SizeLabelSheetSettings> | undefined,
): SizeLabelSheetSettings {
  const columnCount = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(8, Math.max(1, Math.round(value)))
      : fallback
  return {
    normalColumns: columnCount(
      raw?.normalColumns,
      DEFAULT_SIZE_LABEL_SHEET.normalColumns,
    ),
    doubleColumns: columnCount(
      raw?.doubleColumns,
      DEFAULT_SIZE_LABEL_SHEET.doubleColumns,
    ),
  }
}

export function normalizeLogoScales(
  raw: Partial<LogoScaleSettings> | undefined,
  legacyWordmarkScale = DEFAULT_LOGO_SCALES.brandWordmark,
): LogoScaleSettings {
  return {
    brandWordmark: finiteInRange(
      raw?.brandWordmark,
      legacyWordmarkScale,
      0.5,
      1.5,
    ),
    pageBadge: finiteInRange(
      raw?.pageBadge,
      DEFAULT_LOGO_SCALES.pageBadge,
      0.5,
      1.5,
    ),
    boxLogos: finiteInRange(
      raw?.boxLogos,
      DEFAULT_LOGO_SCALES.boxLogos,
      0.5,
      1.5,
    ),
    sizeChartLogos: finiteInRange(
      raw?.sizeChartLogos,
      DEFAULT_LOGO_SCALES.sizeChartLogos,
      0.5,
      1.5,
    ),
  }
}

export function primaryProductFromDoc(doc: {
  title: LabelDocument['title']
  sku: string
  productImagePath: string | null
  productImageName: string | null
}): BoxProductSlot {
  return {
    title: structuredClone(doc.title),
    sku: doc.sku,
    imagePath: doc.productImagePath,
    imageName: doc.productImageName,
  }
}

export function syncPrimaryProductFields(
  doc: LabelDocument,
): LabelDocument {
  const primary = doc.boxProducts[0] ?? emptyBoxProductSlot()
  return {
    ...doc,
    // Dual keeps the shared model/range title (preset defaultTitle) separate
    // from per-product color titles used in the two columns.
    title:
      doc.boxProductMode === 'dual'
        ? structuredClone(doc.title)
        : structuredClone(primary.title),
    sku: primary.sku,
    productImagePath: primary.imagePath,
    productImageName: primary.imageName,
  }
}

export function migrateDocument(raw: Partial<LabelDocument> & Record<string, unknown>): LabelDocument {
  const legacy = !('boxProductMode' in raw) && !('boxDimensionsMm' in raw)
  const title = (raw.title as LabelDocument['title']) ?? richFromPlain('PRODUCT NAME', { bold: true })
  const sku = typeof raw.sku === 'string' ? raw.sku : ''
  const productImagePath =
    typeof raw.productImagePath === 'string' ? raw.productImagePath : null
  const productImageName =
    typeof raw.productImageName === 'string' ? raw.productImageName : null

  let boxProducts = Array.isArray(raw.boxProducts)
    ? (raw.boxProducts as BoxProductSlot[])
    : undefined
  if (!boxProducts?.length) {
    boxProducts = [
      {
        title: structuredClone(title),
        sku,
        imagePath: productImagePath,
        imageName: productImageName,
      },
    ]
  }
  while (boxProducts.length < 1) boxProducts.push(emptyBoxProductSlot())

  const mode: BoxProductMode =
    raw.boxProductMode === 'dual' ? 'dual' : 'single'
  if (mode === 'dual' && boxProducts.length < 2) {
    boxProducts = [...boxProducts, emptyBoxProductSlot('PRODUCT 2', '')]
  }

  const boxLogos = Array.isArray(raw.boxLogos)
    ? (raw.boxLogos as string[])
    : ['PS_small_CMYK']
  const boxLogoRefs: LogoRef[] = Array.isArray(raw.boxLogoRefs)
    ? (raw.boxLogoRefs as LogoRef[])
    : boxLogos.map((id) => ({ kind: 'catalog' as const, id }))
  const boxLayout = normalizeBoxLayout(
    raw.boxLayout as Partial<BoxLayoutSettings> | undefined,
  )
  const logoScales = normalizeLogoScales(
    raw.logoScales as Partial<LogoScaleSettings> | undefined,
    boxLayout.wordmarkScale,
  )
  boxLayout.wordmarkScale = logoScales.brandWordmark

  // Prefer explicit title (dual model/range from defaultTitle); else primary product.
  const resolvedTitle =
    Array.isArray(raw.title) && (raw.title as LabelDocument['title']).length
      ? structuredClone(raw.title as LabelDocument['title'])
      : structuredClone(boxProducts[0].title)

  const doc: LabelDocument = {
    presetId: (raw.presetId as string | null) ?? null,
    sku: boxProducts[0].sku,
    title: resolvedTitle,
    productImagePath: boxProducts[0].imagePath,
    productImageName: boxProducts[0].imageName,
    brandColorHex: (raw.brandColorHex as string) ?? '#416BE0',
    brandColorCmyk: (raw.brandColorCmyk as LabelDocument['brandColorCmyk']) ?? {
      c: 0.76,
      m: 0.51,
      y: 0,
      k: 0,
    },
    brandWordmarkLogoId: (raw.brandWordmarkLogoId as string | null) ?? null,
    badgeLogoId: (raw.badgeLogoId as string | null) ?? null,
    boxLogos,
    boxLogoRefs,
    customLogos: Array.isArray(raw.customLogos)
      ? (raw.customLogos as LabelDocument['customLogos'])
      : [],
    sizeChartLogos: Array.isArray(raw.sizeChartLogos)
      ? (raw.sizeChartLogos as string[])
      : [],
    materials: (raw.materials as LabelDocument['materials']) ?? {
      upper: 'label_syntetic_material',
      lining: 'label_textile_material',
      sole: 'label_syntetic_material',
    },
    titleSizes: (raw.titleSizes as LabelDocument['titleSizes']) ?? {
      sizeLabel: 2.2,
      sizeLabelDouble: 2.3,
      box: 4.8,
      sizeChart: 38,
    },
    sizeLabelSheet: normalizeSizeLabelSheet(
      raw.sizeLabelSheet as Partial<SizeLabelSheetSettings> | undefined,
    ),
    logoScales,
    sizeChartId: (raw.sizeChartId as string) ?? '',
    mode: raw.mode === 'single' ? 'single' : 'dual',
    legal: (raw.legal as LegalProfile) ?? legalProfileById('adult-class-a'),
    outputs: (raw.outputs as LabelDocument['outputs']) ?? {
      sizeLabelNormal: false,
      sizeLabelDouble: true,
      boxLabel: true,
      sizeChart: true,
    },
    sizeChartFootnote: (raw.sizeChartFootnote as string) ?? 'Range sizes',
    boxProductMode: mode,
    boxProducts,
    boxDimensionsMm: clampBoxDimensions(
      (raw.boxDimensionsMm as BoxDimensionsMm) ?? DEFAULT_BOX_DIMENSIONS_MM,
    ),
    enabledSizeSystems: normalizeEnabledSystems(
      raw.enabledSizeSystems as SizeSystem[] | undefined,
    ),
    boxTableFlow: normalizeBoxTableFlow(
      raw.boxTableFlow as BoxTableFlow | undefined,
    ),
    boxLayout,
    legalDisplay: normalizeLegalDisplay(
      raw.legalDisplay as Partial<LegalDisplayOptions> | undefined,
      legacy,
    ),
    pdfFontMode: raw.pdfFontMode === 'editable' ? 'editable' : 'outlined',
    boxTextColorMode: raw.boxTextColorMode === 'brand' ? 'brand' : 'pure-k',
  }
  return doc
}

export function migratePreset(preset: ModelPreset): ModelPreset {
  const legacy = preset.boxProductMode == null && preset.boxDimensionsMm == null
  const primary = emptyBoxProductSlot(
    // title from defaultTitle
    '',
    preset.defaultSku ?? '',
  )
  primary.title = structuredClone(preset.defaultTitle)
  if (preset.defaultProductImageId) {
    primary.imageName = preset.defaultProductImageId
    primary.imagePath = `content/products/${preset.defaultProductImageId}`
  }

  const boxProducts =
    preset.boxProducts?.length
      ? preset.boxProducts
      : [primary]

  const boxLogos = [...(preset.boxLogos ?? [])]
  const boxLayout = normalizeBoxLayout(preset.boxLayout)
  const logoScales = normalizeLogoScales(
    preset.logoScales,
    boxLayout.wordmarkScale,
  )
  boxLayout.wordmarkScale = logoScales.brandWordmark
  return {
    ...preset,
    boxProductMode: preset.boxProductMode ?? 'single',
    boxProducts,
    boxDimensionsMm: clampBoxDimensions(
      preset.boxDimensionsMm ?? DEFAULT_BOX_DIMENSIONS_MM,
    ),
    enabledSizeSystems: normalizeEnabledSystems(
      preset.enabledSizeSystems,
      preset.sizeTable?.rows,
    ),
    boxTableFlow: normalizeBoxTableFlow(preset.boxTableFlow),
    boxLayout,
    sizeLabelSheet: normalizeSizeLabelSheet(preset.sizeLabelSheet),
    logoScales,
    legalDisplay: normalizeLegalDisplay(preset.legalDisplay, legacy),
    pdfFontMode: preset.pdfFontMode ?? 'outlined',
    boxTextColorMode: preset.boxTextColorMode ?? 'pure-k',
    boxLogoRefs:
      preset.boxLogoRefs ??
      boxLogos.map((id) => ({ kind: 'catalog' as const, id })),
    customLogos: preset.customLogos ?? [],
  }
}

/** Split stacked tables when the size run exceeds this many columns. */
export const AUTO_SPLIT_COLUMN_THRESHOLD = 13

/** @deprecated Prefer AUTO_SPLIT_COLUMN_THRESHOLD */
export const MIN_BOX_COL_W_MM = 7.2

export type TableFlowDecision = {
  split: boolean
  splitIndex: number
  colCountFirst: number
  colCountSecond: number
  estimatedColW: number
  warning?: string
}

/**
 * Decide whether the size run should split into two stacked tables.
 * Auto splits when columns > 13. Dual keeps one dense table (no split).
 */
export function decideTableFlow(args: {
  flow: BoxTableFlow
  rowCount: number
  availableWidthMm: number
  productMode: BoxProductMode
}): TableFlowDecision {
  const { rowCount, availableWidthMm, productMode } = args
  void args.flow
  const n = Math.max(rowCount, 1)
  const estimatedColW = availableWidthMm / n
  const needsSplit = n > AUTO_SPLIT_COLUMN_THRESHOLD
  const balancedIndex = Math.ceil(n / 2)

  if (!needsSplit) {
    return {
      split: false,
      splitIndex: n,
      colCountFirst: n,
      colCountSecond: 0,
      estimatedColW,
    }
  }
  if (productMode === 'dual') {
    return {
      split: false,
      splitIndex: n,
      colCountFirst: n,
      colCountSecond: 0,
      estimatedColW,
      // Dual keeps one dense table; split is single-only.
    }
  }
  return {
    split: true,
    splitIndex: balancedIndex,
    colCountFirst: balancedIndex,
    colCountSecond: n - balancedIndex,
    estimatedColW: availableWidthMm / balancedIndex,
  }
}

/** Parse EU value(s); return null if a range crosses the threshold. */
export function euValuesForClass(eu: string): number[] | null {
  const parts = eu
    .split(/[-–—/]/)
    .map((p) => parseFloat(p.trim()))
    .filter((n) => Number.isFinite(n))
  return parts.length ? parts : null
}

export function suggestClassForEu(
  eu: string,
  threshold = 34,
): 'class-a' | 'class-b' | 'crosses' | null {
  const vals = euValuesForClass(eu)
  if (!vals?.length) return null
  const below = vals.some((v) => v <= threshold)
  const above = vals.some((v) => v > threshold)
  if (below && above) return 'crosses'
  return below ? 'class-b' : 'class-a'
}

export function bulkAssignClassByEu(
  table: SizeChartTable,
  threshold = 34,
): { table: SizeChartTable; crosses: number[] } {
  const crosses: number[] = []
  const rows = table.rows.map((row, i) => {
    const suggestion = suggestClassForEu(row.eu, threshold)
    if (suggestion === 'crosses') {
      crosses.push(i)
      return { ...row }
    }
    if (suggestion === 'class-b') {
      return { ...row, legalProfileId: 'kids-class-b' }
    }
    if (suggestion === 'class-a') {
      return { ...row, legalProfileId: 'adult-class-a' }
    }
    return { ...row }
  })
  return { table: { ...table, rows }, crosses }
}

export function resolveRowLegal(
  row: SizeRow,
  fallback: LegalProfile,
): LegalProfile {
  if (!row.legalProfileId) return fallback
  if (row.legalProfileId === 'none') {
    return { ...fallback, id: 'none', classText: '', standard: '', weightRange: '' }
  }
  return legalProfileById(row.legalProfileId)
}
