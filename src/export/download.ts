import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { ExportBundleItem } from './pdfExport'

export async function downloadExports(items: ExportBundleItem[], zipName: string) {
  if (items.length === 1) {
    const item = items[0]
    const blob =
      item.bytes instanceof Blob
        ? item.bytes
        : new Blob([item.bytes], {
            type: item.filename.endsWith('.pdf')
              ? 'application/pdf'
              : 'application/octet-stream',
          })
    saveAs(blob, item.filename)
    return
  }

  const zip = new JSZip()
  for (const item of items) {
    zip.file(
      item.filename,
      item.bytes instanceof Blob ? item.bytes : item.bytes,
    )
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, zipName.endsWith('.zip') ? zipName : `${zipName}.zip`)
}
