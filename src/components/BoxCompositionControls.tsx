import { useState } from 'react'
import { clampBoxDimensions } from '@/domain/boxConfig'
import { COMMON_BOX_SIZES_MM, type LabelDocument } from '@/domain/types'

type Props = {
  doc: LabelDocument
  onChange: (next: LabelDocument) => void
  tableWarning?: string
  overflow?: { block: string; message: string }[]
  layoutStrategy?: string
}

function sizeChoice(doc: LabelDocument): string {
  const { width, height } = doc.boxDimensionsMm
  const match = COMMON_BOX_SIZES_MM.find(
    (s) => s.width === width && s.height === height,
  )
  if (!match) return 'custom'
  return `${match.width}x${match.height}`
}

export function BoxCompositionControls({
  doc,
  onChange,
  tableWarning,
  overflow,
  layoutStrategy: _layoutStrategy,
}: Props) {
  const matchedSize = sizeChoice(doc)
  const [forceCustom, setForceCustom] = useState(false)
  const size = forceCustom || matchedSize === 'custom' ? 'custom' : matchedSize
  const warnings = [
    ...(tableWarning ? [tableWarning] : []),
    ...(overflow?.map((o) => `${o.block}: ${o.message}`) ?? []),
  ]

  function patch(partial: Partial<LabelDocument>) {
    onChange({ ...doc, ...partial, boxTableFlow: { mode: 'auto' } })
  }

  function setLabelSize(choice: string) {
    if (choice === 'custom') {
      setForceCustom(true)
      return
    }
    setForceCustom(false)
    const [w, h] = choice.split('x').map(Number)
    if (!w || !h) return
    patch({ boxDimensionsMm: clampBoxDimensions({ width: w, height: h }) })
  }

  return (
    <section className="box-composition">
      <h2>Box composition</h2>

      <div className="field">
        <label>Label size</label>
        <select
          className="box-size-select"
          value={size}
          onChange={(e) => setLabelSize(e.target.value)}
        >
          {COMMON_BOX_SIZES_MM.map((s) => (
            <option key={`${s.width}x${s.height}`} value={`${s.width}x${s.height}`}>
              {s.width} X {s.height} mm
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
        {size === 'custom' && (
          <div className="title-sizes" style={{ marginTop: 8 }}>
            <label>
              Width (mm)
              <input
                type="number"
                min={90}
                step={0.1}
                value={doc.boxDimensionsMm.width}
                onChange={(e) =>
                  patch({
                    boxDimensionsMm: clampBoxDimensions({
                      width: Number(e.target.value) || doc.boxDimensionsMm.width,
                      height: doc.boxDimensionsMm.height,
                    }),
                  })
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
                  patch({
                    boxDimensionsMm: clampBoxDimensions({
                      width: doc.boxDimensionsMm.width,
                      height:
                        Number(e.target.value) || doc.boxDimensionsMm.height,
                    }),
                  })
                }
              />
            </label>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="warn-list">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
