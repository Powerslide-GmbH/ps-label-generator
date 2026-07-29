import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AssetRef } from '@/domain/types'
import {
  inlineLogoToAssetRef,
  readInlineLogoFromFile,
  type InlineLogo,
} from '@/domain/customLogo'

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
  /** Persist a PC upload into the document (customLogos). Default: enabled. */
  allowUpload?: boolean
  onImportCustom?: (logo: InlineLogo) => void
}

function logoSrc(path: string) {
  if (path.startsWith('data:') || path.startsWith('blob:')) return path
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
  allowUpload = true,
  onImportCustom,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<string[]>(selected)
  const [localExtras, setLocalExtras] = useState<AssetRef[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const catalogPlusLocal = useMemo(() => {
    const seen = new Set(logos.map((l) => l.id))
    return [...logos, ...localExtras.filter((l) => !seen.has(l.id))]
  }, [logos, localExtras])

  const selectedAssets = useMemo(
    () =>
      selected
        .map((id) => catalogPlusLocal.find((l) => l.id === id))
        .filter((x): x is AssetRef => Boolean(x)),
    [catalogPlusLocal, selected],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalogPlusLocal
    return catalogPlusLocal.filter(
      (l) =>
        l.label.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q),
    )
  }, [catalogPlusLocal, query])

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

  async function handleUpload(file: File | null) {
    if (!file || !onImportCustom) return
    setUploading(true)
    try {
      const inline = await readInlineLogoFromFile(file)
      if (!inline.cmykPreserving) {
        window.alert('CMYK not guaranteed for raster/SVG uploads. Prefer PDF for production.')
      }
      onImportCustom(inline)
      setLocalExtras((prev) => [...prev, inlineLogoToAssetRef(inline)])
      setDraft((prev) => (multiple ? [...prev.filter((id) => id !== inline.id), inline.id] : [inline.id]))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not import logo.')
    } finally {
      setUploading(false)
    }
  }

  const summary =
    selectedAssets.length === 0
      ? 'Click to select…'
      : multiple
        ? `${selectedAssets.length} selected`
        : selectedAssets[0]?.label ?? 'Selected'

  const canUpload = allowUpload && Boolean(onImportCustom)

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
            <div className="modal-toolbar">
              <input
                className="search"
                placeholder="Search logos…"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
              {canUpload && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    accept=".pdf,.svg,.png,.jpg,.jpeg,application/pdf,image/svg+xml,image/png,image/jpeg"
                    onChange={(e) => {
                      void handleUpload(e.target.files?.[0] ?? null)
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    className="secondary"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? 'Uploading…' : 'Upload from PC'}
                  </button>
                </>
              )}
            </div>
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
