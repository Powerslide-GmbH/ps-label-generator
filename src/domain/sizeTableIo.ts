import * as XLSX from 'xlsx'
import type { SizeChartTable, SizeRow } from './types'
import { detectMode, emptySizeRow } from './sizechart'

export type SizeField = keyof SizeRow

const FIELD_LABEL: Record<SizeField, string> = {
  mondo: 'MONDO',
  usM: 'US M',
  usW: 'US W',
  usKids: 'US Kids',
  uk: 'UK',
  eu: 'EU',
  legalProfileId: 'CLASS',
}

/** Normalize a header cell to a size field, or null if not recognized. */
export function matchSizeHeader(raw: string): SizeField | null {
  const n = raw
    .trim()
    .toLowerCase()
    .replace(/[_./]+/g, ' ')
    .replace(/\s+/g, ' ')
  const aliases: Record<string, SizeField> = {
    mondo: 'mondo',
    mondopoint: 'mondo',
    mp: 'mondo',
    'us m': 'usM',
    usm: 'usM',
    'us men': 'usM',
    'us male': 'usM',
    'us man': 'usM',
    'us w': 'usW',
    usw: 'usW',
    'us women': 'usW',
    'us woman': 'usW',
    'us female': 'usW',
    'us ladies': 'usW',
    'us kids': 'usKids',
    uskids: 'usKids',
    'us children': 'usKids',
    'us child': 'usKids',
    'us jr': 'usKids',
    'us junior': 'usKids',
    junior: 'usKids',
    'jr': 'usKids',
    kids: 'usKids',
    uk: 'uk',
    eu: 'eu',
    eur: 'eu',
    euro: 'eu',
    european: 'eu',
    class: 'legalProfileId',
    'legal class': 'legalProfileId',
    'class a b': 'legalProfileId',
  }
  return aliases[n] ?? null
}

function normalizeClassValue(raw: string): string {
  const n = raw.trim().toLowerCase()
  if (!n) return ''
  if (n === 'a' || n === 'class a' || n === 'class-a' || n === 'adult-class-a') {
    return 'adult-class-a'
  }
  if (n === 'b' || n === 'class b' || n === 'class-b' || n === 'kids-class-b') {
    return 'kids-class-b'
  }
  if (n === 'none' || n === '-') return 'none'
  return raw.trim()
}

function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Avoid 5.5 becoming "5,5" in some locales via toString
    return String(v)
  }
  return String(v).trim()
}

function slugId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sizes'
}

function countMatchedHeaders(cells: string[]): number {
  return cells.reduce((n, c) => n + (matchSizeHeader(c) ? 1 : 0), 0)
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => cellText(c) === '')
}

/** Drop fully empty trailing rows/cols; keep rectangular matrix of strings. */
export function normalizeMatrix(raw: unknown[][]): string[][] {
  const rows = raw
    .map((r) => (Array.isArray(r) ? r.map(cellText) : []))
    .filter((r) => !isBlankRow(r))
  if (!rows.length) return []
  let maxCols = 0
  for (const r of rows) maxCols = Math.max(maxCols, r.length)
  while (maxCols > 0 && rows.every((r) => !r[maxCols - 1])) maxCols -= 1
  return rows.map((r) => {
    const next = r.slice(0, maxCols)
    while (next.length < maxCols) next.push('')
    return next
  })
}

/**
 * Detect orientation:
 * - columnHeaders: first column is MONDO/US M/� (as on box / size chart)
 * - rowHeaders: first row is MONDO | US M | �
 */
export function detectHeaderLayout(
  matrix: string[][],
): 'columnHeaders' | 'rowHeaders' | null {
  if (!matrix.length) return null
  const col0 = matrix.map((r) => r[0] ?? '')
  const row0 = matrix[0] ?? []
  const colHits = countMatchedHeaders(col0)
  const rowHits = countMatchedHeaders(row0)
  if (colHits >= 2 && colHits >= rowHits) return 'columnHeaders'
  if (rowHits >= 2) return 'rowHeaders'
  // Fallback: if first cell looks like a size header, prefer that axis
  if (matchSizeHeader(col0[0] ?? '') && matrix[0].length > 1) return 'columnHeaders'
  if (matchSizeHeader(row0[0] ?? '') && matrix.length > 1) return 'rowHeaders'
  return null
}

function assignField(size: SizeRow, field: SizeField, v: string) {
  if (field === 'legalProfileId') {
    const id = normalizeClassValue(v)
    if (id) size.legalProfileId = id
    return
  }
  if (field === 'usKids') {
    size.usKids = v
    return
  }
  size[field] = v
}

