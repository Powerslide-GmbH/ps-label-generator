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
import type { LabelDocument, ModelPreset, SizeChartTable } from '@/domain/types'
import {
  DEFAULT_MATERIALS,
  LOCATION_LOGO_IDS,
  MATERIAL_TYPE_LOGO_IDS,
  normalizeMaterials,
} from '@/domain/types'
import { parseModelJson } from '@/content/loadCatalog'
import { LogoPicker } from '@/components/LogoPicker'
import { RichTextEditor } from '@/components/RichTextEditor'
import { OutputSelector } from '@/components/OutputSelector'
import { SizeTableEditor } from '@/components/SizeTableEditor'
import { SceneSvg } from '@/templates/SceneSvg'
import {
  buildBoxLabelScene,
  buildSizeChartScene,
  buildSizeLabelScene,
} from '@/templates/scenes'
import { buildExports } from '@/export/pdfExport'
import { downloadExports } from '@/export/download'
import { decodeImageFile, canvasToSquare } from '@/export/imageDecode'
import './App.css'

type Tab = 'size-normal' | 'size-double' | 'box' | 'sizechart'

async function resolveProductPreview(pathOrUrl: string): Promise<string> {
  const lower = pathOrUrl.toLowerCase()
  if (lower.startsWith('data:')) return pathOrUrl
  if (!lower.match(/\.tiff?($|\?)/)) return pathOrUrl
  const res = await fetch(pathOrUrl)
  const blob = await res.blob()
  const canvas = canvasToSquare(await decodeImageFile(blob))
  return canvas.toDataURL('image/jpeg', 0.9)
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productPreviewUrl, setProductPreviewUrl] = useState<string | null>(null)
  const [sizeWordmarkUrl, setSizeWordmarkUrl] = useState<string | null>(null)
  const modelFileRef = useRef<HTMLInputElement>(null)
  const tintUrlRef = useRef<string | null>(null)

  useEffect(() => {
    loadCatalog('./')
      .then((c) => {
        setCatalog(c)
        const localUsers = loadUserPresets()
        setUserPresets(localUsers)
        const savedTable = loadWorkingTable()
        const first = c.presets[0]
        if (first) {
          const next = documentFromPreset(first, DEFAULT_LEGAL)
          const table = sizeTableFromPreset(first, c.sizeCharts)
          setWorkingTable(
            savedTable?.id === table.id ? savedTable : table,
          )
          if (first.defaultProductImageId) {
            const url = contentUrl(
              `content/products/${first.defaultProductImageId}`,
            )
            next.productImagePath = url
            next.productImageName = first.defaultProductImageId
            void resolveProductPreview(url)
              .then((preview) => {
                setProductPreviewUrl(preview)
                setDoc((d) => ({ ...d, productImagePath: preview }))
              })
              .catch(() => undefined)
          }
          setDoc(next)
          setTab(
            first.outputs.sizeLabelNormal
              ? 'size-normal'
              : first.outputs.sizeLabelDouble
                ? 'size-double'
                : 'box',
          )
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
    if (!id || !catalog) return ''
    const asset = catalog.logoById.get(id)
    return asset ? contentUrl(asset.path) : ''
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
    const boxLogos = doc.boxLogos.map(logoHref).filter(Boolean)
    const chartLogos = doc.sizeChartLogos.map(logoHref).filter(Boolean)
    const product = productPreviewUrl || doc.productImagePath
    const colorWordmark = logoHref(doc.brandWordmarkLogoId) || undefined
    const assets = {
      // Color wordmark as selected (box + size-sheet footer)
      wordmarkHref: colorWordmark,
      boxWordmarkHref: colorWordmark,
      // Black wordmark for individual size-label pieces
      sizeWordmarkHref: sizeWordmarkUrl || colorWordmark,
      pageLogoHref:
        logoHref(doc.badgeLogoId) ||
        logoHref('PS_small_CMYK') ||
        logoHref('PS_big_CMYK') ||
        undefined,
      materialPairs,
      classLogoHref: logoHref('label_class') || undefined,
      showPrintGuides,
    }
    return {
      normal: buildSizeLabelScene(doc, table, false, assets),
      double: buildSizeLabelScene(doc, table, true, assets),
      box: buildBoxLabelScene(doc, table, boxLogos, product, assets),
      sizechart: buildSizeChartScene(doc, table, chartLogos),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, workingTable, productPreviewUrl, catalog, sizeWordmarkUrl, materialPairs, showPrintGuides])

  function applyPreset(id: string) {
    const preset = allPresets.find((p) => p.id === id)
    if (!preset || !catalog) return
    const next = documentFromPreset(preset, doc.legal)
    const table = sizeTableFromPreset(preset, catalog.sizeCharts)
    setWorkingTable(table)
    next.mode = table.mode
    next.sizeChartId = table.id
    next.sizeChartFootnote =
      table.mode === 'single' ? 'Single sizes' : 'Range sizes'
    if (preset.defaultProductImageId) {
      const url = contentUrl(`content/products/${preset.defaultProductImageId}`)
      next.productImagePath = url
      next.productImageName = preset.defaultProductImageId
      void resolveProductPreview(url).then((preview) => {
        setProductPreviewUrl(preview)
        setDoc((d) => ({ ...d, productImagePath: preview }))
      })
    } else {
      setProductPreviewUrl(null)
    }
    setDoc(next)
  }

  async function onProductFile(file: File | null) {
    if (!file) return
    try {
      const canvas = canvasToSquare(await decodeImageFile(file))
      const url = canvas.toDataURL('image/jpeg', 0.92)
      setProductPreviewUrl(url)
      setDoc((d) => ({
        ...d,
        productImagePath: url,
        productImageName: file.name,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image decode failed')
    }
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
      nextDoc.sizeChartFootnote =
        table.mode === 'single' ? 'Single sizes' : 'Range sizes'
      if (preset.defaultProductImageId) {
        const url = contentUrl(
          `content/products/${preset.defaultProductImageId}`,
        )
        nextDoc.productImagePath = url
        nextDoc.productImageName = preset.defaultProductImageId
        void resolveProductPreview(url).then((preview) => {
          setProductPreviewUrl(preview)
          setDoc((d) => ({ ...d, productImagePath: preview }))
        })
      }
      setDoc(nextDoc)
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
    }[] = []
    if (doc.outputs.sizeLabelNormal) {
      list.push({
        key: 'normal',
        scene: scenes.normal,
        filename: `${exportBasename(doc.sku, title, 'size-label-normal')}.pdf`,
        pdfMode: 'k-only',
      })
    }
    if (doc.outputs.sizeLabelDouble) {
      list.push({
        key: 'double',
        scene: scenes.double,
        filename: `${exportBasename(doc.sku, title, 'size-label-double')}.pdf`,
        pdfMode: 'k-only',
      })
    }
    if (doc.outputs.boxLabel) {
      list.push({
        key: 'box',
        scene: scenes.box,
        filename: `${exportBasename(doc.sku, title, 'box-label')}.pdf`,
        pdfMode: 'cmyk',
      })
    }
    if (doc.outputs.sizeChart) {
      list.push({
        key: 'sizechart',
        scene: scenes.sizechart,
        filename: `${exportBasename(doc.sku, title, 'sizechart')}.jpg`,
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

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>PS Labels Generator</h1>
          <p className="sub">
            Local tool · JSON catalog · CMYK PDF · size chart JPG
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={exportSelected}>
          {busy ? 'Exporting...' : 'Export selected'}
        </button>
      </header>

      {error && <div className="banner error">{error}</div>}

      <div className="layout">
        <aside className="panel">
          <section>
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
            <p className="hint">
              A preset includes branding, outputs and the size table. Browser save =
              localStorage only. To publish: Export JSON →{' '}
              <code>public/content/models/</code> →{' '}
              <code>npm run content:manifest</code>.
            </p>
          </section>

          <section>
            <h2>Content</h2>
            <div className="field">
              <label>SKU / Article no.</label>
              <input
                value={doc.sku}
                onChange={(e) => setDoc({ ...doc, sku: e.target.value })}
              />
            </div>
            <RichTextEditor
              value={doc.title}
              onChange={(title) => setDoc({ ...doc, title })}
            />
            <div className="field">
              <label>Title size per output</label>
              <div className="title-sizes">
                <label>
                  Size normal (mm)
                  <input
                    type="number"
                    min={1.2}
                    max={12}
                    step={0.1}
                    value={doc.titleSizes.sizeLabel}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        titleSizes: {
                          ...doc.titleSizes,
                          sizeLabel: Number(e.target.value) || doc.titleSizes.sizeLabel,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Size double (mm)
                  <input
                    type="number"
                    min={1.2}
                    max={12}
                    step={0.1}
                    value={doc.titleSizes.sizeLabelDouble}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        titleSizes: {
                          ...doc.titleSizes,
                          sizeLabelDouble:
                            Number(e.target.value) || doc.titleSizes.sizeLabelDouble,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Box (mm)
                  <input
                    type="number"
                    min={3}
                    max={16}
                    step={0.1}
                    value={doc.titleSizes.box}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        titleSizes: {
                          ...doc.titleSizes,
                          box: Number(e.target.value) || doc.titleSizes.box,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Size chart (px)
                  <input
                    type="number"
                    min={16}
                    max={72}
                    step={1}
                    value={doc.titleSizes.sizeChart}
                    onChange={(e) =>
                      setDoc({
                        ...doc,
                        titleSizes: {
                          ...doc.titleSizes,
                          sizeChart: Number(e.target.value) || doc.titleSizes.sizeChart,
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="field">
              <label>Product image (JPG / PNG / TIF)</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.tif,.tiff,image/*"
                onChange={(e) => onProductFile(e.target.files?.[0] ?? null)}
              />
              {doc.productImageName && (
                <p className="hint">
                  Current: {doc.productImageName} (designers normally import their own)
                </p>
              )}
            </div>
            <div className="field">
              <label>Brand color</label>
              <div className="brand-color-row">
                <span
                  className="brand-swatch"
                  style={{ background: doc.brandColorHex }}
                  title={doc.brandColorHex}
                />
                <input
                  type="color"
                  value={normalizeHex(doc.brandColorHex)}
                  onChange={(e) =>
                    setDoc({ ...doc, brandColorHex: normalizeHex(e.target.value) })
                  }
                  aria-label="Brand color picker"
                />
                <input
                  className="hex-input"
                  value={doc.brandColorHex}
                  onChange={(e) => {
                    const raw = e.target.value
                    setDoc({
                      ...doc,
                      brandColorHex: raw.startsWith('#') ? raw.toUpperCase() : `#${raw}`.toUpperCase(),
                    })
                  }}
                  onBlur={(e) =>
                    setDoc({
                      ...doc,
                      brandColorHex: normalizeHex(e.target.value, doc.brandColorHex),
                    })
                  }
                  placeholder="#416BE0"
                  spellCheck={false}
                />
              </div>
            </div>
          </section>

          <section>
            <h2>Sizes</h2>
            <SizeTableEditor
              value={workingTable}
              catalogTable={catalogTable}
              onChange={setWorkingTable}
              onModeChange={(mode) =>
                setDoc({
                  ...doc,
                  mode,
                  sizeChartFootnote:
                    mode === 'single' ? 'Single sizes' : 'Range sizes',
                })
              }
            />
          </section>

          <section>
            <h2>Logos & materials</h2>
            <div className="logo-stack">
              <LogoPicker
                label="Brand wordmark (horizontal, in color)"
                logos={catalog.manifest.logos}
                selected={doc.brandWordmarkLogoId ? [doc.brandWordmarkLogoId] : []}
                multiple={false}
                hint="Select the colored logo. Box uses it as-is; size-label pieces force it to black."
                onChange={(ids) =>
                  setDoc({ ...doc, brandWordmarkLogoId: ids[0] ?? null })
                }
              />
              <LogoPicker
                label="Page badge (circular PS)"
                logos={catalog.manifest.logos}
                selected={doc.badgeLogoId ? [doc.badgeLogoId] : []}
                multiple={false}
                hint="Small circular logo on size-label sheet header."
                onChange={(ids) =>
                  setDoc({ ...doc, badgeLogoId: ids[0] ?? null })
                }
              />
              <LogoPicker
                label="Box logos (under title)"
                logos={catalog.manifest.logos}
                selected={doc.boxLogos}
                hint="Circular badges under SKU on the box (e.g. PS + FIT)."
                onChange={(boxLogos) => setDoc({ ...doc, boxLogos })}
              />
              <LogoPicker
                label="Size chart logos"
                logos={catalog.manifest.logos}
                selected={doc.sizeChartLogos}
                onChange={(sizeChartLogos) => setDoc({ ...doc, sizeChartLogos })}
              />
            </div>
            <p className="hint materials-hint">
              Materials — location icons are fixed; pick the material type for each
            </p>
            <div className="materials-grid">
              <LogoPicker
                label="Upper"
                dense
                logos={materialLogoList}
                selected={doc.materials.upper ? [doc.materials.upper] : []}
                multiple={false}
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
                logos={materialLogoList}
                selected={doc.materials.lining ? [doc.materials.lining] : []}
                multiple={false}
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
                logos={materialLogoList}
                selected={doc.materials.sole ? [doc.materials.sole] : []}
                multiple={false}
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

          <section>
            <h2>Outputs</h2>
            <OutputSelector
              value={doc.outputs}
              onChange={(outputs) => setDoc({ ...doc, outputs })}
            />
            <details>
              <summary>Legal text (advanced)</summary>
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
          </div>
          <div className="preview-stage">
            {activeScene ? (
              <SceneSvg scene={activeScene} className="scene" />
            ) : (
              <p className="muted">Select a size chart to preview.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
