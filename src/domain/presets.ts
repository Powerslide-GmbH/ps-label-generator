import {
  DEFAULT_MATERIALS,
  DEFAULT_TITLE_SIZES,
  POWERSLIDE_BLUE_CMYK,
  POWERSLIDE_BLUE_HEX,
  normalizeMaterials,
  type LabelDocument,
  type LegalProfile,
  type ModelPreset,
  type SizeChartTable,
} from './types'
import { richFromPlain } from './richText'
import { cloneSizeTable, createEmptySizeTable } from './sizechart'
import {
  emptyBoxProductSlot,
  legalProfileById,
  migrateDocument,
  migratePreset,
  normalizeBoxLayout,
  normalizeSizeLabelSheet,
  syncPrimaryProductFields,
} from './boxConfig'

export const DEFAULT_LEGAL: LegalProfile = legalProfileById('adult-class-a')

export function sizeTableFromPreset(
  preset: ModelPreset,
  fallbackCharts: SizeChartTable[] = [],
): SizeChartTable {
  if (preset.sizeTable?.rows?.length) {
    return cloneSizeTable(preset.sizeTable)
  }
  if (preset.sizeChartId) {
    const found = fallbackCharts.find((t) => t.id === preset.sizeChartId)
    if (found) return cloneSizeTable(found)
  }
  return createEmptySizeTable(preset.id, preset.mode)
}

export function documentFromPreset(
  preset: ModelPreset,
  legal: LegalProfile,
): LabelDocument {
  const normalized = migratePreset(preset)
  const table = sizeTableFromPreset(normalized)
  const primary =
    normalized.boxProducts?.[0] ??
    emptyBoxProductSlot(
      '',
      normalized.defaultSku ?? '',
    )
  if (!normalized.boxProducts?.[0]) {
    primary.title = structuredClone(normalized.defaultTitle)
    if (normalized.defaultProductImageId) {
      primary.imageName = normalized.defaultProductImageId
      primary.imagePath = `content/products/${normalized.defaultProductImageId}`
    }
  }

  const boxProducts =
    normalized.boxProductMode === 'dual'
      ? [
          primary,
          normalized.boxProducts?.[1] ?? emptyBoxProductSlot('PRODUCT 2', ''),
        ]
      : [primary]

  return migrateDocument({
    presetId: normalized.id,
    sku: primary.sku,
    // Dual: keep model/range title for size labels + side-by-side headers.
    // Product columns use boxProducts[*].title.
    title:
      normalized.boxProductMode === 'dual'
        ? structuredClone(normalized.defaultTitle)
        : structuredClone(primary.title),
    productImagePath: primary.imagePath,
    productImageName: primary.imageName,
    brandColorHex: normalized.brandColorHex,
    brandColorCmyk: { ...normalized.brandColorCmyk },
    brandWordmarkLogoId: normalized.brandWordmarkLogoId ?? 'powerslide_logo_blue',
    badgeLogoId: normalized.badgeLogoId ?? 'PS_small_CMYK',
    boxLogos: [...normalized.boxLogos],
    boxLogoRefs: normalized.boxLogoRefs,
    customLogos: normalized.customLogos,
    sizeChartLogos: [...normalized.sizeChartLogos],
    materials: normalizeMaterials({
      ...DEFAULT_MATERIALS,
      ...normalized.materials,
    }),
    titleSizes: { ...DEFAULT_TITLE_SIZES, ...normalized.titleSizes },
    sizeLabelSheet: normalizeSizeLabelSheet(normalized.sizeLabelSheet),
    sizeChartId: table.id || normalized.sizeChartId || '',
    mode: table.mode || normalized.mode,
    legal: structuredClone(
      normalized.legalProfileId === legal.id
        ? legal
        : legalProfileById(normalized.legalProfileId),
    ),
    outputs: { ...normalized.outputs },
    sizeChartFootnote:
      (table.mode || normalized.mode) === 'dual' ? 'Range sizes' : 'Single sizes',
    boxProductMode: normalized.boxProductMode,
    boxProducts,
    boxDimensionsMm: normalized.boxDimensionsMm,
    enabledSizeSystems: normalized.enabledSizeSystems,
    boxTableFlow: normalized.boxTableFlow,
    boxLayout: normalizeBoxLayout(normalized.boxLayout),
    legalDisplay: normalized.legalDisplay,
    pdfFontMode: normalized.pdfFontMode,
    boxTextColorMode: normalized.boxTextColorMode,
  })
}

