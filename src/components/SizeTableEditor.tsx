import { useMemo, useRef, useState } from 'react'
import type { SizeChartTable, SizeRow } from '@/domain/types'
import {
  cloneSizeTable,
  createEmptySizeTable,
  detectMode,
  emptySizeRow,
  validateSizeTable,
} from '@/domain/sizechart'
import {
  downloadBlob,
  downloadTextFile,
  importSizeTableFile,
  sizeTableToCsv,
  sizeTableToXlsxBlob,
} from '@/domain/sizeTableIo'

type Props = {
  value: SizeChartTable
  catalogTable?: SizeChartTable
  onChange: (next: SizeChartTable) => void
  /** Kids checkbox — adds US Kids column. */
  kids: boolean
  onKidsChange: (kids: boolean) => void
}

type ClassSelect = 'default' | 'adult-class-a' | 'kids-class-b' | 'none'

const BASE_COLS: Array<{ key: keyof SizeRow; label: string }> = [
  { key: 'mondo', label: 'MONDO' },
  { key: 'usM', label: 'US M' },
  { key: 'usW', label: 'US W' },
  { key: 'uk', label: 'UK' },
  { key: 'eu', label: 'EU' },
]

function classSelectValue(row: SizeRow): ClassSelect {
  if (!row.legalProfileId) return 'default'
  if (row.legalProfileId === 'adult-class-a') return 'adult-class-a'
  if (row.legalProfileId === 'kids-class-b') return 'kids-class-b'
  if (row.legalProfileId === 'none') return 'none'
  return 'default'
}

function applyClassSelect(row: SizeRow, value: ClassSelect): SizeRow {
  if (value === 'default') {
    const next = { ...row }
    delete next.legalProfileId
    return next
  }
  return { ...row, legalProfileId: value }
}

export function SizeTableEditor({
  value,
  catalogTable,
  onChange,
  kids,
  onKidsChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const errors = useMemo(() => validateSizeTable(value), [value])
  const baseName = value.id || value.name || 'size-chart'

  const cols = useMemo(() => {
    if (!kids) return BASE_COLS
    // Insert US Kids after US W
    return [
      BASE_COLS[0],
      BASE_COLS[1],
      BASE_COLS[2],
      { key: 'usKids' as const, label: 'US Kids' },
      BASE_COLS[3],
      BASE_COLS[4],
    ]
  }, [kids])

  function patchRow(index: number, key: keyof SizeRow, text: string) {
    const rows = value.rows.map((r, i) =>
      i === index ? { ...r, [key]: text } : r,
    )
    const next = { ...value, rows }
    next.mode = detectMode(rows)
    onChange(next)
  }

  function patchRowClass(index: number, next: ClassSelect) {
    const rows = value.rows.map((r, i) =>
      i === index ? applyClassSelect(r, next) : r,
    )
    onChange({ ...value, rows })
  }

  function addRow() {
    onChange({ ...value, rows: [...value.rows, emptySizeRow()] })
  }

  function duplicateRow(index: number) {
    const rows = [...value.rows]
    rows.splice(index + 1, 0, { ...rows[index] })
    onChange({ ...value, rows })
  }

  function removeRow(index: number) {
    if (value.rows.length <= 1) return
    if (!window.confirm(`Delete size row ${index + 1}?`)) return
    onChange({
      ...value,
      rows: value.rows.filter((_, i) => i !== index),
    })
  }

  function moveRow(index: number, dir: -1 | 1) {
    const next = index + dir
    if (next < 0 || next >= value.rows.length) return
    const rows = [...value.rows]
    const [item] = rows.splice(index, 1)
    rows.splice(next, 0, item)
    onChange({ ...value, rows })
  }

  function resetFromCatalog() {
    if (!catalogTable) return
    onChange(cloneSizeTable(catalogTable))
  }

  function exportCsv() {
    downloadTextFile(
      `${baseName}.csv`,
      sizeTableToCsv(value),
      'text/csv;charset=utf-8',
    )
  }

  function exportExcel() {
    downloadBlob(`${baseName}.xlsx`, sizeTableToXlsxBlob(value))
  }

  async function onImport(file: File | null) {
    if (!file) return
    try {
      const table = await importSizeTableFile(file)
      onChange({
        ...table,
        id: value.id || table.id,
        name: value.name || table.name,
      })
      const hasKids = table.rows.some((r) => (r.usKids ?? '').trim())
      if (hasKids) onKidsChange(true)
      setImportError(null)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="field size-table-editor">
      <div className="field-label-row">
        <label>Size table (editable)</label>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={kids}
            onChange={(e) => onKidsChange(e.target.checked)}
          />
          Kids (US Kids column)
        </label>
      </div>

      <div className="size-table-wrap">
        <table className="size-table">
          <thead>
            <tr>
              <th>#</th>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>CLASS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, i) => (
              <tr key={i}>
                <td className="idx">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c.key}>
                    <input
                      value={(row[c.key] as string | undefined) ?? ''}
                      onChange={(e) => patchRow(i, c.key, e.target.value)}
                      aria-label={`${c.label} row ${i + 1}`}
                    />
                  </td>
                ))}
                <td>
                  <select
                    value={classSelectValue(row)}
                    onChange={(e) =>
                      patchRowClass(i, e.target.value as ClassSelect)
                    }
                    aria-label={`Class row ${i + 1}`}
                  >
                    <option value="default">Default</option>
                    <option value="adult-class-a">A</option>
                    <option value="kids-class-b">B</option>
                    <option value="none">None</option>
                  </select>
                </td>
                <td className="row-tools">
                  <button type="button" title="Move up" onClick={() => moveRow(i, -1)}>
                    {'\u25B2'}
                  </button>
                  <button type="button" title="Move down" onClick={() => moveRow(i, 1)}>
                    {'\u25BC'}
                  </button>
                  <button
                    type="button"
                    title="Duplicate row"
                    onClick={() => duplicateRow(i)}
                  >
                    {'\u2398'}
                  </button>
                  <button
                    type="button"
                    title="Delete row"
                    onClick={() => removeRow(i)}
                    disabled={value.rows.length <= 1}
                  >
                    {'\u00D7'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-actions wrap">
        <button type="button" onClick={addRow}>
          + Add size
        </button>
        <button
          type="button"
          onClick={resetFromCatalog}
          disabled={!catalogTable}
        >
          Reset from preset
        </button>
        <button type="button" onClick={exportCsv}>
          Export CSV
        </button>
        <button type="button" onClick={exportExcel}>
          Export Excel
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import CSV / Excel
        </button>
        <button
          type="button"
          onClick={() => onChange(createEmptySizeTable(undefined, value.mode))}
        >
          Clear / new
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          hidden
          onChange={(e) => onImport(e.target.files?.[0] ?? null)}
        />
      </div>
      {errors.length > 0 && (
        <p className="hint warn">{errors.join(' · ')}</p>
      )}
      {importError && <p className="hint error-text">{importError}</p>}
    </div>
  )
}
