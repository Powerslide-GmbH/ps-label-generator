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

export const DEFAULT_LEGAL: LegalProfile = {
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
}

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
  const table = sizeTableFromPreset(preset)
  return {
    presetId: preset.id,
    sku: preset.defaultSku ?? '',
    title: structuredClone(preset.defaultTitle),
    productImagePath: preset.defaultProductImageId
      ? `content/products/${preset.defaultProductImageId}`
      : null,
    productImageName: preset.defaultProductImageId ?? null,
    brandColorHex: preset.brandColorHex,
    brandColorCmyk: { ...preset.brandColorCmyk },
    brandWordmarkLogoId: preset.brandWordmarkLogoId ?? 'powerslide_logo_blue',
    badgeLogoId: preset.badgeLogoId ?? 'PS_small_CMYK',
    boxLogos: [...preset.boxLogos],
    sizeChartLogos: [...preset.sizeChartLogos],
    materials: normalizeMaterials({ ...DEFAULT_MATERIALS, ...preset.materials }),
    titleSizes: { ...DEFAULT_TITLE_SIZES, ...preset.titleSizes },
    sizeChartId: table.id || preset.sizeChartId || '',
    mode: table.mode || preset.mode,
    legal: structuredClone(legal),
    outputs: { ...preset.outputs },
    sizeChartFootnote:
      (table.mode || preset.mode) === 'dual' ? 'Range sizes' : 'Single sizes',
  }
}

export function emptyDocument(): LabelDocument {
  return {
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
  }
}

export function documentToModelPreset(
  doc: LabelDocument,
  name: string,
  sizeTable: SizeChartTable,
  id?: string,
): ModelPreset {
  const table = cloneSizeTable(sizeTable)
  table.id = table.id || id || `preset-${Date.now()}`
  table.name = table.name || name
  table.mode = doc.mode
  return {
    id: id ?? `user-${Date.now()}`,
    name,
    brandColorHex: doc.brandColorHex,
    brandColorCmyk: { ...doc.brandColorCmyk },
    brandWordmarkLogoId: doc.brandWordmarkLogoId ?? undefined,
    badgeLogoId: doc.badgeLogoId ?? undefined,
    sizeChartId: table.id,
    mode: doc.mode,
    sizeTable: table,
    defaultTitle: structuredClone(doc.title),
    defaultSku: doc.sku,
    boxLogos: [...doc.boxLogos],
    sizeChartLogos: [...doc.sizeChartLogos],
    materials: normalizeMaterials(doc.materials),
    titleSizes: { ...doc.titleSizes },
    legalProfileId: doc.legal.id,
    outputs: { ...doc.outputs },
    defaultProductImageId: doc.productImageName ?? undefined,
  }
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
