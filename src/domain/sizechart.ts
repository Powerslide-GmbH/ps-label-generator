import type { SizeChartTable, SizeGroupMode, SizeRow } from './types'

export function detectMode(rows: SizeRow[]): SizeGroupMode {
  const hasRange = rows.some((r) => r.eu.includes('-') || r.mondo.includes('-'))
  return hasRange ? 'dual' : 'single'
}

export function emptySizeRow(): SizeRow {
  return { mondo: '', usM: '', usW: '', uk: '', eu: '' }
}

export function cloneSizeTable(table: SizeChartTable): SizeChartTable {
  return {
    id: table.id,
    name: table.name,
    mode: table.mode,
    rows: table.rows.map((r) => ({ ...r })),
  }
}

export function createEmptySizeTable(
  id = `custom-${Date.now()}`,
  mode: SizeGroupMode = 'dual',
): SizeChartTable {
  return {
    id,
    name: 'Custom size chart',
    mode,
    rows: [emptySizeRow()],
  }
}

/** Legacy fixed-column matrix (MONDO, US M, US W, UK, EU). Prefer parseSizeMatrix for headers. */
export function parseSizeChartSheet(
  name: string,
  matrix: unknown[][],
): SizeChartTable {
  const rows: SizeRow[] = []
  for (const raw of matrix) {
    if (!raw || raw.every((c) => c == null || String(c).trim() === '')) continue
    const mondo = String(raw[0] ?? '').trim()
    const usM = String(raw[1] ?? '').trim()
    const usW = String(raw[2] ?? '').trim()
    const uk = String(raw[3] ?? '').trim()
    const eu = String(raw[4] ?? '').trim()
    if (!mondo && !eu) continue
    rows.push({ mondo, usM, usW, uk, eu })
  }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return {
    id,
    name,
    mode: detectMode(rows),
    rows,
  }
}

export function sizeSystemsForRow(row: SizeRow): Array<keyof SizeRow> {
  const keys: Array<keyof SizeRow> = ['mondo', 'usM', 'usW', 'uk', 'eu']
  return keys.filter((k) => Boolean(row[k]))
}

export function headersForRow(row: SizeRow): string[] {
  const map: Record<keyof SizeRow, string> = {
    mondo: 'MONDO',
    usM: 'US M',
    usW: 'US W',
    uk: 'UK',
    eu: 'EU',
  }
  return sizeSystemsForRow(row).map((k) => map[k])
}

export function valuesForRow(row: SizeRow): string[] {
  return sizeSystemsForRow(row).map((k) => row[k])
}

export function validateSizeTable(table: SizeChartTable): string[] {
  const errors: string[] = []
  if (!table.rows.length) errors.push('At least one size row is required')
  table.rows.forEach((row, i) => {
    if (!row.mondo.trim() && !row.eu.trim()) {
      errors.push(`Row ${i + 1}: MONDO or EU is required`)
    }
  })
  return errors
}
