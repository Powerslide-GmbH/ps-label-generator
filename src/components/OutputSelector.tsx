import type { OutputSelection } from '@/domain/types'

type Props = {
  value: OutputSelection
  onChange: (next: OutputSelection) => void
  /** Compact inline checkboxes for the header export cluster. */
  dense?: boolean
  variant?: 'default' | 'header'
}

const CARDS: Array<{
  key: keyof OutputSelection
  title: string
  short: string
  hint: string
}> = [
  {
    key: 'sizeLabelNormal',
    title: 'Size label normal',
    short: 'Size normal',
    hint: 'PDF · labels 45×30 · sheet A4 · K-only',
  },
  {
    key: 'sizeLabelDouble',
    title: 'Size label double',
    short: 'Size double',
    hint: 'PDF · labels 76×23 · sheet ~206×131 · K-only',
  },
  {
    key: 'boxLabel',
    title: 'Box label',
    short: 'Box',
    hint: 'PDF · 140×120 on ~196×148 · CMYK · print-safe',
  },
  {
    key: 'sizeChart',
    title: 'Size chart',
    short: 'Size chart',
    hint: 'WebP · 1200×600 · RGB · web-ready',
  },
]

export function OutputSelector({
  value,
  onChange,
  dense,
  variant = 'default',
}: Props) {
  const header = dense || variant === 'header'

  if (header) {
    return (
      <div className="output-selector-dense" role="group" aria-label="Outputs">
        {CARDS.map((card) => {
          const active = value[card.key]
          return (
            <label key={card.key} className="output-check">
              <input
                type="checkbox"
                checked={active}
                onChange={() =>
                  onChange({ ...value, [card.key]: !value[card.key] })
                }
              />
              <span>{card.short}</span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className="field">
      <label>Outputs</label>
      <div className="output-cards">
        {CARDS.map((card) => {
          const active = value[card.key]
          return (
            <button
              key={card.key}
              type="button"
              className={`output-card ${active ? 'active' : ''}`}
              onClick={() =>
                onChange({ ...value, [card.key]: !value[card.key] })
              }
              aria-pressed={active}
            >
              <span className="check">{active ? '\u2713' : ''}</span>
              <span className="output-title">{card.title}</span>
              <span className="output-hint">{card.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
