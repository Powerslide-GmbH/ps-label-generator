import type {
  AssetRef,
  ContentManifest,
  MaterialSelection,
  ModelPreset,
  SizeChartTable,
  SizeRow,
} from '@/domain/types'
import { LOCATION_LOGO_IDS, normalizeMaterials } from '@/domain/types'

export type CatalogWarning = {
  file?: string
  field?: string
  message: string
}

export type Catalog = {
  manifest: ContentManifest
  presets: ModelPreset[]
  sizeCharts: SizeChartTable[]
  logoById: Map<string, AssetRef>
  productById: Map<string, AssetRef>
  warnings: CatalogWarning[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function validateSizeRow(row: unknown, index: number, file: string, warnings: CatalogWarning[]) {
  if (!isObject(row)) {
    warnings.push({ file, field: `rows[${index}]`, message: 'Row must be an object' })
    return null
  }
  return {
    mondo: asString(row.mondo) ?? '',
    usM: asString(row.usM) ?? '',
    usW: asString(row.usW) ?? '',
    uk: asString(row.uk) ?? '',
    eu: asString(row.eu) ?? '',
  } satisfies SizeRow
}

export function parseSizeChartJson(
  raw: unknown,
  file: string,
  warnings: CatalogWarning[],
): SizeChartTable | null {
  if (!isObject(raw)) {
    warnings.push({ file, message: 'Size chart must be a JSON object' })
    return null
  }
  const id = asString(raw.id)
  const name = asString(raw.name)
  const mode = raw.mode === 'single' || raw.mode === 'dual' ? raw.mode : null
  if (!id || !name || !mode) {
    warnings.push({
      file,
      field: 'id|name|mode',
      message: 'Missing required size chart fields (id, name, mode)',
    })
    return null
  }
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    warnings.push({ file, field: 'rows', message: 'Size chart needs at least one row' })
    return null
  }
  const rows = raw.rows
    .map((row, i) => validateSizeRow(row, i, file, warnings))
    .filter((r): r is SizeRow => Boolean(r))
  if (!rows.length) return null
  return { id, name, mode, rows }
}

function parseMaterials(raw: unknown): MaterialSelection {
  if (!isObject(raw)) return {}
  return {
    upper: asString(raw.upper) ?? undefined,
    lining: asString(raw.lining) ?? undefined,
    sole: asString(raw.sole) ?? undefined,
    materialType: asString(raw.materialType) ?? undefined,
  }
}

export function parseModelJson(
  raw: unknown,
  file: string,
  warnings: CatalogWarning[],
): ModelPreset | null {
  if (!isObject(raw)) {
    warnings.push({ file, message: 'Model must be a JSON object' })
    return null
  }
  const id = asString(raw.id)
  const name = asString(raw.name)
  const sizeChartId = asString(raw.sizeChartId) ?? undefined
  let mode = raw.mode === 'single' || raw.mode === 'dual' ? raw.mode : null
  const brandColorHex = asString(raw.brandColorHex)
  const legalProfileId = asString(raw.legalProfileId)

  let sizeTable: SizeChartTable | undefined
  if (raw.sizeTable != null) {
    const parsed = parseSizeChartJson(raw.sizeTable, `${file}#sizeTable`, warnings)
    if (parsed) {
      sizeTable = parsed
      if (!mode) mode = parsed.mode
    }
  }

  if (!id || !name || !brandColorHex || !legalProfileId || !mode) {
    warnings.push({
      file,
      field: 'id|name|mode|brandColorHex|legalProfileId',
      message: 'Missing required preset fields',
    })
    return null
  }
  if (!sizeTable && !sizeChartId) {
    warnings.push({
      file,
      field: 'sizeTable',
      message: 'Preset needs sizeTable (or legacy sizeChartId)',
    })
    return null
  }
  if (!Array.isArray(raw.defaultTitle) || !raw.defaultTitle.length) {
    warnings.push({ file, field: 'defaultTitle', message: 'defaultTitle is required' })
    return null
  }
  if (!isObject(raw.outputs)) {
    warnings.push({ file, field: 'outputs', message: 'outputs is required' })
    return null
  }
  const out = raw.outputs as Record<string, unknown>
  const cmyk = isObject(raw.brandColorCmyk) ? raw.brandColorCmyk : { c: 0, m: 0, y: 0, k: 1 }
  return {
    id,
    name,
    brandColorHex,
    brandColorCmyk: {
      c: Number(cmyk.c) || 0,
      m: Number(cmyk.m) || 0,
      y: Number(cmyk.y) || 0,
      k: Number(cmyk.k) || 0,
    },
    brandWordmarkLogoId: asString(raw.brandWordmarkLogoId) ?? undefined,
    badgeLogoId: asString(raw.badgeLogoId) ?? undefined,
    sizeChartId: sizeChartId ?? sizeTable?.id,
    mode,
    sizeTable,
    defaultTitle: raw.defaultTitle as ModelPreset['defaultTitle'],
    defaultSku: asString(raw.defaultSku) ?? undefined,
    boxLogos: Array.isArray(raw.boxLogos)
      ? raw.boxLogos.filter((x): x is string => typeof x === 'string')
      : [],
    sizeChartLogos: Array.isArray(raw.sizeChartLogos)
      ? raw.sizeChartLogos.filter((x): x is string => typeof x === 'string')
      : [],
    materials: normalizeMaterials(parseMaterials(raw.materials)),
    titleSizes: isObject(raw.titleSizes)
      ? (raw.titleSizes as ModelPreset['titleSizes'])
      : undefined,
    legalProfileId,
    outputs: {
      sizeLabelNormal: Boolean(
        out.sizeLabelNormal ?? out.sizeLabelSingle ?? false,
      ),
      sizeLabelDouble: Boolean(
        out.sizeLabelDouble ?? out.sizeLabelDual ?? false,
      ),
      boxLabel: Boolean(out.boxLabel),
      sizeChart: Boolean(out.sizeChart),
    },
    defaultProductImageId: asString(raw.defaultProductImageId) ?? undefined,
  }
}

function collectLogoRefs(preset: ModelPreset): string[] {
  const mats = normalizeMaterials(preset.materials)
  const ids = [
    preset.brandWordmarkLogoId,
    preset.badgeLogoId,
    ...preset.boxLogos,
    ...preset.sizeChartLogos,
    mats.upper,
    mats.lining,
    mats.sole,
    ...Object.values(LOCATION_LOGO_IDS),
  ]
  return ids.filter((x): x is string => Boolean(x))
}

export async function loadCatalog(baseUrl = './'): Promise<Catalog> {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const warnings: CatalogWarning[] = []
  const manifest = (await fetch(`${root}content/manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`Failed to load manifest (${r.status})`)
    return r.json()
  })) as ContentManifest

  if (!manifest.models) manifest.models = []
  if (!manifest.sizecharts) manifest.sizecharts = []

  const logoById = new Map(manifest.logos.map((l) => [l.id, l]))
  const productById = new Map<string, AssetRef>()
  for (const p of manifest.products) {
    productById.set(p.id, p)
    productById.set(p.name, p)
  }

  const sizeCharts: SizeChartTable[] = []
  const sizeById = new Map<string, SizeChartTable>()
  for (const ref of manifest.sizecharts) {
    try {
      const raw = await fetch(`${root}${ref.path}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      const table = parseSizeChartJson(raw, ref.path, warnings)
      if (!table) continue
      if (sizeById.has(table.id)) {
        warnings.push({
          file: ref.path,
          field: 'id',
          message: `Duplicate size chart id "${table.id}"`,
        })
        continue
      }
      sizeById.set(table.id, table)
      sizeCharts.push(table)
    } catch (e) {
      warnings.push({
        file: ref.path,
        message: e instanceof Error ? e.message : 'Failed to load size chart',
      })
    }
  }

  const presets: ModelPreset[] = []
  const modelById = new Map<string, ModelPreset>()
  for (const ref of manifest.models) {
    try {
      const raw = await fetch(`${root}${ref.path}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      const preset = parseModelJson(raw, ref.path, warnings)
      if (!preset) continue
      if (modelById.has(preset.id)) {
        warnings.push({
          file: ref.path,
          field: 'id',
          message: `Duplicate model id "${preset.id}"`,
        })
        continue
      }
      // Resolve legacy sizeChartId → embedded sizeTable when missing
      if (!preset.sizeTable && preset.sizeChartId) {
        const chart = sizeById.get(preset.sizeChartId)
        if (chart) {
          preset.sizeTable = structuredClone(chart)
        } else {
          warnings.push({
            file: ref.path,
            field: 'sizeChartId',
            message: `Unknown sizeChartId "${preset.sizeChartId}"`,
          })
        }
      }
      for (const logoId of collectLogoRefs(preset)) {
        if (!logoById.has(logoId)) {
          warnings.push({
            file: ref.path,
            field: 'logos',
            message: `Unknown logo id "${logoId}"`,
          })
        }
      }
      if (preset.defaultProductImageId) {
        const pid = preset.defaultProductImageId.replace(/\.[^.]+$/, '')
        if (!productById.has(preset.defaultProductImageId) && !productById.has(pid)) {
          warnings.push({
            file: ref.path,
            field: 'defaultProductImageId',
            message: `Unknown product image "${preset.defaultProductImageId}"`,
          })
        }
      }
      modelById.set(preset.id, preset)
      presets.push(preset)
    } catch (e) {
      warnings.push({
        file: ref.path,
        message: e instanceof Error ? e.message : 'Failed to load model',
      })
    }
  }

  return { manifest, presets, sizeCharts, logoById, productById, warnings }
}

export function contentUrl(relPath: string, baseUrl = './'): string {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${root}${relPath.replace(/^\.\//, '').replace(/^\//, '')}`
}
