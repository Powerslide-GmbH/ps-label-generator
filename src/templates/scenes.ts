import type { LabelDocument, SizeChartTable, SizeRow, TextRun } from '@/domain/types'
import {
  BOX_SHEET_MM,
  SIZE_DOUBLE_SHEET_MM,
  SIZE_NORMAL_SHEET_MM,
} from '@/domain/types'
import { headersForRow, valuesForRow } from '@/domain/sizechart'
import { plainText } from '@/domain/richText'
import { packLabels } from '@/domain/packing'

export const SIZE_LABEL_NORMAL = { w: 45, h: 30 }
export const SIZE_LABEL_DOUBLE = { w: 76, h: 23 }
/** @deprecated use SIZE_LABEL_NORMAL */
export const SIZE_LABEL_SINGLE = SIZE_LABEL_NORMAL
/** @deprecated use SIZE_LABEL_DOUBLE */
export const SIZE_LABEL_DUAL = SIZE_LABEL_DOUBLE
export const BOX_LABEL = { w: 140, h: 120 }
export const SIZE_CHART_PX = { w: 1200, h: 600 }

export type SceneText = {
  type: 'text'
  x: number
  y: number
  runs: TextRun[]
  fill: string
  anchor?: 'start' | 'middle' | 'end'
  rotate?: number
}

export type SceneRect = {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  radius?: number
}

export type SceneLine = {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth?: number
  dash?: string
}

export type SceneImage = {
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  href: string
  fit?: 'contain' | 'cover'
}

export type SceneNode = SceneText | SceneRect | SceneLine | SceneImage

export type LabelScene = {
  kind: 'size-normal' | 'size-double' | 'box' | 'sizechart'
  unit: 'mm' | 'px'
  width: number
  height: number
  nodes: SceneNode[]
}

export type SceneAssets = {
  /** Colored brand wordmark (box + size-sheet footer). */
  wordmarkHref?: string
  boxWordmarkHref?: string
  /** Black wordmark for individual size-label pieces. */
  sizeWordmarkHref?: string
  /** Page header PS badge (size-label sheets). */
  pageLogoHref?: string
  /**
   * Three location+material pairs for size labels (always 6 logos).
   * Location icons are fixed; material icons come from the 3 selectors.
   */
  materialPairs?: Array<{ locationHref: string; materialHref: string }>
  classLogoHref?: string
  /** Red dashed fold/cut guides on size labels (preview + export). */
  showPrintGuides?: boolean
}

function titleRuns(doc: LabelDocument, fontSize: number): TextRun[] {
  return doc.title.map((r) => ({
    text: r.text,
    bold: r.bold !== false,
    fontSize,
  }))
}

function sizeLabelLegalLines(doc: LabelDocument): Array<{
  text: string
  bold?: boolean
}> {
  const l = doc.legal
  return [
    {
      text: `${l.classText}: ${l.weightRange.split('/')[0].trim()} | ${l.standard}`,
    },
    { text: l.company, bold: true },
    { text: l.address.replace(/,$/, '') },
    { text: l.web.toUpperCase(), bold: true },
  ]
}

function sizeRangeCaption(table: SizeChartTable): string {
  const first = table.rows[0]?.eu
  const last = table.rows[table.rows.length - 1]?.eu
  if (!first) return ''
  if (!last || first === last) return first
  return `${first} - ${last}`
}

function guideLines(
  x: number,
  y: number,
  w: number,
  h: number,
  fold = true,
): SceneNode[] {
  const ys = [y, y + h]
  // Double labels have an 8 mm blank tab at each end; guides mark the
  // printable panel edges and the centre fold, not the outer label border.
  const xs = fold ? [x + 8, x + w / 2, x + w - 8] : [x, x + w]
  return xs.map((gx) => ({
    type: 'line' as const,
    x1: gx,
    y1: ys[0],
    x2: gx,
    y2: ys[1],
    stroke: '#e10600',
    strokeWidth: 0.25,
    dash: '1.2 0.7',
  }))
}

