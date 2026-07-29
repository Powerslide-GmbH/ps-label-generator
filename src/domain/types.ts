export type Cmyk = { c: number; m: number; y: number; k: number }

export type TextRun = {
  text: string
  bold?: boolean
  fontSize?: number
}

export type RichText = TextRun[]

export type SizeSystem = 'MONDO' | 'US M' | 'US W' | 'US Kids' | 'UK' | 'EU'

export type SizeSystemKey = 'mondo' | 'usM' | 'usW' | 'usKids' | 'uk' | 'eu'

export type SizeRow = {
  mondo: string
  usM: string
  usW: string
  usKids?: string
  uk: string
  eu: string
  /** Optional per-row legal profile override (size labels). */
  legalProfileId?: string
}

/** How size values are written in the table (single number vs range like 36-38). */
export type SizeGroupMode = 'single' | 'dual'

export type SizeChartTable = {
  id: string
  name: string
  mode: SizeGroupMode
  rows: SizeRow[]
}

export type LegalProfile = {
  id: string
  classText: string
  standard: string
  weightRange: string
  company: string
  address: string
  phone: string
  fax: string
  web: string
  email: string
  madeIn: string
}

export type LegalDisplayOptions = {
  showCompany: boolean
  showPostalAddress: boolean
  showPhoneFax: boolean
  showWebEmail: boolean
  showStandard: boolean
  showClass: boolean
  showWeight: boolean
  showMadeIn: boolean
}

export type BoxProductMode = 'single' | 'dual'

export type BoxProductSlot = {
  title: RichText
  subtitle?: string
  sku: string
  imagePath: string | null
  imageName: string | null
  /** @deprecated Unused in UI; SKU mark boxes are drawn by the layout. */
  markingLabel?: string
}

export type BoxDimensionsMm = {
  width: number
  height: number
}

export type BoxTableFlowMode = 'auto' | 'single' | 'split'

export type BoxTableFlow = {
  mode: BoxTableFlowMode
  /** Index of the first row belonging to the second table when split. */
  splitIndex?: number
}

export type PdfFontMode = 'outlined' | 'editable'

export type BoxTextColorMode = 'pure-k' | 'brand'

export type PrintColorIntent = 'pure-k' | 'brand-cmyk' | 'source-artwork' | 'paper'

export type LogoRef =
  | { kind: 'catalog'; id: string }
  | {
      kind: 'inline'
      id: string
      name: string
      mime: string
      data: string
      aspectRatio: number
      /** True when source is a CMYK PDF (recommended). */
      cmykPreserving?: boolean
    }

export type OutputSelection = {
  /** MASTER SIZE - NORMAL (45×30 mm) */
  sizeLabelNormal: boolean
  /** MASTER SIZE - DOUBLE (76×23 mm) */
  sizeLabelDouble: boolean
  boxLabel: boolean
  sizeChart: boolean
}

export type AssetRef = {
  id: string
  path: string
  label: string
  name: string
  /** Natural width / height when known (SVG viewBox). Used to lock height. */
  aspectRatio?: number
  mime?: string
  /** Preview asset path when production asset differs. */
  previewPath?: string
  /** Declared color space for production artwork. */
  colorSpace?: 'cmyk' | 'rgb' | 'unknown'
}

export type MaterialSelection = {
  /** Material icon for upper location (leather / synthetic / textile). */
  upper?: string
  /** Material icon for lining location. */
  lining?: string
  /** Material icon for sole location. */
  sole?: string
  /** @deprecated Old single material field — migrated into upper/lining/sole. */
  materialType?: string
}

/** Title size per output (size labels & box in mm, size chart in px). */
export type TitleSizes = {
  /** Normal 45×30 mm size label. */
  sizeLabel: number
  /** Double 76×23 mm folded size label. */
  sizeLabelDouble: number
  box: number
  sizeChart: number
}

/** One product preset: branding + outputs + embedded size table. */
export type ModelPreset = {
  id: string
  name: string
  brandColorHex: string
  brandColorCmyk: Cmyk
  brandWordmarkLogoId?: string
  /** Blue PS badge used on size-label page header (and similar). */
  badgeLogoId?: string
  /** @deprecated Prefer sizeTable embedded in the preset. */
  sizeChartId?: string
  mode: SizeGroupMode
  /** Size run included in the preset (required for new presets). */
  sizeTable?: SizeChartTable
  defaultTitle: RichText
  defaultSku?: string
  boxLogos: string[]
  /** Catalog + inline logo references for box (preferred over boxLogos alone). */
  boxLogoRefs?: LogoRef[]
  customLogos?: Extract<LogoRef, { kind: 'inline' }>[]
  sizeChartLogos: string[]
  materials?: MaterialSelection
  titleSizes?: Partial<TitleSizes>
  legalProfileId: string
  outputs: OutputSelection
  defaultProductImageId?: string
  boxProductMode?: BoxProductMode
  boxProducts?: BoxProductSlot[]
  boxDimensionsMm?: BoxDimensionsMm
  enabledSizeSystems?: SizeSystem[]
  boxTableFlow?: BoxTableFlow
  legalDisplay?: LegalDisplayOptions
  pdfFontMode?: PdfFontMode
  boxTextColorMode?: BoxTextColorMode
}

