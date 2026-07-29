import { useState } from 'react'
import { clampBoxDimensions } from '@/domain/boxConfig'
import {
  COMMON_BOX_SIZES_MM,
  DEFAULT_BOX_LAYOUT,
  DEFAULT_SIZE_LABEL_SHEET,
  DEFAULT_TITLE_SIZES,
  type BoxLayoutSettings,
  type BoxLayoutTemplate,
  type LabelDocument,
} from '@/domain/types'

type Props = {
  doc: LabelDocument
  onChange: (next: LabelDocument) => void
  tableWarning?: string
  overflow?: { block: string; message: string }[]
  layoutStrategy?: string
}

const TEMPLATE_LABELS: Record<BoxLayoutTemplate, string> = {
  auto: 'Automatic',
  'single-standard': 'Single product · classic',
  'single-split-table': 'Single product · split table',
  'dual-wide-table': 'Two products · wide table',
  'dual-compact-junior': 'Two products · compact kids',
  'dual-side-by-side-junior': 'Two products · side header',
}

function sizeChoice(doc: LabelDocument): string {
  const { width, height } = doc.boxDimensionsMm
  const match = COMMON_BOX_SIZES_MM.find(
    (s) => s.width === width && s.height === height,
  )
  return match ? `${match.width}x${match.height}` : 'custom'
}

function templatesFor(doc: LabelDocument): BoxLayoutTemplate[] {
  return doc.boxProductMode === 'dual'
    ? [
        'auto',
        'dual-wide-table',
        'dual-compact-junior',
        'dual-side-by-side-junior',
      ]
    : ['auto', 'single-standard', 'single-split-table']
}