function drawMaterialPairs(
  pairs: Array<{ locationHref: string; materialHref: string }>,
  opts: {
    x: number
    y: number
    w: number
    h: number
    orientation: 'row' | 'column'
    /** Fixed icon height (mm); both location + material scale to this. */
    iconH?: number
  },
): SceneNode[] {
  const nodes: SceneNode[] = []
  const n = Math.max(pairs.length, 1)
  if (opts.orientation === 'row') {
    const pairW = opts.w / n
    const iconH = opts.iconH ?? Math.min(opts.h * 0.92, 4.2)
    pairs.forEach((pair, i) => {
      const px = opts.x + i * pairW
      const gap = 0.6
      const locW = pairW * 0.58
      const matW = pairW * 0.28
      const rowInner = locW + gap + matW
      const startX = px + (pairW - rowInner) / 2
      nodes.push({
        type: 'image',
        x: startX,
        y: opts.y + (opts.h - iconH) / 2,
        w: locW,
        h: iconH,
        href: pair.locationHref,
        fit: 'contain',
      })
      nodes.push({
        type: 'image',
        x: startX + locW + gap,
        y: opts.y + (opts.h - iconH) / 2,
        w: matW,
        h: iconH,
        href: pair.materialHref,
        fit: 'contain',
      })
    })
    return nodes
  }

  // column: each row = location | material (height-capped)
  const rowH = opts.h / n
  const iconH = opts.iconH ?? Math.min(rowH * 0.72, 5.0)
  pairs.forEach((pair, i) => {
    const py = opts.y + i * rowH
    const gap = 1.0
    const locW = opts.w * 0.52
    const matW = opts.w * 0.28
    const blockW = locW + gap + matW
    const startX = opts.x + Math.max((opts.w - blockW) / 2, 0)
    nodes.push({
      type: 'image',
      x: startX,
      y: py + (rowH - iconH) / 2,
      w: locW,
      h: iconH,
      href: pair.locationHref,
      fit: 'contain',
    })
    nodes.push({
      type: 'image',
      x: startX + locW + gap,
      y: py + (rowH - iconH) / 2,
      w: matW,
      h: iconH,
      href: pair.materialHref,
      fit: 'contain',
    })
  })
  return nodes
}

/** Shared size-system table (black header + centered values). */
function drawSizeSystemTable(opts: {
  x: number
  y: number
  w: number
  headers: string[]
  values: string[]
  headerH: number
  valueH: number
  headerFont: number
  valueFont: number
}): SceneNode[] {
  const nodes: SceneNode[] = []
  const n = Math.max(opts.headers.length, 1)
  const colW = opts.w / n
  nodes.push({
    type: 'rect',
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.headerH,
    fill: '#000',
  })
  nodes.push({
    type: 'rect',
    x: opts.x,
    y: opts.y + opts.headerH,
    w: opts.w,
    h: opts.valueH,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 0.15,
  })
  // Top/bottom outer edges already from fills; redraw full frame for crisp black
  nodes.push({
    type: 'rect',
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.headerH + opts.valueH,
    fill: 'none',
    stroke: '#000',
    strokeWidth: 0.15,
  })
  for (let i = 0; i < n; i++) {
    const cx = opts.x + colW * i + colW / 2
    if (i > 0) {
      nodes.push({
        type: 'line',
        x1: opts.x + colW * i,
        y1: opts.y,
        x2: opts.x + colW * i,
        y2: opts.y + opts.headerH + opts.valueH,
        stroke: '#000',
        strokeWidth: 0.12,
      })
    }
    // Optical vertical center for alphabetic baseline ≈ 0.35em above mid
    const headerBaseline =
      opts.y + opts.headerH / 2 + opts.headerFont * 0.35
    const valueBaseline =
      opts.y + opts.headerH + opts.valueH / 2 + opts.valueFont * 0.35
    nodes.push({
      type: 'text',
      x: cx,
      y: headerBaseline,
      runs: [{ text: opts.headers[i] ?? '', bold: true, fontSize: opts.headerFont }],
      fill: '#fff',
      anchor: 'middle',
    })
    nodes.push({
      type: 'text',
      x: cx,
      y: valueBaseline,
      runs: [{ text: opts.values[i] ?? '', bold: true, fontSize: opts.valueFont }],
      fill: '#000',
      anchor: 'middle',
    })
  }
  return nodes
}