export type LabelDocument = {
  presetId: string | null
  sku: string
  title: RichText
  productImagePath: string | null
  productImageName: string | null
  brandColorHex: string
  brandColorCmyk: Cmyk
  brandWordmarkLogoId: string | null
  badgeLogoId: string | null
  boxLogos: string[]
  boxLogoRefs: LogoRef[]
  customLogos: Extract<LogoRef, { kind: 'inline' }>[]
  sizeChartLogos: string[]
  materials: MaterialSelection
  titleSizes: TitleSizes
  sizeChartId: string
  mode: SizeGroupMode
  legal: LegalProfile
  outputs: OutputSelection
  sizeChartFootnote: string
  boxProductMode: BoxProductMode
  boxProducts: BoxProductSlot[]
  boxDimensionsMm: BoxDimensionsMm
  enabledSizeSystems: SizeSystem[]
  boxTableFlow: BoxTableFlow
  legalDisplay: LegalDisplayOptions
  pdfFontMode: PdfFontMode
  boxTextColorMode: BoxTextColorMode
}

export type ContentManifest = {
  generatedAt: string
  logos: AssetRef[]
  fonts: AssetRef[]
  products: AssetRef[]
  sizecharts: AssetRef[]
  models: AssetRef[]
  icc: AssetRef[]
}

export type LayoutOverflow = {
  block: string
  message: string
}

export const MM_TO_PT = 72 / 25.4
export const A4_MM = { w: 297, h: 210 }
/** Production sheet padding around label for dimension callouts. */
export const BOX_SHEET_PAD_MM = { x: 28.15, y: 13.79 }
/** @deprecated Prefer dynamic sheet from label dimensions + pad. */
export const BOX_SHEET_MM = { w: 196.3, h: 147.58 }
export const SIZE_DOUBLE_SHEET_MM = { w: 206.43, h: 130.67 }
export const SIZE_NORMAL_SHEET_MM = A4_MM
/** @deprecated use SIZE_DOUBLE_SHEET_MM */
export const SIZE_DUAL_SHEET_MM = SIZE_DOUBLE_SHEET_MM
/** @deprecated use SIZE_NORMAL_SHEET_MM */
export const SIZE_SINGLE_SHEET_MM = SIZE_NORMAL_SHEET_MM

export const DEFAULT_RICH_BLACK: Cmyk = { c: 0.6, m: 0.4, y: 0.4, k: 1 }
export const PURE_BLACK: Cmyk = { c: 0, m: 0, y: 0, k: 1 }

export const POWERSLIDE_BLUE_HEX = '#416BE0'
export const POWERSLIDE_BLUE_CMYK: Cmyk = { c: 0.76, m: 0.51, y: 0, k: 0 }

export const ALL_SIZE_SYSTEMS: SizeSystem[] = [
  'MONDO',
  'US M',
  'US W',
  'US Kids',
  'UK',
  'EU',
]

export const DEFAULT_SIZE_SYSTEMS: SizeSystem[] = [
  'MONDO',
  'US M',
  'US W',
  'UK',
  'EU',
]

export const COMMON_BOX_SIZES_MM: BoxDimensionsMm[] = [
  { width: 140, height: 120 },
  { width: 125, height: 110 },
  { width: 120, height: 100 },
]

export const MIN_BOX_DIMENSIONS_MM: BoxDimensionsMm = {
  width: 90,
  height: 70,
}

/** Fixed location icons on size labels (not designer-selectable). */
export const LOCATION_LOGO_IDS = {
  upper: 'label_upper_material',
  lining: 'label_liner_material',
  sole: 'label_insole_material',
} as const

/** Selectable material-type icons (paired with each location). */
export const MATERIAL_TYPE_LOGO_IDS = [
  'label_leather_material',
  'label_syntetic_material',
  'label_textile_material',
] as const

const LOCATION_ID_SET = new Set<string>(Object.values(LOCATION_LOGO_IDS))
const MATERIAL_ID_SET = new Set<string>(MATERIAL_TYPE_LOGO_IDS)

export function isMaterialTypeLogoId(id: string | undefined | null): boolean {
  return Boolean(id && MATERIAL_ID_SET.has(id))
}

/** Coerce legacy presets where upper/lining/sole pointed at location icons. */
export function normalizeMaterials(
  raw?: MaterialSelection | null,
): MaterialSelection {
  const fallback =
    (raw?.materialType && isMaterialTypeLogoId(raw.materialType)
      ? raw.materialType
      : null) ?? 'label_syntetic_material'
  const pick = (id: string | undefined, prefer?: string) => {
    if (id && isMaterialTypeLogoId(id)) return id
    if (prefer && isMaterialTypeLogoId(prefer)) return prefer
    if (id && LOCATION_ID_SET.has(id)) return fallback
    return fallback
  }
  return {
    upper: pick(raw?.upper, raw?.materialType),
    lining: pick(raw?.lining, 'label_textile_material'),
    sole: pick(raw?.sole, raw?.materialType),
  }
}

export const DEFAULT_MATERIALS: MaterialSelection = {
  upper: 'label_syntetic_material',
  lining: 'label_textile_material',
  sole: 'label_syntetic_material',
}

/** Defaults tuned to documentation masters. */
export const DEFAULT_TITLE_SIZES: TitleSizes = {
  sizeLabel: 2.2,
  sizeLabelDouble: 2.3,
  box: 4.8,
  sizeChart: 38,
}

export const DEFAULT_LEGAL_DISPLAY: LegalDisplayOptions = {
  showCompany: true,
  showPostalAddress: false,
  showPhoneFax: true,
  showWebEmail: true,
  showStandard: true,
  showClass: true,
  showWeight: true,
  showMadeIn: true,
}

/** Migrated legacy presets keep address visible to match previous output. */
export const LEGACY_LEGAL_DISPLAY: LegalDisplayOptions = {
  ...DEFAULT_LEGAL_DISPLAY,
  showPostalAddress: true,
}

export const DEFAULT_BOX_DIMENSIONS_MM: BoxDimensionsMm = {
  width: 140,
  height: 120,
}

export const DEFAULT_BOX_TABLE_FLOW: BoxTableFlow = { mode: 'auto' }

export const STORAGE_VERSION = 5