export function BoxCompositionControls({
  doc,
  onChange,
  tableWarning,
  overflow,
  layoutStrategy,
}: Props) {
  const matchedSize = sizeChoice(doc)
  const [forceCustom, setForceCustom] = useState(false)
  const size = forceCustom || matchedSize === 'custom' ? 'custom' : matchedSize
  const warnings = [
    ...(tableWarning ? [tableWarning] : []),
    ...(overflow?.map((o) => `${o.block}: ${o.message}`) ?? []),
  ]

  function patchLayout(partial: Partial<BoxLayoutSettings>) {
    onChange({
      ...doc,
      boxLayout: { ...doc.boxLayout, ...partial },
    })
  }

  function patchDimensions(width: number, height: number) {
    onChange({
      ...doc,
      boxDimensionsMm: clampBoxDimensions({ width, height }),
      boxTableFlow: { mode: 'auto' },
    })
  }

  function setLabelSize(choice: string) {
    if (choice === 'custom') {
      setForceCustom(true)
      return
    }
    setForceCustom(false)
    const [width, height] = choice.split('x').map(Number)
    if (width && height) patchDimensions(width, height)
  }

  return (
    <section className="box-composition">
      <div className="section-title-row">
        <h2>Box composition</h2>
        {layoutStrategy && (
          <span className="layout-status" title="Resolved layout">
            {TEMPLATE_LABELS[layoutStrategy as BoxLayoutTemplate] ??
              layoutStrategy}
          </span>
        )}
      </div>

      <div className="composition-grid">
        <div className="field">
          <label>Label size</label>
          <select
            className="box-size-select"
            value={size}
            onChange={(e) => setLabelSize(e.target.value)}
          >
            {COMMON_BOX_SIZES_MM.map((s) => (
              <option
                key={`${s.width}x${s.height}`}
                value={`${s.width}x${s.height}`}
              >
                {s.width} × {s.height} mm
              </option>
            ))}
            <option value="custom">Custom size</option>
          </select>
        </div>

        <div className="field">
          <label>Layout</label>
          <select
            value={doc.boxLayout.template}
            onChange={(e) =>
              patchLayout({ template: e.target.value as BoxLayoutTemplate })
            }
          >
            {templatesFor(doc).map((template) => (
              <option key={template} value={template}>
                {TEMPLATE_LABELS[template]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {size === 'custom' && (
        <div className="title-sizes">
          <label>
            Width (mm)
            <input
              type="number"
              min={90}
              step={0.1}
              value={doc.boxDimensionsMm.width}
              onChange={(e) =>
                patchDimensions(
                  Number(e.target.value) || doc.boxDimensionsMm.width,
                  doc.boxDimensionsMm.height,
                )
              }
            />
          </label>
          <label>
            Height (mm)
            <input
              type="number"
              min={70}
              step={0.1}
              value={doc.boxDimensionsMm.height}
              onChange={(e) =>
                patchDimensions(
                  doc.boxDimensionsMm.width,
                  Number(e.target.value) || doc.boxDimensionsMm.height,
                )
              }
            />
          </label>
        </div>
      )}

      <details className="layout-details">
        <summary>Fine-tune layout</summary>
        <p className="hint">
          Stored in the preset. Each group states which output it changes.
        </p>
        <div className="layout-control-groups">
          <section className="layout-control-group">
            <div className="layout-control-group-heading">
              <h3>Box content</h3>
              <span>Box preview + box PDF</span>
            </div>
            <p className="hint">
              Product typography, image size and text-column proportions.
            </p>
            <div className="layout-controls-grid">
              <NumberControl
                label="Product title size (mm)"
                value={doc.titleSizes.box}
                min={2}
                max={6}
                step={0.1}
                onChange={(box) =>
                  onChange({
                    ...doc,
                    titleSizes: { ...doc.titleSizes, box },
                  })
                }
              />
              {doc.boxProductMode === 'dual' && (
                <NumberControl
                  label="Product subtitle size (mm)"
                  value={doc.boxLayout.subtitleSizeMm}
                  min={1.5}
                  max={5}
                  step={0.1}
                  onChange={(subtitleSizeMm) =>
                    patchLayout({ subtitleSizeMm })
                  }
                />
              )}
              <NumberControl
                label="Product image scale"
                value={doc.boxLayout.productImageScale}
                min={0.5}
                max={1.5}
                step={0.05}
                onChange={(productImageScale) =>
                  patchLayout({ productImageScale })
                }
              />
              {doc.boxProductMode === 'single' && (
                <NumberControl
                  label="Text column width (%)"
                  value={doc.boxLayout.titleColumnPercent}
                  min={30}
                  max={75}
                  step={1}
                  onChange={(titleColumnPercent) =>
                    patchLayout({ titleColumnPercent })
                  }
                />
              )}
            </div>
          </section>

          <section className="layout-control-group">
            <div className="layout-control-group-heading">
              <h3>Branding & sublogos</h3>
              <span>Box only</span>
            </div>
            <p className="hint">
              Placement of the main wordmark and secondary logos.
            </p>
            <div className="layout-controls-grid">
              <label>
                Sublogo position
                <select
                  value={doc.boxLayout.logoPlacement}
                  onChange={(e) =>
                    patchLayout({
                      logoPlacement: e.target
                        .value as BoxLayoutSettings['logoPlacement'],
                    })
                  }
                >
                  <option value="auto">Automatic · bottom for dual</option>
                  <option value="table">Beside table</option>
                  <option value="brand">Under product title</option>
                  <option value="footer">Footer</option>
                </select>
              </label>
              <label>
                Wordmark alignment
                <select
                  value={doc.boxLayout.wordmarkAlign}
                  onChange={(e) =>
                    patchLayout({
                      wordmarkAlign: e.target
                        .value as BoxLayoutSettings['wordmarkAlign'],
                    })
                  }
                >
                  <option value="auto">Automatic</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
          </section>

          <section className="layout-control-group">
            <div className="layout-control-group-heading">
              <h3>Spacing & margins</h3>
              <span>Box only</span>
            </div>
            <p className="hint">
              Extra space after the size table and optional safe-area overrides.
            </p>
            <div className="layout-controls-grid">
              <NumberControl
                label="Space after table (mm)"
                value={doc.boxLayout.brandGapMm}
                min={-4}
                max={12}
                step={0.5}
                onChange={(brandGapMm) => patchLayout({ brandGapMm })}
              />
              <OptionalNumberControl
                label="Content side margin (mm)"
                value={doc.boxLayout.marginX}
                onChange={(marginX) => patchLayout({ marginX })}
              />
              <OptionalNumberControl
                label="Content top margin (mm)"
                value={doc.boxLayout.marginTop}
                onChange={(marginTop) => patchLayout({ marginTop })}
              />
              <OptionalNumberControl
                label="Content bottom margin (mm)"
                value={doc.boxLayout.marginBottom}
                onChange={(marginBottom) => patchLayout({ marginBottom })}
              />
            </div>
          </section>

          <section className="layout-control-group advanced-output-settings">
            <div className="layout-control-group-heading">
              <h3>Other outputs</h3>
              <span>Not the box</span>
            </div>
            <p className="hint">
              Titles and sheet grids for size-normal, size-double and size-chart.
            </p>
            <div className="layout-controls-grid">
            <NumberControl
              label="Size-normal title (mm)"
              value={doc.titleSizes.sizeLabel}
              min={1.2}
              max={12}
              step={0.1}
              onChange={(sizeLabel) =>
                onChange({
                  ...doc,
                  titleSizes: { ...doc.titleSizes, sizeLabel },
                })
              }
            />
            <NumberControl
              label="Size-double title (mm)"
              value={doc.titleSizes.sizeLabelDouble}
              min={1.2}
              max={12}
              step={0.1}
              onChange={(sizeLabelDouble) =>
                onChange({
                  ...doc,
                  titleSizes: { ...doc.titleSizes, sizeLabelDouble },
                })
              }
            />
            <NumberControl
              label="Size-chart title (px)"
              value={doc.titleSizes.sizeChart}
              min={16}
              max={72}
              step={1}
              onChange={(sizeChart) =>
                onChange({
                  ...doc,
                  titleSizes: { ...doc.titleSizes, sizeChart },
                })
              }
            />
            <NumberControl
              label="Size-normal sheet columns"
              value={doc.sizeLabelSheet.normalColumns}
              min={1}
              max={6}
              step={1}
              onChange={(normalColumns) =>
                onChange({
                  ...doc,
                  sizeLabelSheet: {
                    ...doc.sizeLabelSheet,
                    normalColumns: Math.round(normalColumns),
                  },
                })
              }
            />
            <NumberControl
              label="Size-double sheet columns"
              value={doc.sizeLabelSheet.doubleColumns}
              min={1}
              max={4}
              step={1}
              onChange={(doubleColumns) =>
                onChange({
                  ...doc,
                  sizeLabelSheet: {
                    ...doc.sizeLabelSheet,
                    doubleColumns: Math.round(doubleColumns),
                  },
                })
              }
            />
            </div>
          </section>
        </div>
        <button
          type="button"
          className="subtle reset-layout"
          onClick={() =>
            onChange({
              ...doc,
              boxLayout: { ...DEFAULT_BOX_LAYOUT },
              titleSizes: { ...DEFAULT_TITLE_SIZES },
              sizeLabelSheet: { ...DEFAULT_SIZE_LABEL_SHEET },
            })
          }
        >
          Reset all fine-tuning
        </button>
      </details>

      {warnings.length > 0 && (
        <ul className="warn-list">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = e.currentTarget.valueAsNumber
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}

function OptionalNumberControl({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number
  onChange: (value: number | undefined) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value ?? ''}
        min={2}
        max={24}
        step={0.5}
        placeholder="Auto"
        onChange={(e) => {
          if (e.currentTarget.value === '') {
            onChange(undefined)
            return
          }
          const next = e.currentTarget.valueAsNumber
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}