/** MASTER SIZE DOUBLE � fold label: left info / right materials */
function sizeLabelPieceDouble(
  doc: LabelDocument,
  row: SizeRow,
  x: number,
  y: number,
  w: number,
  h: number,
  assets: SceneAssets,
): SceneNode[] {
  const headers = headersForRow(row)
  const values = valuesForRow(row)
  const foldX = x + w / 2
  const guideInset = 8
  const leftX = x + guideInset
  const leftW = w / 2 - guideInset
  const rightW = w / 2 - guideInset
  const contentPad = 0.6
  const brandPad = 1.8
  const padY = 1.0
  const nodes: SceneNode[] = [
    { type: 'rect', x, y, w, h, fill: '#fff', stroke: '#000', strokeWidth: 0.15 },
  ]

  const pieceWordmark = assets.sizeWordmarkHref || assets.wordmarkHref
  const wmW = 10
  const wmH = 3.2
  if (pieceWordmark) {
    nodes.push({
      type: 'image',
      x: leftX + brandPad,
      y: y + padY,
      w: wmW,
      h: wmH,
      href: pieceWordmark,
      fit: 'contain',
    })
  }

  const titleX = leftX + 11.8
  const titleWidth = leftX + leftW - contentPad - titleX
  const titleChars = Math.max(plainText(doc.title).length, 1)
  const titleSize = Math.max(
    1.2,
    Math.min(doc.titleSizes.sizeLabel, 2.15, titleWidth / (titleChars * 0.58)),
  )
  const titleY = y + padY + 2.25
  nodes.push({
    type: 'text',
    x: titleX,
    y: titleY,
    runs: titleRuns(doc, titleSize),
    fill: '#000',
  })
  nodes.push({
    type: 'text',
    x: leftX + brandPad,
    y: y + 5.8,
    runs: [{ text: `#${doc.sku}`, bold: false, fontSize: 1.8 }],
    fill: '#000',
  })

  const tableX = leftX + contentPad
  const tableW = leftW - contentPad * 2
  const tableY = y + 8.4
  nodes.push(
    ...drawSizeSystemTable({
      x: tableX,
      y: tableY,
      w: tableW,
      headers,
      values,
      headerH: 2.0,
      valueH: 2.7,
      headerFont: 1.35,
      valueFont: 1.75,
    }),
  )

  const lines = sizeLabelLegalLines(doc)
  const lineH = 1.5
  const legalBlockH = lines.length * lineH
  const legalY = y + h - 1.0 - legalBlockH + lineH * 0.72
  lines.forEach((line, i) => {
    nodes.push({
      type: 'text',
      x: leftX + contentPad,
      y: legalY + i * lineH,
      runs: [{ text: line.text, bold: line.bold, fontSize: 1.35 }],
      fill: '#111',
    })
  })

  const pairs = (assets.materialPairs ?? []).filter(
    (p) => p.locationHref && p.materialHref,
  )
  if (pairs.length) {
    nodes.push(
      ...drawMaterialPairs(pairs, {
        x: foldX + 1.4,
        y: y + 0.9,
        w: rightW - 4.8,
        h: h - 1.8,
        orientation: 'column',
        iconH: 5.8,
      }),
    )
  }

  nodes.push({
    type: 'text',
    x: x + w - guideInset - 3.4,
    y: y + h / 2,
    runs: [{ text: doc.legal.madeIn.toUpperCase(), bold: false, fontSize: 1.7 }],
    fill: '#111',
    rotate: -90,
    anchor: 'middle',
  })

  if (assets.showPrintGuides) {
    nodes.push(...guideLines(x, y, w, h, true))
  }

  return nodes
}

