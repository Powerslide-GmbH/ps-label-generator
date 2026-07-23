import type { OutputSelection } from '@/domain/types'

type Props = {
  value: OutputSelection
  onChange: (next: OutputSelection) => void
}

const CARDS: Array<{
  key: keyof OutputSelection
  title: string
  hint: string
}> = [
  {
    key: 'sizeLabelNormal',
    title: 'Size label normal',
    hint: 'PDF · labels 45×30 · sheet A4 · K-only',
  },
  {
    key: 'sizeLabelDouble',
    title: 'Size label double',
    hint: 'PDF · labels 76×23 · sheet ~206×131 · K-only',
  },
  {
    key: 'boxLabel',
    title: 'Box label',
    hint: 'PDF · label 140×120 · sheet ~196×148 · CMYK',
  },
  {
    key: 'sizeChart',
    title: 'Size chart',
    hint: 'JPG · 1200×600 · RGB',
  },
]

export function OutputSelector({ value, onChange }: Props) {
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
