import { A4_MM } from './types'

export type RectMm = { x: number; y: number; w: number; h: number }

export type PackOptions = {
  gap?: number
  minPage?: { w: number; h: number }
  /** Extra space reserved at top (page chrome). */
  marginTop?: number
  marginBottom?: number
  marginX?: number
  /** Cap the number of labels per row to match a production sheet. */
  maxColumns?: number
  /** When false (default), pack from the top like production sheets. */
  centerVertically?: boolean
}

export function packLabels(
  count: number,
  labelW: number,
  labelH: number,
  opts: PackOptions = {},
): { page: { w: number; h: number }; slots: RectMm[] } {
  const gap = opts.gap ?? 0
  const minPage = opts.minPage ?? A4_MM
  const marginTop = opts.marginTop ?? 0
  const marginBottom = opts.marginBottom ?? 0
  const marginX = opts.marginX ?? 0

  if (count <= 0) {
    return { page: { ...minPage }, slots: [] }
  }

  const availW = minPage.w - marginX * 2
  let cols = Math.max(1, Math.floor((availW + gap) / (labelW + gap)))
  if (opts.maxColumns != null) {
    cols = Math.min(cols, Math.max(1, Math.floor(opts.maxColumns)))
  }
  let rows = Math.ceil(count / cols)
  let pageW = Math.max(
    minPage.w,
    cols * labelW + (cols - 1) * gap + marginX * 2,
  )
  let pageH = Math.max(
    minPage.h,
    rows * labelH + (rows - 1) * gap + marginTop + marginBottom,
  )

  while (cols * rows < count) {
    cols += 1
    rows = Math.ceil(count / cols)
    pageW = Math.max(
      minPage.w,
      cols * labelW + (cols - 1) * gap + marginX * 2,
    )
    pageH = Math.max(
      minPage.h,
      rows * labelH + (rows - 1) * gap + marginTop + marginBottom,
    )
  }

  const usedW = cols * labelW + (cols - 1) * gap
  const usedH = rows * labelH + (rows - 1) * gap
  const offsetX = marginX + (pageW - marginX * 2 - usedW) / 2
  // Masters pack from the top under the header chrome — do not vertically center
  // (that left a huge empty band and made the preview look broken).
  const offsetY = opts.centerVertically
    ? marginTop + Math.max(0, (pageH - marginTop - marginBottom - usedH) / 2)
    : marginTop

  const slots: RectMm[] = []
  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    slots.push({
      x: offsetX + c * (labelW + gap),
      y: offsetY + r * (labelH + gap),
      w: labelW,
      h: labelH,
    })
  }
  return { page: { w: pageW, h: pageH }, slots }
}
