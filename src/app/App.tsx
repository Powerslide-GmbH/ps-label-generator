import { useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalog, contentUrl, type Catalog } from '@/content/loadCatalog'
import {
  downloadJson,
  loadUserPresets,
  loadWorkingTable,
  readJsonFile,
  saveDocumentLocal,
  saveUserPresets,
  saveWorkingTable,
} from '@/content/storage'
import { recolorSvgUrl } from '@/content/tintSvg'
import {
  DEFAULT_LEGAL,
  documentFromPreset,
  documentToModelPreset,
  emptyDocument,
  normalizeHex,
  sizeTableFromPreset,
} from '@/domain/presets'
import { plainText } from '@/domain/richText'
import { exportBasename } from '@/domain/names'
import { cloneSizeTable, createEmptySizeTable, validateSizeTable } from '@/domain/sizechart'
import type {
  BoxProductSlot,
  LabelDocument,
  LegalDisplayOptions,
  ModelPreset,
  SizeChartTable,
  SizeSystem,
} from '@/domain/types'
import {
  DEFAULT_MATERIALS,
  DEFAULT_SIZE_SYSTEMS,
  LOCATION_LOGO_IDS,
  MATERIAL_TYPE_LOGO_IDS,
  normalizeMaterials,
} from '@/domain/types'
import { parseModelJson } from '@/content/loadCatalog'
import { LogoPicker } from '@/components/LogoPicker'
import {
  inlineLogoToAssetRef,
  type InlineLogo,
} from '@/domain/customLogo'
import { RichTextEditor } from '@/components/RichTextEditor'
import { OutputSelector } from '@/components/OutputSelector'
import { SizeTableEditor } from '@/components/SizeTableEditor'
import { BoxCompositionControls } from '@/components/BoxCompositionControls'
import { SceneSvg } from '@/templates/SceneSvg'
import {
  buildBoxLabelScene,
  buildSizeChartScene,
  buildSizeLabelScene,
} from '@/templates/scenes'
import { buildExports } from '@/export/pdfExport'
import { downloadExports } from '@/export/download'
import { decodeImageFile } from '@/export/imageDecode'
import {
  emptyBoxProductSlot,
  syncPrimaryProductFields,
} from '@/domain/boxConfig'
import { cmykToHex, hexToRgb, rgbToCmykApprox } from '@/export/cmyk'
import { parseAppUrl, syncAppUrl, type AppTab } from '@/app/urlState'
import './App.css'

type Tab = AppTab

function syncBoxPrimary(
  doc: LabelDocument,
  patch: Partial<Pick<LabelDocument, 'sku' | 'title' | 'productImagePath' | 'productImageName'>>,
): LabelDocument {
  const products = [...(doc.boxProducts ?? [])]
  const primary = products[0] ?? emptyBoxProductSlot()
  products[0] = {
    ...primary,
    sku: patch.sku ?? primary.sku,
    title: patch.title ? structuredClone(patch.title) : primary.title,
    imagePath:
      patch.productImagePath !== undefined
        ? patch.productImagePath
        : primary.imagePath,
    imageName:
      patch.productImageName !== undefined
        ? patch.productImageName
        : primary.imageName,
  }
  return {
    ...doc,
    ...patch,
    boxProducts: products,
  }
}

function ensureBoxProducts(doc: LabelDocument): BoxProductSlot[] {
  const products = [...(doc.boxProducts ?? [])]
  if (!products[0]) {
    products[0] = {
      ...emptyBoxProductSlot('', doc.sku),
      title: structuredClone(doc.title),
      imagePath: doc.productImagePath,
      imageName: doc.productImageName,
    }
  }
  return products
}

function applyBrandHex(doc: LabelDocument, hex: string): LabelDocument {
  const brandColorHex = normalizeHex(hex, doc.brandColorHex)
  const { r, g, b } = hexToRgb(brandColorHex)
  return {
    ...doc,
    brandColorHex,
    brandColorCmyk: rgbToCmykApprox(r, g, b),
  }
}

function applyBrandCmyk(
  doc: LabelDocument,
  channel: keyof LabelDocument['brandColorCmyk'],
  percent: number,
): LabelDocument {
  return {
    ...doc,
    brandColorCmyk: {
      ...doc.brandColorCmyk,
      [channel]: Math.max(0, Math.min(100, percent)) / 100,
    },
  }
}

async function resolveProductPreview(pathOrUrl: string): Promise<string> {
  const lower = pathOrUrl.toLowerCase()
  if (lower.startsWith('data:')) return pathOrUrl
  if (!lower.match(/\.tiff?($|\?)/)) return pathOrUrl
  const res = await fetch(pathOrUrl)
  const blob = await res.blob()
  const canvas = await decodeImageFile(blob)
  return canvas.toDataURL('image/jpeg', 0.9)
}

