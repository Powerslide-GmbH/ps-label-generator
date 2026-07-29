import type { LabelDocument, SizeChartTable, SizeRow, TextRun } from '@/domain/types'
import {
  SIZE_DOUBLE_SHEET_MM,
  SIZE_NORMAL_SHEET_MM,
} from '@/domain/types'
import { SIZE_SYSTEM_TO_KEY } from '@/domain/boxConfig'
import {
  headersForRow,
  systemsForBoxTable,
  valuesForRow,
} from '@/domain/sizechart'
import { plainText } from '@/domain/richText'
import { packLabels } from '@/domain/packing'
import { buildResponsiveBoxLabelScene } from './boxScene'

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
  alignX?: 'left' | 'center' | 'right'
  alignY?: 'top' | 'center' | 'bottom'
}

export type SceneNode = SceneText | SceneRect | SceneLine | SceneImage

export type LabelScene = {
  kind: 'size-normal' | 'size-double' | 'box' | 'sizechart'
  unit: 'mm' | 'px'
  width: number
  height: number
  nodes: SceneNode[]
  overflow?: { block: string; message: string }[]
  layoutStrategy?: string
  tableWarning?: string
}

export type SceneAssets = {
  /** Colored brand wordmark (box + size-sheet footer). */
  wordmarkHref?: string
  boxWordmarkHref?: string
  /** Natural width / height of the selected box wordmark. */
  boxWordmarkAspectRatio?: number
  /** Black wordmark for individual size-label pieces. */
  sizeWordmarkHref?: string
  /** Page header PS badge (size-label sheets). */
  pageLogoHref?: string
  /** Natural width / height of the page logo, used to reserve its real header width. */
  pageLogoAspectRatio?: number
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

function wrapTextRuns(runs: TextRun[], fontSize: number, maxWidth: number): TextRun[][] {
  const lines: TextRun[][] = [[]]
  let lineWidth = 0
  let pendingSpace: TextRun | null = null

  const estimatedWidth = (text: string, bold?: boolean) =>
    [...text].reduce(
      (width, char) =>
        width + fontSize * (/\s/.test(char) ? 0.3 : bold ? 0.62 : 0.53),
      0,
    )

  const append = (line: TextRun[], run: TextRun) => {
    const previous = line[line.length - 1]
    if (previous && previous.bold === run.bold && previous.fontSize === run.fontSize) {
      previous.text += run.text
    } else {
      line.push({ ...run })
    }
  }

  for (const run of runs) {
    for (const token of run.text.split(/(\n|[ \t]+)/).filter(Boolean)) {
      if (token === '\n') {
        lines.push([])
        lineWidth = 0
        pendingSpace = null
        continue
      }
      if (/^[ \t]+$/.test(token)) {
        pendingSpace = { text: ' ', bold: run.bold, fontSize }
        continue
      }

      const line = lines[lines.length - 1]
      const word: TextRun = { text: token, bold: run.bold, fontSize }
      const spaceWidth = line.length && pendingSpace
        ? estimatedWidth(pendingSpace.text, pendingSpace.bold)
        : 0
      const wordWidth = estimatedWidth(word.text, word.bold)

      if (line.length && lineWidth + spaceWidth + wordWidth > maxWidth) {
        lines.push([])
        lineWidth = 0
      } else if (line.length && pendingSpace) {
        append(line, pendingSpace)
        lineWidth += spaceWidth
      }

      append(lines[lines.length - 1], word)
      lineWidth += wordWidth
      pendingSpace = null
    }
  }

  return lines.filter((line) => line.length)
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
    const fitCellFont = (
      text: string,
      requested: number,
      availableWidth: number,
      minimum: number,
    ) => {
      const estimatedEm = [...text].reduce(
        (width, char) => width + (/\s/.test(char) ? 0.3 : /[1Iil]/.test(char) ? 0.34 : 0.61),
        0,
      )
      if (estimatedEm <= 0) return requested
      return Math.max(minimum, Math.min(requested, availableWidth / estimatedEm))
    }
    const headerText = opts.headers[i] ?? ''
    const valueText = opts.values[i] ?? ''
    const headerFont = fitCellFont(headerText, opts.headerFont, colW - 0.45, 0.9)
    const valueFont = fitCellFont(valueText, opts.valueFont, colW - 0.6, 1.25)
    const headerBaseline =
      opts.y + opts.headerH / 2 + headerFont * 0.35
    const valueBaseline =
      opts.y + opts.headerH + opts.valueH / 2 + valueFont * 0.35
    nodes.push({
      type: 'text',
      x: cx,
      y: headerBaseline,
      runs: [{ text: headerText, bold: true, fontSize: headerFont }],
      fill: '#fff',
      anchor: 'middle',
    })
    nodes.push({
      type: 'text',
      x: cx,
      y: valueBaseline,
      runs: [{ text: valueText, bold: true, fontSize: valueFont }],
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
  const padY = 0.4
  const nodes: SceneNode[] = [
    { type: 'rect', x, y, w, h, fill: '#fff', stroke: '#000', strokeWidth: 0.15 },
  ]

  const pieceWordmark = assets.sizeWordmarkHref || assets.wordmarkHref
  const wordmarkScale = doc.logoScales.brandWordmark
  const wmW = 10 * wordmarkScale
  const wmH = 3.2 * wordmarkScale
  if (pieceWordmark) {
    nodes.push({
      type: 'image',
      x: leftX + brandPad,
      y: y + padY,
      w: wmW,
      h: wmH,
      href: pieceWordmark,
      fit: 'contain',
      alignX: 'left',
    })
  }

  const titleX = pieceWordmark
    ? leftX + brandPad + wmW + 0.6
    : leftX + brandPad
  const titleWidth = leftX + leftW - contentPad - titleX
  const titleSize = doc.titleSizes.sizeLabelDouble
  const titleY = y + padY + 2.25
  const titleLineHeight = titleSize * 0.95
  const titleLines = wrapTextRuns(titleRuns(doc, titleSize), titleSize, titleWidth)
  titleLines.forEach((runs, lineIndex) => {
    nodes.push({
      type: 'text',
      x: titleX,
      y: titleY + lineIndex * titleLineHeight,
      runs,
      fill: '#000',
    })
  })
  const titleLastY = titleY + Math.max(titleLines.length - 1, 0) * titleLineHeight
  const skuY = Math.max(y + 5.8, titleLastY + titleSize * 0.52)
  nodes.push({
    type: 'text',
    x: leftX + brandPad,
    y: skuY,
    runs: [{ text: `#${doc.sku}`, bold: false, fontSize: 1.8 }],
    fill: '#000',
  })

  const tableX = leftX + contentPad
  const tableW = leftW - contentPad * 2
  const tableY = Math.min(y + 11.8, Math.max(y + 8.4, skuY + 0.7))
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
        x: foldX,
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
  const titleSize = doc.titleSizes.sizeLabel
  const pad = 1.5
  const brandPad = 2.5
  const contentW = w - pad * 2
  const nodes: SceneNode[] = [
    { type: 'rect', x, y, w, h, fill: '#fff', stroke: '#000', strokeWidth: 0.15 },
  ]

  const pieceWordmark = assets.sizeWordmarkHref || assets.wordmarkHref
  const wordmarkScale = doc.logoScales.brandWordmark
  const wmH = 2.1 * wordmarkScale
  const wmW = 20.8 * wordmarkScale
  if (pieceWordmark) {
    nodes.push({
      type: 'image',
      x: x + brandPad,
      y: y + 1.6,
      w: wmW,
      h: wmH,
      href: pieceWordmark,
      fit: 'contain',
      alignX: 'left',
    })
  }

  const titleY = pieceWordmark ? y + 1.6 + wmH + 3 : y + 4.6
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

  const tableY = Math.max(y + 8.0, titleY + 0.9)
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
  const footerY = y + 23.3
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
  const pageBadgeScale = doc.logoScales.pageBadge
  const pageLogoY = double ? 4 : 5
  const pageLogoH = (double ? 10 : 12) * pageBadgeScale
  const headerH = Math.max(
    double ? 18 : 22,
    assets.pageLogoHref ? pageLogoY + pageLogoH + 2 : 0,
  )
  const footerH = double ? 12 : 14
  const sheet = double ? SIZE_DOUBLE_SHEET_MM : SIZE_NORMAL_SHEET_MM
  const { page, slots } = packLabels(table.rows.length, label.w, label.h, {
    gap: double ? 1.5 : 2,
    marginTop: headerH,
    marginBottom: footerH,
    marginX: double ? 10 : 8,
    maxColumns: double
      ? doc.sizeLabelSheet.doubleColumns
      : doc.sizeLabelSheet.normalColumns,
    minPage: sheet,
  })
  const nodes: SceneNode[] = [
    { type: 'rect', x: 0, y: 0, w: page.w, h: page.h, fill: '#ffffff' },
  ]

  // Page chrome — matches documentation sheets
  const pageLogoX = double ? 8 : 10
  const pageLogoMaxW = (double ? 34 : 42) * pageBadgeScale
  const pageLogoAspect = Math.max(assets.pageLogoAspectRatio ?? 1, 0.25)
  const pageLogoW = Math.min(pageLogoH * pageLogoAspect, pageLogoMaxW)
  if (assets.pageLogoHref) {
    nodes.push({
      type: 'image',
      x: pageLogoX,
      y: pageLogoY,
      w: pageLogoW,
      h: pageLogoH,
      href: assets.pageLogoHref,
      fit: 'contain',
      alignX: 'left',
    })
  }
  const titleX = assets.pageLogoHref
    ? pageLogoX + pageLogoW + (double ? 3 : 4)
    : pageLogoX
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
    const footerScale = doc.logoScales.brandWordmark
    const footerW = (double ? 38 : 42) * footerScale
    const footerH = (double ? 4.2 : 5) * footerScale
    const footerRight = double ? 10 : 13
    const footerBottom = double ? 3.8 : 5
    nodes.push({
      type: 'image',
      x: page.w - footerRight - footerW,
      y: page.h - footerBottom - footerH,
      w: footerW,
      h: footerH,
      href: footerWordmark,
      fit: 'contain',
      alignX: 'right',
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
  logos: Array<string | { href: string; aspectRatio?: number }>,
  productHref: string | null,
  assets: SceneAssets & { productHrefs?: (string | null)[] } = {},
): LabelScene {
  return buildResponsiveBoxLabelScene(doc, table, logos, productHref, assets)
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
  const logoScale = doc.logoScales.sizeChartLogos
  const logoW = 82 * logoScale
  const logoH = 54 * logoScale
  const logoGap = 14
  const logoY = 28
  logos.forEach((href, i) => {
    nodes.push({
      type: 'image',
      x: 40 + i * (logoW + logoGap),
      y: logoY,
      w: logoW,
      h: logoH,
      href,
      fit: 'contain',
    })
  })

  const titleX = logos.length ? 40 + logos.length * (logoW + logoGap) + 18 : 40
  nodes.push({
    type: 'text',
    x: titleX,
    y: 66,
    runs: titleRuns(doc, Math.min(doc.titleSizes.sizeChart, 40)),
    fill: '#111111',
  })

  const systems = systemsForBoxTable(table, doc.enabledSizeSystems)
  const tableX = 40
  const tableY = 112
  const tableW = w - 80
  const rowH = Math.min(68, (h - tableY - 72) / Math.max(systems.length, 1))
  const labelW = 142
  const colW = (tableW - labelW) / Math.max(table.rows.length, 1)
  const tableH = rowH * systems.length
  const valueFontSize = Math.max(15, Math.min(24, colW * 0.43))

  nodes.push({
    type: 'rect',
    x: tableX,
    y: tableY,
    w: tableW,
    h: tableH,
    fill: '#ffffff',
    stroke: '#bdbdbd',
    strokeWidth: 1.5,
  })

  systems.forEach((sys, rowIdx) => {
    const key = SIZE_SYSTEM_TO_KEY[sys]
    const yy = tableY + rowIdx * rowH
    if (rowIdx % 2 === 1) {
      nodes.push({
        type: 'rect',
        x: tableX,
        y: yy,
        w: tableW,
        h: rowH,
        fill: '#eeeeee',
      })
    }
    nodes.push({
      type: 'line',
      x1: tableX + labelW,
      y1: yy,
      x2: tableX + labelW,
      y2: yy + rowH,
      stroke: '#c8c8c8',
      strokeWidth: 1,
    })
    nodes.push({
      type: 'text',
      x: tableX + 22,
      y: yy + rowH / 2 + 8,
      runs: [{ text: sys, bold: true, fontSize: 22 }],
      fill: '#111111',
    })
    table.rows.forEach((row, i) => {
      const cx = tableX + labelW + i * colW + colW / 2
      if (i > 0) {
        nodes.push({
          type: 'line',
          x1: tableX + labelW + i * colW,
          y1: yy + 12,
          x2: tableX + labelW + i * colW,
          y2: yy + rowH - 12,
          stroke: '#d5d5d5',
          strokeWidth: 1,
        })
      }
      nodes.push({
        type: 'text',
        x: cx,
        y: yy + rowH / 2 + 8,
        runs: [
          {
            text: row[key] || '-',
            bold: false,
            fontSize: valueFontSize,
          },
        ],
        fill: '#222222',
        anchor: 'middle',
      })
    })
  })

  const footerY = Math.min(h - 24, tableY + tableH + 34)
  nodes.push({
    type: 'text',
    x: 40,
    y: footerY,
    runs: [
      {
        text: doc.sizeChartFootnote || plainText(doc.title),
        bold: false,
        fontSize: 15,
      },
    ],
    fill: '#333333',
  })
  nodes.push({
    type: 'text',
    x: w - 40,
    y: footerY,
    runs: [{ text: table.name, bold: false, fontSize: 14 }],
    fill: '#666666',
    anchor: 'end',
  })

  return {
    kind: 'sizechart',
    unit: 'px',
    width: w,
    height: h,
    nodes,
  }
}
