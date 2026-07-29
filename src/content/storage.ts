import type { LabelDocument, ModelPreset, SizeChartTable } from '@/domain/types'
import { STORAGE_VERSION } from '@/domain/types'
import { migrateDocument, migratePreset } from '@/domain/boxConfig'
import { cloneSizeTable } from '@/domain/sizechart'

const DOC_KEY = 'ps-labels:document'
const PRESETS_KEY = 'ps-labels:user-presets'
const TABLE_KEY = 'ps-labels:working-table'
const VERSION_KEY = 'ps-labels:storage-version'

type StoredBundle = {
  version: number
  doc?: LabelDocument
  table?: SizeChartTable
  presets?: ModelPreset[]
}

function migrateIfNeeded() {
  const ver = Number(localStorage.getItem(VERSION_KEY) || '0')
  if (ver >= STORAGE_VERSION) return
  // Soft migrate: bump version; loaders normalize shapes via migrateDocument/migratePreset
  localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION))
}

export function saveDocumentLocal(doc: LabelDocument) {
  migrateIfNeeded()
  localStorage.setItem(DOC_KEY, JSON.stringify(doc))
}

export function loadDocumentLocal(): LabelDocument | null {
  migrateIfNeeded()
  const raw = localStorage.getItem(DOC_KEY)
  if (!raw) return null
  try {
    return migrateDocument(JSON.parse(raw) as Partial<LabelDocument>)
  } catch {
    return null
  }
}

export function saveWorkingTable(table: SizeChartTable) {
  migrateIfNeeded()
  localStorage.setItem(TABLE_KEY, JSON.stringify(table))
}

export function loadWorkingTable(): SizeChartTable | null {
  migrateIfNeeded()
  const raw = localStorage.getItem(TABLE_KEY)
  if (!raw) return null
  try {
    const table = JSON.parse(raw) as SizeChartTable
    return cloneSizeTable({
      ...table,
      rows: (table.rows ?? []).map((r) => ({
        mondo: r.mondo ?? '',
        usM: r.usM ?? '',
        usW: r.usW ?? '',
        usKids: r.usKids ?? '',
        uk: r.uk ?? '',
        eu: r.eu ?? '',
        legalProfileId: r.legalProfileId,
      })),
    })
  } catch {
    return null
  }
}

export function saveUserPresets(presets: ModelPreset[]) {
  migrateIfNeeded()
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.map(migratePreset)))
}

export function loadUserPresets(): ModelPreset[] {
  migrateIfNeeded()
  const raw = localStorage.getItem(PRESETS_KEY)
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as ModelPreset[]
    return list.map(migratePreset)
  } catch {
    return []
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((t) => JSON.parse(t) as unknown)
}

export type { StoredBundle }