/** MASTER SIZE NORMAL � single panel */
function sizeLabelPieceNormal(
  doc: LabelDocument,
  row: SizeRow,
  x: number,
  y: number,
  w: number,
  h: number,
  assets: SceneAssets,
): SceneNode[] {
  const headers = headersForRow(row)
  const values = valuesForRow(row)
  const titleSize = Math.min(doc.titleSizes.sizeLabel, 2.0)
  const pad = 1.5
  const brandPad = 2.5
  const contentW = w - pad * 2
  const nodes: SceneNode[] = [
    { type: 'rect', x, y, w, h, fill: '#fff', stroke: '#000', strokeWidth: 0.15 },
  ]

  const pieceWordmark = assets.sizeWordmarkHref || assets.wordmarkHref
  const wmH = 2.1
  if (pieceWordmark) {
    nodes.push({
      type: 'image',
      x: x + brandPad,
      y: y + 1.6,
      w: 20.8,
      h: wmH,
      href: pieceWordmark,
      fit: 'contain',
    })
  }

  const titleY = y + 6.7
  nodes.push({
    type: 'text',
    x: x + brandPad,
    y: titleY,
    runs: titleRuns(doc, titleSize),
    fill: '#000',
  })
  nodes.push({
    type: 'text',
    x: x + w - pad,
    y: titleY,
    runs: [
      {
        text: `#${doc.sku}`,
        bold: false,
        fontSize: Math.max(titleSize - 0.1, 1.75),
      },
    ],
    fill: '#000',
    anchor: 'end',
  })

  const tableY = y + 8.0
  nodes.push(
    ...drawSizeSystemTable({
      x: x + pad,
      y: tableY,
      w: contentW,
      headers,
      values,
      headerH: 2.8,
      valueH: 4.1,
      headerFont: 1.8,
      valueFont: 2.6,
    }),
  )

  const pairs = (assets.materialPairs ?? []).filter(
    (p) => p.locationHref && p.materialHref,
  )
  const matY = tableY + 2.8 + 4.1 + 0.8
  const matH = 5.2
  if (pairs.length) {
    nodes.push(
      ...drawMaterialPairs(pairs, {
        x: x + pad,
        y: matY,
        w: contentW,
        h: matH,
        orientation: 'row',
        iconH: 4.5,
      }),
    )
  }

  const lines = sizeLabelLegalLines(doc)
  const lineH = 1.65
  const footerBlockH = lines.length * lineH
  const footerY = y + 22.7
  lines.forEach((line, i) => {
    nodes.push({
      type: 'text',
      x: x + pad,
      y: footerY + i * lineH,
      runs: [{ text: line.text, bold: line.bold, fontSize: 1.55 }],
      fill: '#111',
    })
  })
  nodes.push({
    type: 'text',
    x: x + w - pad,
    y: y + h - 1.2,
    runs: [
      {
        text: doc.legal.madeIn.toUpperCase(),
        bold: false,
        fontSize: 1.2,
      },
    ],
    fill: '#111',
    anchor: 'end',
  })

  return nodes
}

function sizeLabelPiece(
  doc: LabelDocument,
  row: SizeRow,
  x: number,
  y: number,
  w: number,
  h: number,
  double: boolean,
  assets: SceneAssets,
): SceneNode[] {
  return double
    ? sizeLabelPieceDouble(doc, row, x, y, w, h, assets)
    : sizeLabelPieceNormal(doc, row, x, y, w, h, assets)
}

