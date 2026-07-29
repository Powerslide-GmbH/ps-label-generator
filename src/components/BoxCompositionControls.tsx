import { useState } from 'react'
import { clampBoxDimensions } from '@/domain/boxConfig'
import {
  COMMON_BOX_SIZES_MM,
  DEFAULT_BOX_LAYOUT,
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
          Stored in the preset. Use these controls for exceptional masters
          without changing the global template.
        </p>
        <div className="layout-controls-grid">
          <label>
            Sublogos
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
            Wordmark align
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
          <NumberControl
            label="Wordmark scale"
            value={doc.boxLayout.wordmarkScale}
            min={0.5}
            max={1.8}
            step={0.05}
            onChange={(wordmarkScale) => patchLayout({ wordmarkScale })}
          />
          <NumberControl
            label="Product scale"
            value={doc.boxLayout.productImageScale}
            min={0.5}
            max={1.5}
            step={0.05}
            onChange={(productImageScale) =>
              patchLayout({ productImageScale })
            }
          />
          <NumberControl
            label="Title column (%)"
            value={doc.boxLayout.titleColumnPercent}
            min={30}
            max={75}
            step={1}
            onChange={(titleColumnPercent) =>
              patchLayout({ titleColumnPercent })
            }
          />
          <NumberControl
            label="Brand gap (mm)"
            value={doc.boxLayout.brandGapMm}
            min={-4}
            max={12}
            step={0.5}
            onChange={(brandGapMm) => patchLayout({ brandGapMm })}
          />
          <OptionalNumberControl
            label="Side margin (mm)"
            value={doc.boxLayout.marginX}
            onChange={(marginX) => patchLayout({ marginX })}
          />
          <OptionalNumberControl
            label="Top margin (mm)"
            value={doc.boxLayout.marginTop}
            onChange={(marginTop) => patchLayout({ marginTop })}
          />
          <OptionalNumberControl
            label="Bottom margin (mm)"
            value={doc.boxLayout.marginBottom}
            onChange={(marginBottom) => patchLayout({ marginBottom })}
          />
        </div>
        <div className="advanced-output-settings">
          <h3>Typography & sheets</h3>
          <div className="layout-controls-grid">
            <NumberControl
              label="Size normal title (mm)"
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
              label="Size double title (mm)"
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
              label="Box title (mm)"
              value={doc.titleSizes.box}
              min={3}
              max={16}
              step={0.1}
              onChange={(box) =>
                onChange({
                  ...doc,
                  titleSizes: { ...doc.titleSizes, box },
                })
              }
            />
            <NumberControl
              label="Size chart title (px)"
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
              label="Normal sheet columns"
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
              label="Double sheet columns"
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
        </div>
        <button
          type="button"
          className="subtle reset-layout"
          onClick={() => onChange({ ...doc, boxLayout: { ...DEFAULT_BOX_LAYOUT } })}
        >
          Reset layout tuning
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
        onChange={(e) => onChange(Number(e.target.value) || value)}
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
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : Number(e.target.value))
        }
      />
    </label>
  )
}