function rowsFromColumnHeaders(matrix: string[][]): SizeRow[] {
  const fieldByRow = new Map<number, SizeField>()
  matrix.forEach((row, ri) => {
    const field = matchSizeHeader(row[0] ?? '')
    if (field) fieldByRow.set(ri, field)
  })
  if (!fieldByRow.size) return []

  const colCount = matrix[0]?.length ?? 0
  const out: SizeRow[] = []
  for (let ci = 1; ci < colCount; ci++) {
    const size = emptySizeRow()
    let any = false
    for (const [ri, field] of fieldByRow) {
      const v = matrix[ri]?.[ci] ?? ''
      if (v) {
        assignField(size, field, v)
        any = true
      }
    }
    if (any) out.push(size)
  }
  return out
}

function rowsFromRowHeaders(matrix: string[][]): SizeRow[] {
  const header = matrix[0] ?? []
  const colField = new Map<number, SizeField>()
  header.forEach((cell, ci) => {
    const field = matchSizeHeader(cell)
    if (field) colField.set(ci, field)
  })
  if (!colField.size) return []

  const out: SizeRow[] = []
  for (let ri = 1; ri < matrix.length; ri++) {
    const size = emptySizeRow()
    let any = false
    for (const [ci, field] of colField) {
      const v = matrix[ri]?.[ci] ?? ''
      if (v) {
        assignField(size, field, v)
        any = true
      }
    }
    if (any) out.push(size)
  }
  return out
}

/** Parse a 2D sheet (CSV/Excel cells) into a size table. Headers in row 1 or column 1. */
export function parseSizeMatrix(
  name: string,
  rawMatrix: unknown[][],
): SizeChartTable {
  const matrix = normalizeMatrix(rawMatrix)
  const layout = detectHeaderLayout(matrix)
  let rows: SizeRow[] = []
  if (layout === 'columnHeaders') {
    rows = rowsFromColumnHeaders(matrix)
  } else if (layout === 'rowHeaders') {
    rows = rowsFromRowHeaders(matrix)
  } else {
    // Legacy fixed columns: MONDO, US M, US W, UK, EU without headers
    for (const raw of matrix) {
      const mondo = raw[0] ?? ''
      const usM = raw[1] ?? ''
      const usW = raw[2] ?? ''
      const uk = raw[3] ?? ''
      const eu = raw[4] ?? ''
      if (!mondo && !eu) continue
      rows.push({ mondo, usM, usW, uk, eu })
    }
  }
  if (!rows.length) {
    throw new Error(
      'No size rows found. Put headers (MONDO, US M, US W, UK, EU) in row 1 or column 1.',
    )
  }
  return {
    id: slugId(name),
    name,
    mode: detectMode(rows),
    rows,
  }
}

function exportFields(table: SizeChartTable): SizeField[] {
  const fields: SizeField[] = ['mondo', 'usM', 'usW', 'uk', 'eu']
  const hasKids = table.rows.some((r) => (r.usKids ?? '').trim())
  const hasClass = table.rows.some((r) => (r.legalProfileId ?? '').trim())
  if (hasKids) {
    const idx = fields.indexOf('usW')
    fields.splice(idx + 1, 0, 'usKids')
  }
  if (hasClass) fields.push('legalProfileId')
  return fields
}

function exportCell(row: SizeRow | undefined, field: SizeField): string {
  if (!row) return ''
  if (field === 'legalProfileId') {
    const id = row.legalProfileId ?? ''
    if (id === 'adult-class-a') return 'A'
    if (id === 'kids-class-b') return 'B'
    if (id === 'none') return 'none'
    return id
  }
  return row[field] ?? ''
}

/** Export matrix with system names in column 1 (label layout). */
export function sizeTableToMatrix(table: SizeChartTable): string[][] {
  const cols = Math.max(table.rows.length, 1)
  return exportFields(table).map((field) => {
    const row = [FIELD_LABEL[field]]
    for (let i = 0; i < cols; i++) {
      row.push(exportCell(table.rows[i], field))
    }
    return row
  })
}

export function sizeTableToCsv(table: SizeChartTable): string {
  const matrix = sizeTableToMatrix(table)
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
          return cell
        })
        .join(','),
    )
    .join('\r\n')
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function parseSizeCsv(name: string, text: string): SizeChartTable {
  return parseSizeMatrix(name, parseCsvText(text))
}

export function parseSizeWorkbook(name: string, data: ArrayBuffer): SizeChartTable {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Excel file has no sheets')
  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]
  return parseSizeMatrix(name, matrix)
}

export function sizeTableToXlsxBlob(table: SizeChartTable): Blob {
  const matrix = sizeTableToMatrix(table)
  const ws = XLSX.utils.aoa_to_sheet(matrix)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sizes')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function importSizeTableFile(file: File): Promise<SizeChartTable> {
  const base = file.name.replace(/\.[^.]+$/, '') || 'Imported sizes'
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return parseSizeCsv(base, await file.text())
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseSizeWorkbook(base, await file.arrayBuffer())
  }
  throw new Error('Use a .csv or .xlsx file')
}

export function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