export function buildSizeLabelScene(
  doc: LabelDocument,
  table: SizeChartTable,
  double: boolean,
  assets: SceneAssets = {},
): LabelScene {
  const label = double ? SIZE_LABEL_DOUBLE : SIZE_LABEL_NORMAL
  const headerH = double ? 18 : 22
  const footerH = double ? 12 : 14
  const sheet = double ? SIZE_DOUBLE_SHEET_MM : SIZE_NORMAL_SHEET_MM
  const { page, slots } = packLabels(table.rows.length, label.w, label.h, {
    gap: double ? 1.5 : 2,
    marginTop: headerH,
    marginBottom: footerH,
    marginX: double ? 10 : 8,
    minPage: sheet,
  })
  const nodes: SceneNode[] = [
    { type: 'rect', x: 0, y: 0, w: page.w, h: page.h, fill: '#ffffff' },
  ]

  // Page chrome — matches documentation sheets
  if (assets.pageLogoHref) {
    nodes.push({
      type: 'image',
      x: double ? 8 : 10,
      y: double ? 4 : 5,
      w: double ? 10 : 12,
      h: double ? 10 : 12,
      href: assets.pageLogoHref,
      fit: 'contain',
    })
  }
  const titleX = assets.pageLogoHref ? (double ? 22 : 26) : double ? 8 : 10
  nodes.push({
    type: 'text',
    x: titleX,
    y: double ? 9 : 11,
    runs: titleRuns(doc, double ? 7.5 : 9),
    fill: '#111',
  })
  nodes.push({
    type: 'text',
    x: titleX,
    y: double ? 13.5 : 16,
    runs: [
      {
        text: `#${doc.sku} / Sizelabels ${sizeRangeCaption(table)}`,
        bold: false,
        fontSize: double ? 3.6 : 4.2,
      },
    ],
    fill: '#222',
  })

  table.rows.forEach((row, i) => {
    const slot = slots[i]
    nodes.push(
      ...sizeLabelPiece(doc, row, slot.x, slot.y, slot.w, slot.h, double, assets),
    )
  })

  // Sheet footer wordmark stays in brand color (as selected)
  const footerWordmark = assets.boxWordmarkHref || assets.wordmarkHref
  if (footerWordmark) {
    nodes.push({
      type: 'image',
      x: page.w - (double ? 48 : 55),
      y: page.h - (double ? 8 : 10),
      w: double ? 38 : 42,
      h: double ? 4.2 : 5,
      href: footerWordmark,
      fit: 'contain',
    })
  }

  return {
    kind: double ? 'size-double' : 'size-normal',
    unit: 'mm',
    width: page.w,
    height: page.h,
    nodes,
  }
}

