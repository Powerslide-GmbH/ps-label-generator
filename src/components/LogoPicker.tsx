import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AssetRef } from '@/domain/types'

type Props = {
  logos: AssetRef[]
  selected: string[]
  onChange: (ids: string[]) => void
  multiple?: boolean
  label?: string
  /** Compact card for materials (2–3 per row). */
  dense?: boolean
  /** Optional override preview URLs by logo id (e.g. tinted wordmark). */
  previewSrcById?: Record<string, string>
  hint?: string
}

function logoSrc(path: string) {
  return path.startsWith('content/') ? `./${path}` : path
}

export function LogoPicker({
  logos,
  selected,
  onChange,
  multiple = true,
  label = 'Logos',
  dense = false,
  previewSrcById,
  hint,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<string[]>(selected)

  useEffect(() => {
    if (open) {
      setDraft(selected)
      setQuery('')
    }
  }, [open, selected])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const selectedAssets = useMemo(
    () =>
      selected
        .map((id) => logos.find((l) => l.id === id))
        .filter((x): x is AssetRef => Boolean(x)),
    [logos, selected],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return logos
    return logos.filter(
      (l) =>
        l.label.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q),
    )
  }, [logos, query])

  function toggleDraft(id: string) {
    if (multiple) {
      setDraft((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      )
    } else {
      setDraft([id])
    }
  }

  function removeSelected(e: ReactMouseEvent | ReactKeyboardEvent, id: string) {
    e.stopPropagation()
    onChange(selected.filter((x) => x !== id))
  }

  function moveSelected(
    e: ReactMouseEvent | ReactKeyboardEvent,
    id: string,
    dir: -1 | 1,
  ) {
    e.stopPropagation()
    const i = selected.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= selected.length) return
    const next = [...selected]
    const [item] = next.splice(i, 1)
    next.splice(j, 0, item)
    onChange(next)
  }

  function confirm() {
    onChange(multiple ? draft : draft.slice(0, 1))
    setOpen(false)
  }

  const summary =
    selectedAssets.length === 0
      ? 'Click to select…'
      : multiple
        ? `${selectedAssets.length} selected`
        : selectedAssets[0]?.label ?? 'Selected'

  return (
    <div className={`logo-picker ${dense ? 'dense' : 'roomy'}`}>
      <button
        type="button"
        className="logo-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <div className="logo-trigger-header">
          <span className="logo-trigger-label">{label}</span>
          {!dense && <span className="logo-trigger-hint">{summary}</span>}
        </div>
        <div className="logo-trigger-body">
          {selectedAssets.length > 0 ? (
            <div className="logo-trigger-previews">
              {selectedAssets.map((logo) => (
                <span key={logo.id} className="logo-preview" title={logo.label}>
                  <img
                    src={previewSrcById?.[logo.id] ?? logoSrc(logo.path)}
                    alt=""
                  />
                  {multiple && (
                    <span className="logo-preview-tools">
                      <span
                        role="button"
                        tabIndex={0}
                        title="Move left"
                        onClick={(e) => moveSelected(e, logo.id, -1)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') moveSelected(e, logo.id, -1)
                        }}
                      >
                        {'\u2039'}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        title="Move right"
                        onClick={(e) => moveSelected(e, logo.id, 1)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') moveSelected(e, logo.id, 1)
                        }}
                      >
                        {'\u203A'}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        title="Remove"
                        onClick={(e) => removeSelected(e, logo.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') removeSelected(e, logo.id)
                        }}
                      >
                        {'\u00D7'}
                      </span>
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <span className="logo-trigger-empty">+</span>
          )}
          {dense && <span className="logo-trigger-hint">{summary}</span>}
        </div>
      </button>
      {hint && <p className="logo-picker-hint">{hint}</p>}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{label}</h3>
              <button type="button" onClick={() => setOpen(false)}>
                {'\u00D7'}
              </button>
            </div>
            <input
              className="search"
              placeholder="Search logos…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="logo-grid modal-grid">
              {filtered.map((logo) => {
                const active = draft.includes(logo.id)
                return (
                  <button
                    type="button"
                    key={logo.id}
                    className={`logo-tile ${active ? 'active' : ''}`}
                    onClick={() => toggleDraft(logo.id)}
                    title={logo.name}
                  >
                    <img src={logoSrc(logo.path)} alt={logo.label} />
                    <span>{logo.label}</span>
                  </button>
                )
              })}
              {!filtered.length && <p className="muted">No logos match.</p>}
            </div>
            <div className="modal-foot">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirm}>
                Apply ({draft.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