export function emptyDocument(): LabelDocument {
  return migrateDocument({
    presetId: null,
    sku: '',
    title: richFromPlain('PRODUCT NAME', { bold: true }),
    productImagePath: null,
    productImageName: null,
    brandColorHex: POWERSLIDE_BLUE_HEX,
    brandColorCmyk: { ...POWERSLIDE_BLUE_CMYK },
    brandWordmarkLogoId: 'powerslide_logo_blue',
    badgeLogoId: 'PS_small_CMYK',
    boxLogos: ['PS_small_CMYK'],
    sizeChartLogos: ['PS_small_CMYK'],
    materials: { ...DEFAULT_MATERIALS },
    titleSizes: { ...DEFAULT_TITLE_SIZES },
    sizeChartId: '',
    mode: 'dual',
    legal: structuredClone(DEFAULT_LEGAL),
    outputs: {
      sizeLabelNormal: false,
      sizeLabelDouble: true,
      boxLabel: true,
      sizeChart: true,
    },
    sizeChartFootnote: 'Range sizes',
  })
}

export function documentToModelPreset(
  doc: LabelDocument,
  name: string,
  sizeTable: SizeChartTable,
  id?: string,
): ModelPreset {
  const synced = syncPrimaryProductFields(doc)
  const table = cloneSizeTable(sizeTable)
  table.id = table.id || id || `preset-${Date.now()}`
  table.name = table.name || name
  table.mode = synced.mode
  return migratePreset({
    id: id ?? `user-${Date.now()}`,
    name,
    brandColorHex: synced.brandColorHex,
    brandColorCmyk: { ...synced.brandColorCmyk },
    brandWordmarkLogoId: synced.brandWordmarkLogoId ?? undefined,
    badgeLogoId: synced.badgeLogoId ?? undefined,
    sizeChartId: table.id,
    mode: synced.mode,
    sizeTable: table,
    defaultTitle: structuredClone(synced.title),
    defaultSku: synced.sku,
    boxLogos: [...synced.boxLogos],
    boxLogoRefs: [...synced.boxLogoRefs],
    customLogos: [...synced.customLogos],
    sizeChartLogos: [...synced.sizeChartLogos],
    materials: normalizeMaterials(synced.materials),
    titleSizes: { ...synced.titleSizes },
    sizeLabelSheet: { ...synced.sizeLabelSheet },
    legalProfileId: synced.legal.id,
    outputs: { ...synced.outputs },
    defaultProductImageId: synced.productImageName ?? undefined,
    boxProductMode: synced.boxProductMode,
    boxProducts: structuredClone(synced.boxProducts),
    boxDimensionsMm: { ...synced.boxDimensionsMm },
    enabledSizeSystems: [...synced.enabledSizeSystems],
    boxTableFlow: { ...synced.boxTableFlow },
    boxLayout: { ...synced.boxLayout },
    legalDisplay: { ...synced.legalDisplay },
    pdfFontMode: synced.pdfFontMode,
    boxTextColorMode: synced.boxTextColorMode,
  })
}

/** Normalize pasted hex (#RGB / #RRGGBB / without #). */
export function normalizeHex(input: string, fallback = POWERSLIDE_BLUE_HEX): string {
  let h = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback
  return `#${h.toUpperCase()}`
}