export function buildBoxLabelScene(
  doc: LabelDocument,
  table: SizeChartTable,
  logoHrefs: string[],
  productHref: string | null,
  assets: SceneAssets = {},
): LabelScene {
  // Production sheet includes the 140×120 mm dimension callouts.
  const pageW = BOX_SHEET_MM.w
  const pageH = BOX_SHEET_MM.h
  const labelX = (pageW - BOX_LABEL.w) / 2
  const labelY = 21
  const marginX = 12
  const marginTop = 11.5
  const marginBottom = 6
  const blue = doc.brandColorHex
  const gridLine = '#d3d3d3'
  const capsuleStroke = '#c4c4c4'
  const nodes: SceneNode[] = [
    { type: 'rect', x: 0, y: 0, w: pageW, h: pageH, fill: '#fff' },
    {
      type: 'rect',
      x: labelX,
      y: labelY,
      w: BOX_LABEL.w,
      h: BOX_LABEL.h,
      fill: '#fff',
      stroke: '#222',
      strokeWidth: 0.3,
      radius: 4,
    },
  ]

  // Model caption and dimension brackets around the actual box label.
  nodes.push({
    type: 'text',
    x: 8,
    y: 7,
    runs: titleRuns(doc, 4.3),
    fill: '#111',
  })
  const topDimY = 14
  nodes.push(
    {
      type: 'line',
      x1: labelX,
      y1: topDimY,
      x2: labelX + BOX_LABEL.w,
      y2: topDimY,
      stroke: '#222',
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: labelX,
      y1: topDimY,
      x2: labelX,
      y2: labelY - 1,
      stroke: '#222',
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: labelX + BOX_LABEL.w,
      y1: topDimY,
      x2: labelX + BOX_LABEL.w,
      y2: labelY - 1,
      stroke: '#222',
      strokeWidth: 0.3,
    },
    {
      type: 'text',
      x: labelX + BOX_LABEL.w / 2,
      y: topDimY - 2,
      runs: [{ text: '140mm', bold: false, fontSize: 3.3 }],
      fill: '#222',
      anchor: 'middle',
    },
  )
  const leftDimX = labelX - 9
  nodes.push(
    {
      type: 'line',
      x1: leftDimX,
      y1: labelY,
      x2: leftDimX,
      y2: labelY + BOX_LABEL.h,
      stroke: '#222',
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: leftDimX,
      y1: labelY,
      x2: labelX - 2,
      y2: labelY,
      stroke: '#222',
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: leftDimX,
      y1: labelY + BOX_LABEL.h,
      x2: labelX - 2,
      y2: labelY + BOX_LABEL.h,
      stroke: '#222',
      strokeWidth: 0.3,
    },
    {
      type: 'text',
      x: leftDimX - 2,
      y: labelY + BOX_LABEL.h / 2 + 1,
      runs: [{ text: '120mm', bold: false, fontSize: 3.3 }],
      fill: '#222',
      anchor: 'end',
    },
  )

  const contentLeft = labelX + marginX
  const contentRight = labelX + BOX_LABEL.w - marginX
  const labelColW = 15
  const gridX = contentLeft + labelColW
  const gridW = contentRight - gridX
  const cols = Math.max(table.rows.length, 1)
  const colW = gridW / cols
  const rowH = 6.0
  const sizeRowY = labelY + marginTop + 2

  nodes.push({
    type: 'text',
    x: gridX - 1.5,
    y: sizeRowY + 1.2,
    runs: [{ text: 'SIZE', bold: true, fontSize: 4.2 }],
    fill: '#111',
    anchor: 'end',
  })

  for (let i = 0; i < cols; i++) {
    const cw = Math.max(colW - 2.6, 3.5)
    nodes.push({
      type: 'rect',
      x: gridX + i * colW + (colW - cw) / 2,
      y: sizeRowY - 1.1,
      w: cw,
      h: 4.0,
      stroke: capsuleStroke,
      strokeWidth: 0.25,
      radius: 2,
      fill: 'none',
    })
  }

  const systems = [
    { key: 'mondo' as const, label: 'MONDO' },
    { key: 'usM' as const, label: 'US M' },
    { key: 'usW' as const, label: 'US W' },
    { key: 'uk' as const, label: 'UK' },
    { key: 'eu' as const, label: 'EU' },
  ]
  const tableTop = labelY + marginTop + 7.5
  systems.forEach((sys, rowIdx) => {
    const rowTop = tableTop + rowIdx * rowH
    const rowMid = rowTop + rowH / 2
    if (rowIdx % 2 === 1) {
      nodes.push({
        type: 'rect',
        x: contentLeft,
        y: rowTop,
        w: contentRight - contentLeft,
        h: rowH,
        fill: '#e9e9e9',
      })
    }
    nodes.push({
      type: 'text',
      x: gridX - 1.5,
      y: rowMid + 1.3,
      runs: [{ text: sys.label, bold: true, fontSize: 3.35 }],
      fill: '#111',
      anchor: 'end',
    })
    // Divider after label column
    nodes.push({
      type: 'line',
      x1: gridX,
      y1: rowTop,
      x2: gridX,
      y2: rowTop + rowH,
      stroke: rowIdx % 2 === 1 ? '#fff' : gridLine,
      strokeWidth: rowIdx % 2 === 1 ? 0.3 : 0.16,
    })
    table.rows.forEach((row, i) => {
      if (i > 0) {
        nodes.push({
          type: 'line',
          x1: gridX + i * colW,
          y1: rowTop,
          x2: gridX + i * colW,
          y2: rowTop + rowH,
          stroke: rowIdx % 2 === 1 ? '#fff' : gridLine,
          strokeWidth: rowIdx % 2 === 1 ? 0.3 : 0.16,
        })
      }
      const fontSize = 3.1
      nodes.push({
        type: 'text',
        x: gridX + i * colW + colW / 2,
        y: rowMid + fontSize * 0.35,
        runs: [{ text: row[sys.key] || '', bold: false, fontSize }],
        fill: '#111',
        anchor: 'middle',
      })
    })
  })

  const brandTop = labelY + 61.5
  const wordmark = assets.boxWordmarkHref || assets.wordmarkHref
  const wmH = 8.2
  if (wordmark) {
    nodes.push({
      type: 'image',
      x: labelX + 12,
      y: brandTop,
      w: 66,
      h: wmH,
      href: wordmark,
      fit: 'contain',
    })
  }

  const titleSize = Math.min(doc.titleSizes.box, 4.2)
  const titleY = brandTop + wmH + 8.5
  nodes.push({
    type: 'text',
    x: labelX + 12,
    y: titleY,
    runs: titleRuns(doc, titleSize),
    fill: blue,
  })
  nodes.push({
    type: 'text',
    x: labelX + 12,
    y: titleY + titleSize + 1.5,
    runs: [{ text: doc.sku, bold: false, fontSize: 3.8 }],
    fill: blue,
  })

  // Badges are constrained by height, never by a shared width.
  const boxLogoH = 4.5
  const boxLogoY = titleY + titleSize + 6.3
  logoHrefs.slice(0, 4).forEach((href, i) => {
    nodes.push({
      type: 'image',
      x: labelX + 12 + i * (boxLogoH + 4),
      y: boxLogoY,
      w: boxLogoH * 1.7,
      h: boxLogoH,
      href,
      fit: 'contain',
    })
  })

  if (productHref) {
    nodes.push({
      type: 'image',
      x: labelX + 82,
      y: brandTop - 4,
      w: 49,
      h: 45,
      href: productHref,
      fit: 'contain',
    })
  }

  const l = doc.legal
  const footerBottom = labelY + BOX_LABEL.h - marginBottom
  const legalLineH = 4.3
  const legalLines = [
    { text: l.company, bold: true, fontSize: 3.0 },
    { text: l.address.replace(/,$/, ''), bold: false, fontSize: 2.8 },
    { text: `${l.phone} | ${l.fax}`, bold: false, fontSize: 2.8 },
    { text: `${l.web} | ${l.email}`, bold: false, fontSize: 2.8 },
  ]
  legalLines.forEach((line, i) => {
    nodes.push({
      type: 'text',
      x: labelX + 12,
      y: footerBottom - (legalLines.length - 1 - i) * legalLineH,
      runs: [{ text: line.text, bold: line.bold, fontSize: line.fontSize }],
      fill: blue,
    })
  })

  const regRight = labelX + BOX_LABEL.w - 10
  const iconW = 8
  const iconH = 6.5
  const iconX = labelX + 90
  const madeInY = footerBottom
  const iconY = madeInY - 9
  if (assets.classLogoHref) {
    nodes.push({
      type: 'image',
      x: iconX,
      y: iconY,
      w: iconW,
      h: iconH,
      href: assets.classLogoHref,
      fit: 'contain',
    })
  }
  nodes.push({
    type: 'text',
    x: iconX + iconW / 2,
    y: madeInY,
    runs: [{ text: l.madeIn.toUpperCase(), bold: false, fontSize: 2.3 }],
    fill: '#444',
    anchor: 'middle',
  })
  nodes.push({
    type: 'text',
    x: regRight,
    y: iconY + 2.2,
    runs: [{ text: l.standard, bold: false, fontSize: 2.55 }],
    fill: '#222',
    anchor: 'end',
  })
  nodes.push({
    type: 'text',
    x: regRight,
    y: iconY + 6.2,
    runs: [{ text: `${l.classText}:`, bold: true, fontSize: 2.55 }],
    fill: '#222',
    anchor: 'end',
  })
  nodes.push({
    type: 'text',
    x: regRight,
    y: iconY + 10.2,
    runs: [{ text: l.weightRange, bold: false, fontSize: 2.45 }],
    fill: '#222',
    anchor: 'end',
  })

  return {
    kind: 'box',
    unit: 'mm',
    width: pageW,
    height: pageH,
    nodes,
  }
}