function productSourceUrl(
  imagePath: string | null | undefined,
  imageName: string | null | undefined,
): string | null {
  if (imagePath) {
    if (
      imagePath.startsWith('data:') ||
      imagePath.startsWith('blob:') ||
      imagePath.startsWith('http') ||
      imagePath.startsWith('./')
    ) {
      return imagePath
    }
    if (imagePath.startsWith('content/')) return contentUrl(imagePath)
    return contentUrl(imagePath)
  }
  if (imageName) return contentUrl(`content/products/${imageName}`)
  return null
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [userPresets, setUserPresets] = useState<ModelPreset[]>([])
  const [doc, setDoc] = useState<LabelDocument>(emptyDocument())
  const [workingTable, setWorkingTable] = useState<SizeChartTable>(
    createEmptySizeTable('working', 'dual'),
  )
  const [tab, setTab] = useState<Tab>('box')
  const [showPrintGuides, setShowPrintGuides] = useState(true)
  const [simulateCmyk, setSimulateCmyk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productPreviewUrl, setProductPreviewUrl] = useState<string | null>(null)
  const [productPreviewUrls, setProductPreviewUrls] = useState<(string | null)[]>([
    null,
    null,
  ])
  const [sizeWordmarkUrl, setSizeWordmarkUrl] = useState<string | null>(null)
  const modelFileRef = useRef<HTMLInputElement>(null)
  const tintUrlRef = useRef<string | null>(null)

  async function resolveDualProductPreviews(slots: LabelDocument['boxProducts']) {
    const results: (string | null)[] = [null, null]
    await Promise.all(
      [0, 1].map(async (i) => {
        const slot = slots[i]
        if (!slot) return
        const src = productSourceUrl(slot.imagePath, slot.imageName)
        if (!src) return
        try {
          results[i] = await resolveProductPreview(src)
        } catch {
          results[i] = src
        }
      }),
    )
    setProductPreviewUrls(results)
    if (results[0]) setProductPreviewUrl(results[0])
    return results
  }

  useEffect(() => {
    loadCatalog('./')
      .then((c) => {
        setCatalog(c)
        const localUsers = loadUserPresets()
        setUserPresets(localUsers)
        const savedTable = loadWorkingTable()
        const url = parseAppUrl()
        const fromUrl = url.preset
          ? [...c.presets, ...localUsers].find((p) => p.id === url.preset)
          : undefined
        const first = fromUrl ?? c.presets[0]
        if (first) {
          const next = documentFromPreset(first, DEFAULT_LEGAL)
          const table = sizeTableFromPreset(first, c.sizeCharts)
          setWorkingTable(
            savedTable?.id === table.id ? savedTable : table,
          )
          if (first.defaultProductImageId) {
            const productUrl = contentUrl(
              `content/products/${first.defaultProductImageId}`,
            )
            next.productImagePath = productUrl
            next.productImageName = first.defaultProductImageId
          }
          void resolveDualProductPreviews(next.boxProducts).catch(() => undefined)
          setDoc({ ...next, boxTableFlow: { mode: 'auto' } })
          const defaultTab: Tab = first.outputs.sizeLabelNormal
            ? 'size-normal'
            : first.outputs.sizeLabelDouble
              ? 'size-double'
              : 'box'
          const nextTab = url.tab ?? defaultTab
          setTab(nextTab)
          syncAppUrl({ preset: first.id, tab: nextTab }, 'replace')
        } else if (savedTable) {
          setWorkingTable(savedTable)
        }
        if (c.warnings.length) {
          setError(
            c.warnings
              .slice(0, 5)
              .map((w) => `${w.file ?? 'catalog'}${w.field ? `:${w.field}` : ''}: ${w.message}`)
              .join(' | '),
          )
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    saveDocumentLocal(doc)
  }, [doc])

  useEffect(() => {
    saveWorkingTable(workingTable)
  }, [workingTable])

  // Shareable URL: sync only preset + tab (never on keystroke field edits).
  useEffect(() => {
    if (!catalog) return
    syncAppUrl({ preset: doc.presetId, tab }, 'replace')
  }, [catalog, doc.presetId, tab])

  const allPresets = useMemo(
    () => [...(catalog?.presets ?? []), ...userPresets],
    [catalog, userPresets],
  )

  const catalogTable = useMemo(() => {
    // Prefer the size table baked into the active preset
    const preset = allPresets.find((p) => p.id === doc.presetId)
    if (preset?.sizeTable) return preset.sizeTable
    return catalog?.sizeCharts.find((t) => t.id === doc.sizeChartId)
  }, [allPresets, catalog, doc.presetId, doc.sizeChartId])

  const logoHref = (id: string | null | undefined) => {
    if (!id) return ''
    const custom = doc.customLogos.find((l) => l.id === id)
    if (custom) return custom.data
    if (!catalog) return ''
    const asset = catalog.logoById.get(id)
    return asset ? contentUrl(asset.path) : ''
  }

  const logoAspectRatio = (id: string | null | undefined) => {
    if (!id) return undefined
    const custom = doc.customLogos.find((l) => l.id === id)
    if (custom?.aspectRatio) return custom.aspectRatio
    return catalog?.logoById.get(id)?.aspectRatio
  }

  useEffect(() => {
    const href = logoHref(doc.brandWordmarkLogoId)
    if (!href) {
      setSizeWordmarkUrl(null)
      return
    }
    let cancelled = false
    let createdUrl: string | null = null
    // Size labels are K-only: force wordmark to black from the selected color logo
    void recolorSvgUrl(href, '#1d1d1b')
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        createdUrl = url
        const prev = tintUrlRef.current
        tintUrlRef.current = url
        setSizeWordmarkUrl(url)
        // Revoke previous blob after swap so preview images never go blank
        if (prev && prev !== url) URL.revokeObjectURL(prev)
      })
      .catch(() => {
        if (!cancelled) setSizeWordmarkUrl(href)
      })
    return () => {
      cancelled = true
      if (createdUrl && tintUrlRef.current !== createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.brandWordmarkLogoId, catalog])

  const materialPairs = useMemo(() => {
    const m = normalizeMaterials(doc.materials ?? DEFAULT_MATERIALS)
    return [
      {
        locationHref: logoHref(LOCATION_LOGO_IDS.upper),
        materialHref: logoHref(m.upper),
      },
      {
        locationHref: logoHref(LOCATION_LOGO_IDS.lining),
        materialHref: logoHref(m.lining),
      },
      {
        locationHref: logoHref(LOCATION_LOGO_IDS.sole),
        materialHref: logoHref(m.sole),
      },
    ].filter((p) => p.locationHref && p.materialHref)
  }, [doc.materials, catalog])

  const scenes = useMemo(() => {
    const table = workingTable
    if (!table.rows.length) return null
    const boxLogos: Array<{ href: string; aspectRatio?: number }> = []
    const logoIds =
      doc.boxLogoRefs.length > 0
        ? doc.boxLogoRefs.map((ref) =>
            ref.kind === 'inline' ? ref.id : ref.id,
          )
        : doc.boxLogos
    for (const id of logoIds) {
      const custom = doc.customLogos.find((l) => l.id === id)
      const asset = catalog?.logoById.get(id)
      const href =
        custom?.data ??
        (asset ? contentUrl(asset.path) : logoHref(id))
      if (!href) continue
      boxLogos.push({
        href,
        aspectRatio: custom?.aspectRatio ?? asset?.aspectRatio,
      })
    }
    const chartLogos = doc.sizeChartLogos.map(logoHref).filter(Boolean)
    const product = productPreviewUrl || doc.productImagePath
    const dualHrefs: (string | null)[] = [
      productPreviewUrls[0] || product || productSourceUrl(
        doc.boxProducts[0]?.imagePath,
        doc.boxProducts[0]?.imageName,
      ),
      productPreviewUrls[1] ||
        productSourceUrl(
          doc.boxProducts[1]?.imagePath,
          doc.boxProducts[1]?.imageName,
        ),
    ]
    const colorWordmark = logoHref(doc.brandWordmarkLogoId) || undefined
    const fallbackPageLogoId = catalog?.logoById.has('PS_small_CMYK')
      ? 'PS_small_CMYK'
      : 'PS_big_CMYK'
    const pageLogoId = doc.badgeLogoId || fallbackPageLogoId
    const assets = {
      // Color wordmark as selected (box + size-sheet footer)
      wordmarkHref: colorWordmark,
      boxWordmarkHref: colorWordmark,
      boxWordmarkAspectRatio: logoAspectRatio(doc.brandWordmarkLogoId),
      // Black wordmark for individual size-label pieces
      sizeWordmarkHref: sizeWordmarkUrl || colorWordmark,
      pageLogoHref: logoHref(pageLogoId) || undefined,
      pageLogoAspectRatio: logoAspectRatio(pageLogoId),
      materialPairs,
      classLogoHref: logoHref('label_class') || undefined,
      showPrintGuides,
      productHrefs: dualHrefs,
    }
    return {
      normal: buildSizeLabelScene(doc, table, false, assets),
      double: buildSizeLabelScene(doc, table, true, assets),
      box: buildBoxLabelScene(doc, table, boxLogos, product, assets),
      sizechart: buildSizeChartScene(doc, table, chartLogos),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, workingTable, productPreviewUrl, productPreviewUrls, catalog, sizeWordmarkUrl, materialPairs, showPrintGuides])

  function kidsEnabledSystems(kids: boolean): SizeSystem[] {
    const base = [...DEFAULT_SIZE_SYSTEMS]
    if (!kids) return base
    const afterUsW = base.indexOf('US W')
    if (afterUsW < 0) return [...base, 'US Kids']
    return [...base.slice(0, afterUsW + 1), 'US Kids', ...base.slice(afterUsW + 1)]
  }

  function onWorkingTableChange(table: SizeChartTable) {
    setWorkingTable(table)
    setDoc((d) => ({
      ...d,
      mode: table.mode,
      sizeChartFootnote:
        table.mode === 'single' ? 'Single sizes' : 'Range sizes',
    }))
  }

  function applyPreset(id: string) {
    const preset = allPresets.find((p) => p.id === id)
    if (!preset || !catalog) return
    const next = documentFromPreset(preset, doc.legal)
    const table = sizeTableFromPreset(preset, catalog.sizeCharts)
    setWorkingTable(table)
    next.mode = table.mode
    next.sizeChartId = table.id
    next.boxTableFlow = { mode: 'auto' }
    next.sizeChartFootnote =
      table.mode === 'single' ? 'Single sizes' : 'Range sizes'
    if (preset.defaultProductImageId) {
      const url = contentUrl(`content/products/${preset.defaultProductImageId}`)
      next.productImagePath = url
      next.productImageName = preset.defaultProductImageId
    } else {
      setProductPreviewUrl(null)
      setProductPreviewUrls([null, null])
    }
    setDoc(next)
    void resolveDualProductPreviews(next.boxProducts).catch(() => undefined)
  }

  async function onProductFile(file: File | null, slotIndex = 0) {
    if (!file) return
    try {
      const canvas = await decodeImageFile(file)
      const url = canvas.toDataURL('image/jpeg', 0.92)
      setDoc((d) => {
        const products = ensureBoxProducts(d)
        while (products.length <= slotIndex) {
          products.push(emptyBoxProductSlot(`PRODUCT ${products.length + 1}`, ''))
        }
        products[slotIndex] = {
          ...products[slotIndex],
          imagePath: url,
          imageName: file.name,
        }
        if (slotIndex === 0) {
          setProductPreviewUrl(url)
          return {
            ...d,
            productImagePath: url,
            productImageName: file.name,
            boxProducts: products,
          }
        }
        return { ...d, boxProducts: products }
      })
      setProductPreviewUrls((prev) => {
        const next: [string | null, string | null] = [prev[0] ?? null, prev[1] ?? null]
        next[slotIndex] = url
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image decode failed')
    }
  }

  function setBoxProductMode(mode: 'single' | 'dual') {
    if (mode === doc.boxProductMode) return
    if (mode === 'dual') {
      const next = ensureBoxProducts(doc)
      next[0] = {
        ...next[0],
        title: structuredClone(doc.title),
        sku: doc.sku,
        imagePath: doc.productImagePath,
        imageName: doc.productImageName,
      }
      if (!next[1]) next.push(emptyBoxProductSlot('PRODUCT 2', ''))
      setDoc({
        ...doc,
        boxProductMode: 'dual',
        boxProducts: next,
        boxTableFlow: { mode: 'auto' },
        boxLayout: { ...doc.boxLayout, template: 'auto' },
      })
      return
    }
    setDoc(
      syncPrimaryProductFields({
        ...doc,
        boxProductMode: 'single',
        // Keep Product 2 in the document so switching modes is reversible.
        boxProducts: ensureBoxProducts(doc),
        boxTableFlow: { mode: 'auto' },
        boxLayout: { ...doc.boxLayout, template: 'auto' },
      }),
    )
  }

  function patchBoxProduct(
    index: number,
    partial: Partial<BoxProductSlot>,
  ) {
    const products = ensureBoxProducts(doc)
    while (products.length <= index) {
      products.push(emptyBoxProductSlot(`PRODUCT ${products.length + 1}`, ''))
    }
    products[index] = { ...products[index], ...partial }
    if (partial.title) {
      products[index].title = structuredClone(partial.title)
    }
    if (index === 0) {
      // Dual: keep shared model/range title on doc.title; only sync sku/image.
      if (doc.boxProductMode === 'dual') {
        setDoc({
          ...doc,
          boxProducts: products,
          sku: products[0].sku,
          productImagePath: products[0].imagePath,
          productImageName: products[0].imageName,
        })
        return
      }
      setDoc(
        syncBoxPrimary(
          { ...doc, boxProducts: products },
          {
            sku: products[0].sku,
            title: products[0].title,
            productImagePath: products[0].imagePath,
            productImageName: products[0].imageName,
          },
        ),
      )
      return
    }
    setDoc({ ...doc, boxProducts: products, boxProductMode: 'dual' })
  }

  function saveAsPreset() {
    const name = window.prompt('Preset name', plainText(doc.title))
    if (!name) return
    const preset = documentToModelPreset(doc, name, workingTable)
    const next = [...userPresets, preset]
    setUserPresets(next)
    saveUserPresets(next)
    setDoc((d) => ({ ...d, presetId: preset.id }))
  }

  function exportModelJson() {
    const preset = documentToModelPreset(
      doc,
      plainText(doc.title) || 'custom-preset',
      workingTable,
      doc.presetId ?? undefined,
    )
    downloadJson(`${preset.id || 'preset'}.json`, preset)
  }

  async function importModelJson(file: File | null) {
    if (!file) return
    try {
      const raw = await readJsonFile(file)
      const warnings: { message: string; file?: string; field?: string }[] = []
      const preset = parseModelJson(raw, file.name, warnings)
      if (!preset) {
        setError(warnings[0]?.message || 'Invalid preset JSON')
        return
      }
      if (!preset.sizeTable && preset.sizeChartId && catalog) {
        const chart = catalog.sizeCharts.find((t) => t.id === preset.sizeChartId)
        if (chart) preset.sizeTable = cloneSizeTable(chart)
      }
      const nextUsers = [...userPresets.filter((p) => p.id !== preset.id), preset]
      setUserPresets(nextUsers)
      saveUserPresets(nextUsers)
      const nextDoc = documentFromPreset(preset, doc.legal)
      const table = sizeTableFromPreset(preset, catalog?.sizeCharts ?? [])
      setWorkingTable(table)
      nextDoc.mode = table.mode
      nextDoc.sizeChartId = table.id
      nextDoc.boxTableFlow = { mode: 'auto' }
      nextDoc.sizeChartFootnote =
        table.mode === 'single' ? 'Single sizes' : 'Range sizes'
      if (preset.defaultProductImageId) {
        const url = contentUrl(
          `content/products/${preset.defaultProductImageId}`,
        )
        nextDoc.productImagePath = url
        nextDoc.productImageName = preset.defaultProductImageId
      }
      setDoc(nextDoc)
      void resolveDualProductPreviews(nextDoc.boxProducts).catch(() => undefined)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  async function exportSelected() {
    if (!scenes) {
      setError('Missing size chart / scenes')
      return
    }
    const tableErrors = validateSizeTable(workingTable)
    if (tableErrors.length) {
      setError(tableErrors.join(' · '))
      return
    }
    if (!doc.sku.trim() || !plainText(doc.title).trim()) {
      setError('SKU and title are required')
      return
    }
    const title = plainText(doc.title)
    const list: {
      key: string
      scene: (typeof scenes)['box']
      filename: string
      pdfMode?: 'k-only' | 'cmyk'
      pdfFontMode?: typeof doc.pdfFontMode
      textColorMode?: typeof doc.boxTextColorMode
    }[] = []
    if (doc.outputs.sizeLabelNormal) {
      list.push({
        key: 'normal',
        scene: scenes.normal,
        filename: `${exportBasename(doc.sku, title, 'size-label-normal')}.pdf`,
        pdfMode: 'k-only',
        pdfFontMode: doc.pdfFontMode,
        textColorMode: 'pure-k',
      })
    }
    if (doc.outputs.sizeLabelDouble) {
      list.push({
        key: 'double',
        scene: scenes.double,
        filename: `${exportBasename(doc.sku, title, 'size-label-double')}.pdf`,
        pdfMode: 'k-only',
        pdfFontMode: doc.pdfFontMode,
        textColorMode: 'pure-k',
      })
    }
    if (doc.outputs.boxLabel) {
      list.push({
        key: 'box',
        scene: scenes.box,
        filename: `${exportBasename(doc.sku, title, 'box-label')}.pdf`,
        // Keep CMYK page; pure-k text fills forced via textColorMode / toPdfColor.
        pdfMode: 'cmyk',
        pdfFontMode: doc.pdfFontMode,
        textColorMode: doc.boxTextColorMode,
      })
    }
    if (doc.outputs.sizeChart) {
      list.push({
        key: 'sizechart',
        scene: scenes.sizechart,
        filename: `${exportBasename(doc.sku, title, 'sizechart')}.webp`,
      })
    }
    if (!list.length) {
      setError('Select at least one output')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const items = await buildExports({ doc, scenes: list, baseUrl: './' })
      await downloadExports(
        items,
        exportBasename(doc.sku, title, 'labels-export'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  if (!catalog) {
    return (
      <div className="app loading">
        <p>Loading catalog...</p>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  const activeScene =
    tab === 'size-normal'
      ? scenes?.normal
      : tab === 'size-double'
        ? scenes?.double
        : tab === 'box'
          ? scenes?.box
          : scenes?.sizechart

  const materialLogoList = catalog.manifest.logos.filter((l) =>
    (MATERIAL_TYPE_LOGO_IDS as readonly string[]).includes(l.id),
  )
  const customLogoAssets = doc.customLogos.map(inlineLogoToAssetRef)
  const allLogos = [...catalog.manifest.logos, ...customLogoAssets]
  const materialLogosWithCustom = [...materialLogoList, ...customLogoAssets]

  function importCustomLogo(logo: InlineLogo) {
    setDoc((prev) => ({
      ...prev,
      customLogos: prev.customLogos.some((c) => c.id === logo.id)
        ? prev.customLogos
        : [...prev.customLogos, logo],
    }))
  }

  const selectedOutputCount = Object.values(doc.outputs).filter(Boolean).length
  const currentPresetName =
    allPresets.find((preset) => preset.id === doc.presetId)?.name ??
    'Custom label'
  const activeOutputLabel =
    tab === 'size-normal'
      ? 'A4 · 45 × 30 mm · K-only PDF'
      : tab === 'size-double'
        ? '206 × 131 mm · 76 × 23 mm · K-only PDF'
        : tab === 'box'
          ? `${doc.boxDimensionsMm.width} × ${doc.boxDimensionsMm.height} mm · CMYK PDF`
          : '1200 × 600 px · WebP'

  return (
    <div className="app">
      <header className="top">
        <div className="app-brand">
          <span className="app-mark" aria-hidden>
            PS
          </span>
          <div>
            <div className="app-title-row">
              <h1>Labels Generator</h1>
              <span className="local-badge">Local</span>
            </div>
            <p className="sub">Production labels · CMYK PDF · WebP</p>
          </div>
        </div>
        <div className="header-export top-actions">
          <label className="pdf-font-mode">
            <span>PDF fonts</span>
            <select
              value={doc.pdfFontMode}
              onChange={(e) =>
                setDoc({
                  ...doc,
                  pdfFontMode:
                    e.target.value === 'editable' ? 'editable' : 'outlined',
                })
              }
            >
              <option value="outlined">Outlined</option>
              <option value="editable">Editable</option>
            </select>
          </label>
          <OutputSelector
            dense
            variant="header"
            value={doc.outputs}
            onChange={(outputs) => setDoc({ ...doc, outputs })}
          />
          <button className="primary" disabled={busy} onClick={exportSelected}>
            {busy
              ? 'Exporting...'
              : `Export ${selectedOutputCount} ${
                  selectedOutputCount === 1 ? 'file' : 'files'
                }`}
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <div className="layout">
        <aside className="panel">
          <nav className="panel-nav" aria-label="Configuration sections">
            <a href="#preset-editor">Preset</a>
            <a href="#content-editor">Product</a>
            <a href="#layout-editor">Layout</a>
            <a href="#sizes-editor">Sizes</a>
            <a href="#assets-editor">Assets</a>
            <a href="#legal-editor">Legal</a>
          </nav>

          <section id="preset-editor" className="form-section">
            <h2>Preset</h2>
            <div className="field">
              <label>Preset</label>
              <select
                value={doc.presetId ?? ''}
                onChange={(e) => applyPreset(e.target.value)}
              >
                <option value="">- Custom -</option>
                {allPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row-actions wrap">
              <button type="button" onClick={saveAsPreset}>
                Save in this browser
              </button>
              <button type="button" onClick={exportModelJson}>
                Export preset JSON
              </button>
              <button type="button" onClick={() => modelFileRef.current?.click()}>
                Import preset JSON
              </button>
              <input
                ref={modelFileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => importModelJson(e.target.files?.[0] ?? null)}
              />
            </div>
          </section>

          <section id="content-editor" className="form-section">
            <h2>Content</h2>

            <div className="field">
              <label>Products</label>
              <div className="chip-row composition-chips">
                <button
                  type="button"
                  className={doc.boxProductMode === 'single' ? 'active' : undefined}
                  onClick={() => setBoxProductMode('single')}
                >
                  Single
                </button>
                <button
                  type="button"
                  className={doc.boxProductMode === 'dual' ? 'active' : undefined}
                  onClick={() => setBoxProductMode('dual')}
                >
                  Dual
                </button>
              </div>
            </div>

            <div className="field brand-color-field">
              <label>Brand color</label>
              <div className="brand-color-control">
                <label className="brand-swatch-btn" title={doc.brandColorHex}>
                  <span
                    className="brand-swatch"
                    style={{ background: doc.brandColorHex }}
                    aria-hidden
                  />
                  <input
                    type="color"
                    value={normalizeHex(doc.brandColorHex)}
                    onChange={(e) => setDoc(applyBrandHex(doc, e.target.value))}
                    aria-label="Brand color picker"
                  />
                </label>
                <input
                  className="hex-input"
                  value={doc.brandColorHex}
                  onChange={(e) => {
                    const raw = e.target.value
                    setDoc({
                      ...doc,
                      brandColorHex: raw.startsWith('#')
                        ? raw.toUpperCase()
                        : `#${raw}`.toUpperCase(),
                    })
                  }}
                  onBlur={(e) => setDoc(applyBrandHex(doc, e.target.value))}
                  placeholder="#416BE0"
                  spellCheck={false}
                  aria-label="Brand color hex"
                />
              </div>
              <div className="cmyk-channel-grid" aria-label="Brand CMYK recipe">
                {(['c', 'm', 'y', 'k'] as const).map((channel) => (
                  <label key={channel}>
                    <span>{channel.toUpperCase()}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(doc.brandColorCmyk[channel] * 100)}
                      onChange={(e) =>
                        setDoc(
                          applyBrandCmyk(
                            doc,
                            channel,
                            Number(e.target.value || 0),
                          ),
                        )
                      }
                      aria-label={`Brand CMYK ${channel.toUpperCase()}`}
                    />
                    <span>%</span>
                  </label>
                ))}
              </div>
              <p className="hint">
                HEX controls the screen colour; CMYK is the print recipe used by the PDF
                and its simulation.
              </p>
              <label className="check-inline brand-text-check">
                <input
                  type="checkbox"
                  checked={doc.boxTextColorMode === 'brand'}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      boxTextColorMode: e.target.checked ? 'brand' : 'pure-k',
                    })
                  }
                />
                Color texts with brand color
              </label>
            </div>

            {doc.boxProductMode === 'dual' ? (
              <>
                <RichTextEditor
                  label="Shared model title"
                  value={doc.title}
                  onChange={(title) => setDoc({ ...doc, title })}
                />
                <p className="hint">
                  Shown below the brand wordmark; each product keeps its own title
                  below.
                </p>
                <div className="dual-content-grid">
                  {[0, 1].map((index) => {
                    const slot =
                      doc.boxProducts[index] ??
                      emptyBoxProductSlot(`PRODUCT ${index + 1}`, '')
                    return (
                      <div key={index} className="product-slot-fields">
                      <h3>Product {index + 1}</h3>
                      <div className="field">
                        <label>Article / SKU {index + 1}</label>
                        <input
                          value={slot.sku}
                          onChange={(e) =>
                            patchBoxProduct(index, { sku: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Title {index + 1}</label>
                        <RichTextEditor
                          value={slot.title}
                          onChange={(title) => patchBoxProduct(index, { title })}
                        />
                      </div>
                      <div className="field">
                        <label>Subtitle {index + 1} (optional)</label>
                        <input
                          value={slot.subtitle ?? ''}
                          onChange={(e) =>
                            patchBoxProduct(index, {
                              subtitle: e.target.value,
                            })
                          }
                          placeholder="e.g. BOOT ONLY, adj."
                        />
                      </div>
                      <div className="field">
                        <label>Product image {index + 1}</label>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.tif,.tiff,image/*"
                          onChange={(e) =>
                            void onProductFile(e.target.files?.[0] ?? null, index)
                          }
                        />
                        {slot.imageName && (
                          <p className="hint">Current: {slot.imageName}</p>
                        )}
                      </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label>SKU / Article no.</label>
                  <input
                    value={doc.sku}
                    onChange={(e) =>
                      setDoc(syncBoxPrimary(doc, { sku: e.target.value }))
                    }
                  />
                </div>
                <RichTextEditor
                  value={doc.title}
                  onChange={(title) => setDoc(syncBoxPrimary(doc, { title }))}
                />
                <div className="field">
                  <label>Product image (JPG / PNG / TIF)</label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.tif,.tiff,image/*"
                    onChange={(e) =>
                      void onProductFile(e.target.files?.[0] ?? null, 0)
                    }
                  />
                  {doc.productImageName && (
                    <p className="hint">Current: {doc.productImageName}</p>
                  )}
                </div>
              </>
            )}

          </section>

          <div id="layout-editor" className="section-anchor">
            <BoxCompositionControls
              doc={doc}
              onChange={setDoc}
              tableWarning={scenes?.box?.tableWarning}
              overflow={scenes?.box?.overflow}
              layoutStrategy={scenes?.box?.layoutStrategy}
            />
          </div>

          <section id="sizes-editor" className="form-section">
            <h2>Sizes</h2>
            <SizeTableEditor
              value={workingTable}
              catalogTable={catalogTable}
              kids={doc.enabledSizeSystems.includes('US Kids')}
              onKidsChange={(kids) =>
                setDoc({
                  ...doc,
                  enabledSizeSystems: kidsEnabledSystems(kids),
                })
              }
              onChange={onWorkingTableChange}
            />
          </section>

          <section id="assets-editor" className="form-section">
            <h2>Logos & materials</h2>
            <div className="logo-stack">
              <LogoPicker
                label="Brand wordmark (horizontal, in color)"
                logos={allLogos}
                selected={doc.brandWordmarkLogoId ? [doc.brandWordmarkLogoId] : []}
                multiple={false}
                scale={doc.logoScales.brandWordmark}
                onScaleChange={(brandWordmark) =>
                  setDoc((prev) => ({
                    ...prev,
                    logoScales: { ...prev.logoScales, brandWordmark },
                    boxLayout: {
                      ...prev.boxLayout,
                      wordmarkScale: brandWordmark,
                    },
                  }))
                }
                onImportCustom={importCustomLogo}
                onChange={(ids) =>
                  setDoc({ ...doc, brandWordmarkLogoId: ids[0] ?? null })
                }
              />
              <LogoPicker
                label="Page badge (circular PS)"
                logos={allLogos}
                selected={doc.badgeLogoId ? [doc.badgeLogoId] : []}
                multiple={false}
                scale={doc.logoScales.pageBadge}
                onScaleChange={(pageBadge) =>
                  setDoc((prev) => ({
                    ...prev,
                    logoScales: { ...prev.logoScales, pageBadge },
                  }))
                }
                onImportCustom={importCustomLogo}
                onChange={(ids) =>
                  setDoc({ ...doc, badgeLogoId: ids[0] ?? null })
                }
              />
              <LogoPicker
                label="Box logos (under title)"
                logos={allLogos}
                selected={doc.boxLogos}
                scale={doc.logoScales.boxLogos}
                onScaleChange={(boxLogos) =>
                  setDoc((prev) => ({
                    ...prev,
                    logoScales: { ...prev.logoScales, boxLogos },
                  }))
                }
                onImportCustom={importCustomLogo}
                onChange={(boxLogos) =>
                  setDoc((prev) => ({
                    ...prev,
                    boxLogos,
                    boxLogoRefs: boxLogos.map((id) => {
                      const custom = prev.customLogos.find((c) => c.id === id)
                      return custom ?? { kind: 'catalog' as const, id }
                    }),
                  }))
                }
              />
              <LogoPicker
                label="Size chart logos"
                logos={allLogos}
                selected={doc.sizeChartLogos}
                scale={doc.logoScales.sizeChartLogos}
                onScaleChange={(sizeChartLogos) =>
                  setDoc((prev) => ({
                    ...prev,
                    logoScales: { ...prev.logoScales, sizeChartLogos },
                  }))
                }
                onImportCustom={importCustomLogo}
                onChange={(sizeChartLogos) => setDoc({ ...doc, sizeChartLogos })}
              />
            </div>
            <div className="materials-grid">
              <LogoPicker
                label="Upper"
                dense
                logos={materialLogosWithCustom}
                selected={doc.materials.upper ? [doc.materials.upper] : []}
                multiple={false}
                onImportCustom={importCustomLogo}
                onChange={(ids) =>
                  setDoc({
                    ...doc,
                    materials: normalizeMaterials({
                      ...doc.materials,
                      upper: ids[0],
                    }),
                  })
                }
              />
              <LogoPicker
                label="Liner"
                dense
                logos={materialLogosWithCustom}
                selected={doc.materials.lining ? [doc.materials.lining] : []}
                multiple={false}
                onImportCustom={importCustomLogo}
                onChange={(ids) =>
                  setDoc({
                    ...doc,
                    materials: normalizeMaterials({
                      ...doc.materials,
                      lining: ids[0],
                    }),
                  })
                }
              />
              <LogoPicker
                label="Sole"
                dense
                logos={materialLogosWithCustom}
                selected={doc.materials.sole ? [doc.materials.sole] : []}
                multiple={false}
                onImportCustom={importCustomLogo}
                onChange={(ids) =>
                  setDoc({
                    ...doc,
                    materials: normalizeMaterials({
                      ...doc.materials,
                      sole: ids[0],
                    }),
                  })
                }
              />
            </div>
          </section>

          <section id="legal-editor" className="form-section legal-section">
            <h2>Legal</h2>
            <div className="field">
              <label>Show on box</label>
              <div className="checks">
                {(
                  [
                    ['showCompany', 'Company'],
                    ['showPostalAddress', 'Address'],
                    ['showPhoneFax', 'Phone / Fax'],
                    ['showWebEmail', 'Web / Email'],
                    ['showStandard', 'Standard'],
                    ['showClass', 'Class'],
                    ['showWeight', 'Weight'],
                    ['showMadeIn', 'Made in'],
                  ] as const satisfies ReadonlyArray<
                    readonly [keyof LegalDisplayOptions, string]
                  >
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={doc.legalDisplay[key]}
                      onChange={(e) =>
                        setDoc({
                          ...doc,
                          legalDisplay: {
                            ...doc.legalDisplay,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <details>
              <summary>Advanced legal fields</summary>
              <div className="field">
                <label>Class / weight</label>
                <input
                  value={`${doc.legal.classText} | ${doc.legal.weightRange}`}
                  onChange={(e) => {
                    const [cls, weight] = e.target.value.split('|')
                    setDoc({
                      ...doc,
                      legal: {
                        ...doc.legal,
                        classText: (cls ?? '').trim() || doc.legal.classText,
                        weightRange:
                          (weight ?? '').trim() || doc.legal.weightRange,
                      },
                    })
                  }}
                />
              </div>
              <div className="field">
                <label>Made in</label>
                <input
                  value={doc.legal.madeIn}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      legal: { ...doc.legal, madeIn: e.target.value },
                    })
                  }
                />
              </div>
            </details>
          </section>
        </aside>

        <main className="preview">
          <div className="preview-heading">
            <div>
              <span className="eyebrow">Live preview</span>
              <strong>{currentPresetName}</strong>
            </div>
            <span className="preview-format">{activeOutputLabel}</span>
          </div>
          <div className="tabs">
            {(
              [
                ['size-normal', 'Size normal'],
                ['size-double', 'Size double'],
                ['box', 'Box'],
                ['sizechart', 'Size chart'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? 'active' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
            {tab === 'size-double' && (
              <label className="guide-toggle">
                <input
                  type="checkbox"
                  checked={showPrintGuides}
                  onChange={(e) => setShowPrintGuides(e.target.checked)}
                />
                Red guides
              </label>
            )}
            {tab === 'box' && (
              <label
                className="guide-toggle cmyk-toggle"
                title="Aproximación matemática de los canales configurados. No es una prueba de color ICC ni predice con precisión la impresión."
              >
                <input
                  type="checkbox"
                  checked={simulateCmyk}
                  onChange={(e) => setSimulateCmyk(e.target.checked)}
                />
                CMYK aprox.
              </label>
            )}
          </div>
          {tab === 'box' &&
            (scenes?.box?.tableWarning ||
              (scenes?.box?.overflow && scenes.box.overflow.length > 0)) && (
              <ul className="warn-list preview-warns">
                {scenes.box.tableWarning && (
                  <li>{scenes.box.tableWarning}</li>
                )}
                {scenes.box.overflow?.map((o) => (
                  <li key={`${o.block}-${o.message}`}>
                    {o.block}: {o.message}
                  </li>
                ))}
              </ul>
            )}
          <div className="preview-stage">
            {activeScene ? (
              <SceneSvg
                scene={activeScene}
                className="scene"
                colorTransform={
                  simulateCmyk && tab === 'box'
                    ? (color) =>
                        color.replace('#', '').toLowerCase() ===
                        doc.brandColorHex.replace('#', '').toLowerCase()
                          ? cmykToHex(doc.brandColorCmyk)
                          : color
                    : undefined
                }
              />
            ) : (
              <p className="muted">Select a size chart to preview.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