export function buildSizeChartScene(
  doc: LabelDocument,
  table: SizeChartTable,
  logoHrefs: string[],
): LabelScene {
  const { w, h } = SIZE_CHART_PX
  const nodes: SceneNode[] = [
    { type: 'rect', x: 0, y: 0, w, h, fill: '#ffffff' },
  ]

  const logos = logoHrefs.filter(Boolean).slice(0, 3)
  const logoSize = 70
  const logoGap = 18
  const logoStartX = 40
  const logoY = 36
  logos.forEach((href, i) => {
    nodes.push({
      type: 'image',
      x: logoStartX + i * (logoSize + logoGap),
      y: logoY,
      w: logoSize,
      h: logoSize,
      href,
      fit: 'contain',
    })
  })

  const titleX =
    logos.length > 0
      ? logoStartX + logos.length * (logoSize + logoGap) + 8
      : logoStartX

  nodes.push({
    type: 'text',
    x: titleX,
    y: 82,
    runs: titleRuns(doc, doc.titleSizes.sizeChart),
    fill: '#111',
  })

  const systems = [
    { key: 'mondo' as const, label: 'MONDO' },
    { key: 'usM' as const, label: 'US M' },
    { key: 'usW' as const, label: 'US W' },
    { key: 'uk' as const, label: 'UK' },
    { key: 'eu' as const, label: 'EU' },
  ]
  const tableX = 40
  const tableY = 140
  const tableW = w - 80
  const rowH = 72
  const labelW = 140
  const colW = (tableW - labelW) / Math.max(table.rows.length, 1)

  systems.forEach((sys, rowIdx) => {
    const yy = tableY + rowIdx * rowH
    if (rowIdx % 2 === 1) {
      nodes.push({
        type: 'rect',
        x: tableX + labelW,
        y: yy,
        w: tableW - labelW,
        h: rowH,
        fill: '#ececec',
      })
    }
    nodes.push({
      type: 'line',
      x1: tableX + labelW,
      y1: yy,
      x2: tableX + labelW,
      y2: yy + rowH,
      stroke: '#ccc',
      strokeWidth: 1,
    })
    nodes.push({
      type: 'text',
      x: tableX + 10,
      y: yy + rowH / 2 + 8,
      runs: [{ text: sys.label, bold: true, fontSize: 26 }],
      fill: '#111',
    })
    table.rows.forEach((row, i) => {
      const cx = tableX + labelW + i * colW + colW / 2
      nodes.push({
        type: 'line',
        x1: tableX + labelW + i * colW,
        y1: yy,
        x2: tableX + labelW + i * colW,
        y2: yy + rowH,
        stroke: '#ddd',
        strokeWidth: 1,
      })
      nodes.push({
        type: 'text',
        x: cx,
        y: yy + rowH / 2 + 8,
        runs: [{ text: row[sys.key] || '', bold: false, fontSize: 24 }],
        fill: '#111',
        anchor: 'middle',
      })
    })
  })

  nodes.push({
    type: 'text',
    x: 40,
    y: h - 36,
    runs: [
      {
        text: doc.sizeChartFootnote || plainText(doc.title),
        bold: false,
        fontSize: 20,
      },
    ],
    fill: '#222',
  })

  return {
    kind: 'sizechart',
    unit: 'px',
    width: w,
    height: h,
    nodes,
  }
}
