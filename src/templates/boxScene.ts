import type {
  BoxProductSlot,
  LabelDocument,
  LayoutOverflow,
  LegalDisplayOptions,
  LegalProfile,
  SizeChartTable,
  SizeRow,
  SizeSystem,
  TextRun,
} from '@/domain/types'
import {
  boxSheetMm,
  clampBoxDimensions,
  decideTableFlow,
  SIZE_SYSTEM_TO_KEY,
} from '@/domain/boxConfig'
import { systemsForBoxTable } from '@/domain/sizechart'
import { plainText } from '@/domain/richText'
import type { LabelScene, SceneAssets, SceneNode } from './scenes'

export type BoxLayoutStrategy =
  | 'single-standard'
  | 'single-split-table'
  | 'dual-wide-table'
  | 'dual-compact-junior'
  | 'dual-side-by-side-junior'

export type BoxLayoutMeta = {
  strategy: BoxLayoutStrategy
  overflow: LayoutOverflow[]
  tableWarning?: string
  labelMm: { width: number; height: number }
  sheetMm: { width: number; height: number }
}

/** Last layout diagnostics from `buildResponsiveBoxLabelScene` (for UI / tests). */
export let lastBoxLayoutMeta: BoxLayoutMeta | null = null

type LogoEntry = string | { href: string; aspectRatio?: number }

type BoxSceneAssets = SceneAssets & { productHrefs?: (string | null)[] }

const GRID_LINE = '#d3d3d3'
const CAPSULE_STROKE = '#c4c4c4'
const PURE_K = '#111'
const REG_DARK = '#222'
const REG_MUTED = '#444'

function estimateTextWidth(text: string, fontSize: number, bold?: boolean): number {
  return [...text].reduce(
    (width, char) =>
      width + fontSize * (/\s/.test(char) ? 0.3 : bold ? 0.62 : 0.53),
    0,
  )
}

function runsWidth(runs: TextRun[]): number {
  return runs.reduce(
    (w, r) => w + estimateTextWidth(r.text, r.fontSize ?? 3, r.bold),
    0,
  )
}

function slotTitleRuns(slot: BoxProductSlot, fontSize: number): TextRun[] {
  return slot.title.map((r) => ({
    text: r.text,
    bold: r.bold !== false,
    fontSize,
  }))
}

function primaryCaptionRuns(doc: LabelDocument, fontSize: number): TextRun[] {
  const slot = doc.boxProducts[0]
  const source = slot?.title?.length ? slot.title : doc.title
  return source.map((r) => ({
    text: r.text,
    bold: r.bold !== false,
    fontSize,
  }))
}

function wrapTextRuns(runs: TextRun[], fontSize: number, maxWidth: number): TextRun[][] {
  const lines: TextRun[][] = [[]]
  let lineWidth = 0
  let pendingSpace: TextRun | null = null

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
      const spaceWidth =
        line.length && pendingSpace
          ? estimateTextWidth(pendingSpace.text, fontSize, pendingSpace.bold)
          : 0
      const wordWidth = estimateTextWidth(word.text, fontSize, word.bold)

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

function resolveLogos(logos: LogoEntry[]): Array<{ href: string; aspectRatio: number }> {
  const out: Array<{ href: string; aspectRatio: number }> = []
  for (const entry of logos.slice(0, 6)) {
    const href = typeof entry === 'string' ? entry : entry.href
    if (!href) continue
    const aspect =
      typeof entry === 'string' ? 1 : Math.max(entry.aspectRatio ?? 1, 0.4)
    out.push({ href, aspectRatio: aspect })
  }
  return out
}

function drawLogoRow(
  nodes: SceneNode[],
  logos: Array<{ href: string; aspectRatio: number }>,
  x: number,
  y: number,
  heightMm: number,
  gap = 0.5,
  maxWidth?: number,
): number {
  let cursor = x
  for (const logo of logos) {
    const w = logo.aspectRatio * heightMm
    if (maxWidth != null && cursor + w > x + maxWidth) break
    nodes.push({
      type: 'image',
      x: cursor,
      y,
      w,
      h: heightMm,
      href: logo.href,
      fit: 'contain',
    })
    cursor += w + gap
  }
  return Math.max(0, cursor - x - gap)
}

function companyLines(
  legal: LegalProfile,
  display: LegalDisplayOptions,
  compact = false,
): Array<{ text: string; bold: boolean; fontSize: number }> {
  const lines: Array<{ text: string; bold: boolean; fontSize: number }> = []
  const companyFs = compact ? 2.55 : 3.0
  const detailFs = compact ? 2.35 : 2.8
  if (display.showCompany && legal.company.trim()) {
    lines.push({ text: legal.company, bold: true, fontSize: companyFs })
  }
  if (display.showPostalAddress && legal.address.trim()) {
    lines.push({
      text: legal.address.replace(/,$/, ''),
      bold: false,
      fontSize: detailFs,
    })
  }
  if (display.showPhoneFax && (legal.phone.trim() || legal.fax.trim())) {
    const parts = [legal.phone, legal.fax].filter((p) => p.trim())
    lines.push({ text: parts.join(' | '), bold: false, fontSize: detailFs })
  }
  if (display.showWebEmail && (legal.web.trim() || legal.email.trim())) {
    const parts = [legal.web, legal.email].filter((p) => p.trim())
    lines.push({ text: parts.join(' | '), bold: false, fontSize: detailFs })
  }
  return lines
}

function classLines(
  legal: LegalProfile,
  display: LegalDisplayOptions,
  compact = false,
): Array<{ text: string; bold: boolean; fontSize: number }> {
  const lines: Array<{ text: string; bold: boolean; fontSize: number }> = []
  const fs = compact ? 2.2 : 2.45
  if (display.showStandard && legal.standard.trim()) {
    lines.push({ text: legal.standard, bold: false, fontSize: fs })
  }
  if (display.showClass && legal.classText.trim()) {
    lines.push({ text: `${legal.classText}:`, bold: true, fontSize: fs })
  }
  if (display.showWeight && legal.weightRange.trim()) {
    lines.push({ text: legal.weightRange, bold: false, fontSize: compact ? 2.1 : 2.35 })
  }
  return lines
}

function estimateFooterHeight(
  display: LegalDisplayOptions,
  legal: LegalProfile,
  hasClassLogo: boolean,
  compact = false,
): number {
  const company = companyLines(legal, display, compact)
  const regulatory = classLines(legal, display, compact)
  const legalLineH = compact ? 3.35 : 4.3
  const classLineH = compact ? 2.35 : 2.85
  const companyH = company.length ? company.length * legalLineH : 0
  const classH = regulatory.length ? regulatory.length * classLineH : 0
  const madeInH = display.showMadeIn && legal.madeIn.trim() ? 2.8 : 0
  const iconH = hasClassLogo && (regulatory.length || madeInH) ? 6.5 + 2.2 : 0
  const rightStack = Math.max(classH, iconH + madeInH)
  // Minimal footer (logos + MADE IN only) is a single short band.
  if (!company.length && !regulatory.length) {
    return Math.max(madeInH ? 9 : 0, 7) + 1
  }
  return Math.max(companyH, rightStack, madeInH ? 8 : 0) + 1.5
}

type TableDensity = 'normal' | 'compact' | 'dense'

type TableDrawOpts = {
  x: number
  y: number
  width: number
  rows: SizeRow[]
  systems: SizeSystem[]
  compact?: boolean
  density?: TableDensity
}

function resolveTableDensity(
  compact: boolean,
  density?: TableDensity,
): TableDensity {
  if (density) return density
  return compact ? 'compact' : 'normal'
}

function tableMetrics(density: TableDensity) {
  if (density === 'dense') {
    return {
      labelColW: 11.5,
      sizeRowH: 4.2,
      rowH: 4.35,
      labelFs: 2.7,
      sysFs: 2.55,
      valFs: 2.35,
      sizePad: 2.5,
      capsuleH: 3.6,
      capsuleInset: 0.8,
    }
  }
  if (density === 'compact') {
    return {
      labelColW: 13.5,
      sizeRowH: 5.2,
      rowH: 5.4,
      labelFs: 3.1,
      sysFs: 3.0,
      valFs: 2.85,
      sizePad: 3.2,
      capsuleH: 4.3,
      capsuleInset: 1.0,
    }
  }
  return {
    labelColW: 15,
    sizeRowH: 6.2,
    rowH: 6.3,
    labelFs: 3.5,
    sysFs: 3.35,
    valFs: 3.1,
    sizePad: 3.6,
    capsuleH: 4.8,
    capsuleInset: 1.2,
  }
}

function tableBlockHeight(systemCount: number, density: TableDensity): number {
  const m = tableMetrics(density)
  return m.sizeRowH + systemCount * m.rowH
}

function drawBoxSizeTable(nodes: SceneNode[], opts: TableDrawOpts): number {
  const { x, y, width, rows, systems } = opts
  const density = resolveTableDensity(Boolean(opts.compact), opts.density)
  const m = tableMetrics(density)
  const { labelColW, sizeRowH, rowH, labelFs, sysFs, valFs } = m
  const gridX = x + labelColW
  const gridW = Math.max(width - labelColW, 8)
  const cols = Math.max(rows.length, 1)
  const colW = gridW / cols
  const sizeRowY = y + m.sizePad
  nodes.push({
    type: 'text',
    x: gridX - 1.5,
    y: sizeRowY + 1.2,
    runs: [{ text: 'SIZE', bold: true, fontSize: labelFs }],
    fill: PURE_K,
    anchor: 'end',
  })

  for (let i = 0; i < cols; i++) {
    const cw = Math.max(colW - m.capsuleInset, density === 'dense' ? 2.6 : 3.2)
    nodes.push({
      type: 'rect',
      x: gridX + i * colW + (colW - cw) / 2,
      y: sizeRowY - (density === 'dense' ? 1.5 : 2.1),
      w: cw,
      h: m.capsuleH,
      stroke: CAPSULE_STROKE,
      strokeWidth: 0.25,
      radius: 2,
      fill: 'none',
    })
  }

  const tableTop = y + sizeRowH
  systems.forEach((sys, rowIdx) => {
    const key = SIZE_SYSTEM_TO_KEY[sys]
    const rowTop = tableTop + rowIdx * rowH
    const rowMid = rowTop + rowH / 2
    const tintRow = rowIdx % 2 === 1
    if (tintRow) {
      nodes.push({
        type: 'rect',
        x,
        y: rowTop,
        w: width,
        h: rowH,
        fill: '#e9e9e9',
      })
    }
    nodes.push({
      type: 'text',
      x: gridX - 1.5,
      y: rowMid + sysFs * 0.35,
      runs: [{ text: sys, bold: true, fontSize: sysFs }],
      fill: PURE_K,
      anchor: 'end',
    })
    nodes.push({
      type: 'line',
      x1: gridX,
      y1: rowTop,
      x2: gridX,
      y2: rowTop + rowH,
      stroke: tintRow ? '#fff' : GRID_LINE,
      strokeWidth: tintRow ? 0.3 : 0.16,
    })
    rows.forEach((row, i) => {
      if (i > 0) {
        nodes.push({
          type: 'line',
          x1: gridX + i * colW,
          y1: rowTop,
          x2: gridX + i * colW,
          y2: rowTop + rowH,
          stroke: tintRow ? '#fff' : GRID_LINE,
          strokeWidth: tintRow ? 0.3 : 0.16,
        })
      }
      nodes.push({
        type: 'text',
        x: gridX + i * colW + colW / 2,
        y: rowMid + valFs * 0.35,
        runs: [{ text: (row[key] ?? '').toString(), bold: false, fontSize: valFs }],
        fill: PURE_K,
        anchor: 'middle',
      })
    })
  })

  return tableBlockHeight(systems.length, density)
}

function drawDimensionCallouts(
  nodes: SceneNode[],
  labelX: number,
  labelY: number,
  labelW: number,
  labelH: number,
): void {
  const topDimY = Math.max(12, labelY - 7)
  const wLabel = `${formatMm(labelW)}mm`
  const hLabel = `${formatMm(labelH)}mm`

  nodes.push(
    {
      type: 'line',
      x1: labelX,
      y1: topDimY,
      x2: labelX + labelW,
      y2: topDimY,
      stroke: REG_DARK,
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: labelX,
      y1: topDimY,
      x2: labelX,
      y2: labelY - 1,
      stroke: REG_DARK,
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: labelX + labelW,
      y1: topDimY,
      x2: labelX + labelW,
      y2: labelY - 1,
      stroke: REG_DARK,
      strokeWidth: 0.3,
    },
    {
      type: 'text',
      x: labelX + labelW / 2,
      y: topDimY - 2,
      runs: [{ text: wLabel, bold: false, fontSize: 3.3 }],
      fill: REG_DARK,
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
      y2: labelY + labelH,
      stroke: REG_DARK,
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: leftDimX,
      y1: labelY,
      x2: labelX - 2,
      y2: labelY,
      stroke: REG_DARK,
      strokeWidth: 0.3,
    },
    {
      type: 'line',
      x1: leftDimX,
      y1: labelY + labelH,
      x2: labelX - 2,
      y2: labelY + labelH,
      stroke: REG_DARK,
      strokeWidth: 0.3,
    },
    {
      type: 'text',
      x: leftDimX - 2,
      y: labelY + labelH / 2 + 1,
      runs: [{ text: hLabel, bold: false, fontSize: 3.3 }],
      fill: REG_DARK,
      anchor: 'end',
    },
  )
}

function formatMm(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function pickStrategy(
  dual: boolean,
  split: boolean,
  junior: boolean,
  rowCount: number,
): BoxLayoutStrategy {
  if (dual) {
    // Short dual-product ranges benefit from the same left-brand/right-table
    // composition as Triple X. The rule is driven by the content and available
    // canvas, not by the preset that happened to create the document.
    if (rowCount <= 4) {
      return 'dual-side-by-side-junior'
    }
    return junior ? 'dual-compact-junior' : 'dual-wide-table'
  }
  return split ? 'single-split-table' : 'single-standard'
}

function drawFooter(
  nodes: SceneNode[],
  args: {
    labelX: number
    labelY: number
    labelW: number
    labelH: number
    marginX: number
    marginBottom: number
    legal: LegalProfile
    display: LegalDisplayOptions
    companyFill: string
    classLogoHref?: string
    footerLogos?: Array<{ href: string; aspectRatio: number }>
    footerLogoH?: number
    compact?: boolean
    dual?: boolean
  },
): { top: number; height: number } {
  const {
    labelX,
    labelY,
    labelW,
    labelH,
    marginX,
    marginBottom,
    legal,
    display,
    companyFill,
    classLogoHref,
    footerLogos = [],
    footerLogoH = 5,
    compact = false,
    dual = false,
  } = args
  const footerBottom = labelY + labelH - marginBottom
  const leftX = labelX + marginX
  const regRight = labelX + labelW - Math.max(8, marginX - 2)
  const legalLineH = compact ? 3.35 : 4.3
  const classLineH = compact ? 2.35 : 2.85
  const company = companyLines(legal, display, compact)
  const regulatory = classLines(legal, display, compact)

  const footerLogoGap = compact ? 1.2 : 1.6
  const footerLogoWidth = footerLogos.reduce(
    (width, logo, index) =>
      width + logo.aspectRatio * footerLogoH + (index ? footerLogoGap : 0),
    0,
  )
  const logosAboveRegulatory =
    dual && footerLogos.length > 0 && regulatory.length >= 2
  let footerLogoY: number | null = null
  let drawnFooterLogoWidth = 0
  if (footerLogos.length) {
    footerLogoY = logosAboveRegulatory
      ? footerBottom -
        regulatory.length * classLineH -
        footerLogoH -
        (compact ? 2.4 : 3)
      : company.length
        ? footerBottom -
          company.length * legalLineH -
          footerLogoH -
          (compact ? 1.4 : 1.8)
        : footerBottom - footerLogoH
    const footerLogoX = logosAboveRegulatory
      ? regRight - Math.min(footerLogoWidth, labelW * 0.38)
      : leftX
    drawnFooterLogoWidth = drawLogoRow(
      nodes,
      footerLogos,
      footerLogoX,
      footerLogoY,
      footerLogoH,
      footerLogoGap,
      logosAboveRegulatory ? labelW * 0.38 : labelW * 0.46,
    )
  }

  company.forEach((line, i) => {
    nodes.push({
      type: 'text',
      x: leftX,
      y: footerBottom - (company.length - 1 - i) * legalLineH,
      runs: [{ text: line.text, bold: line.bold, fontSize: line.fontSize }],
      fill: companyFill,
    })
  })

  const madeInY = footerBottom
  const classBottom = madeInY
  regulatory.forEach((line, i) => {
    nodes.push({
      type: 'text',
      x: regRight,
      y: classBottom - (regulatory.length - 1 - i) * classLineH,
      runs: [{ text: line.text, bold: line.bold, fontSize: line.fontSize }],
      fill: PURE_K,
      anchor: 'end',
    })
  })

  const iconW = compact ? 7 : 8
  const iconH = compact ? 5.6 : 6.5
  const showMadeIn = display.showMadeIn && Boolean(legal.madeIn.trim())
  const madeInOnly = showMadeIn && company.length === 0 && regulatory.length === 0
  const horizontalMadeIn =
    madeInOnly && footerLogos.length > 0 && labelW >= 105
  // ACCEL-style: MADE IN alone sits bottom-right; PDS with logos sits after logo row.
  const iconX = madeInOnly
    ? footerLogos.length
      ? leftX +
        drawnFooterLogoWidth +
        (compact ? 4 : 5)
      : labelX + labelW - Math.max(marginX, 8) - iconW
    : labelX + labelW * 0.58
  const iconY = horizontalMadeIn
    ? footerBottom - iconH
    : madeInY - iconH - (compact ? 1.6 : 2.2)
  if (classLogoHref && (regulatory.length || showMadeIn)) {
    nodes.push({
      type: 'image',
      x: iconX,
      y: iconY,
      w: iconW,
      h: iconH,
      href: classLogoHref,
      fit: 'contain',
    })
  }
  if (showMadeIn) {
    const madeInX = horizontalMadeIn
      ? iconX + iconW + (compact ? 3.5 : 4)
      : iconX + iconW / 2
    nodes.push({
      type: 'text',
      x: madeInX,
      y: horizontalMadeIn
        ? iconY + iconH / 2 + (compact ? 0.65 : 0.75)
        : madeInY,
      runs: [{ text: legal.madeIn.toUpperCase(), bold: false, fontSize: compact ? 1.65 : 1.85 }],
      fill: REG_MUTED,
      anchor: horizontalMadeIn ? undefined : 'middle',
    })
  }

  const baseFooterHeight = horizontalMadeIn
    ? Math.max(footerLogoH, iconH) + (compact ? 1.6 : 2)
    : estimateFooterHeight(
        display,
        legal,
        Boolean(classLogoHref),
        compact,
      )
  const regulatoryLogoStackH =
    regulatory.length * classLineH +
    footerLogoH +
    (compact ? 2.4 : 3) +
    1.5
  const logoExtra = logosAboveRegulatory
    ? Math.max(0, regulatoryLogoStackH - baseFooterHeight)
    : footerLogos.length && company.length
      ? footerLogoH + 1.5
      : 0
  const height = baseFooterHeight + logoExtra
  return { top: footerBottom - height + marginBottom * 0.2, height }
}

function productHrefFor(
  index: number,
  productHref: string | null,
  assets: BoxSceneAssets,
  slotPath?: string | null,
): string | null {
  const list = assets.productHrefs
  if (list && index < list.length && list[index]) return list[index]
  if (index === 0 && productHref) return productHref
  if (slotPath) {
    if (slotPath.startsWith('content/')) return `./${slotPath}`
    return slotPath
  }
  return null
}

/**
 * Responsive box-label composition driven by dimensions, product mode,
 * enabled size systems, table flow and legal display toggles.
 */
export function buildResponsiveBoxLabelScene(
  doc: LabelDocument,
  table: SizeChartTable,
  logos: LogoEntry[],
  productHref: string | null,
  assets: BoxSceneAssets = {},
): LabelScene {
  const overflow: LayoutOverflow[] = []
  const dims = clampBoxDimensions(doc.boxDimensionsMm)
  const labelW = dims.width
  const labelH = dims.height
  const sheet = boxSheetMm(dims)
  const pageW = sheet.width
  const pageH = sheet.height
  const labelX = (pageW - labelW) / 2
  // Leave chrome for caption + width callout (asymmetric like production sheets).
  const labelY = Math.min(21, Math.max(16, pageH - labelH - 6.5))

  const scale = Math.min(labelW / 140, labelH / 120)
  const dual = doc.boxProductMode === 'dual'
  const systems = systemsForBoxTable(table, doc.enabledSizeSystems)
  const junior = systems.includes('US Kids')

  // Pre-decide split with provisional width so margins can tighten for dense layouts.
  const provisionalContentW = labelW - 2 * Math.max(6, 9 * scale)
  const preFlow = decideTableFlow({
    flow: doc.boxTableFlow,
    rowCount: table.rows.length,
    availableWidthMm: Math.max(provisionalContentW - 15, 20),
    productMode: doc.boxProductMode,
  })
  const tightLayout =
    dual || preFlow.split || table.rows.length >= 10 || labelH <= 100 || labelW <= 125
  // PDS wide dual needs near-edge full-width table; ACCEL split keeps more inset.
  const autoMarginX =
    dual && !junior
      ? Math.max(3.8, 4.6 * scale)
      : tightLayout
        ? Math.max(4.5, dual ? 5.2 * scale : 6.5 * scale)
        : Math.max(9, 12.5 * scale)
  const autoMarginTop = tightLayout
    ? Math.max(3.6, 5.2 * scale)
    : Math.max(6.5, 8.5 * scale)
  const autoMarginBottom = tightLayout
    ? Math.max(2.8, 3.6 * scale)
    : Math.max(5, 6.5 * scale)
  const marginX = doc.boxLayout.marginX ?? autoMarginX
  const marginTop = doc.boxLayout.marginTop ?? autoMarginTop
  const marginBottom = doc.boxLayout.marginBottom ?? autoMarginBottom

  const contentLeft = labelX + marginX
  const contentRight = labelX + labelW - marginX
  const contentW = contentRight - contentLeft

  const compact =
    labelH <= 105 || labelW <= 125 || junior || preFlow.split
  const tableDensity: TableDensity =
    dual && table.rows.length >= 10
      ? 'dense'
      : compact
        ? 'compact'
        : 'normal'

  const labelColW = tableMetrics(tableDensity).labelColW
  const tableAvailW = Math.max(contentW - labelColW, 20)

  const flow = decideTableFlow({
    flow: doc.boxTableFlow,
    rowCount: table.rows.length,
    availableWidthMm: tableAvailW,
    productMode: doc.boxProductMode,
  })

  const inferredStrategy = pickStrategy(
    dual,
    flow.split,
    junior,
    table.rows.length,
  )
  const requestedTemplate = doc.boxLayout.template
  const templateMatchesMode =
    requestedTemplate === 'auto' ||
    (dual && requestedTemplate.startsWith('dual-')) ||
    (!dual && requestedTemplate.startsWith('single-'))
  const strategy =
    requestedTemplate !== 'auto' && templateMatchesMode
      ? requestedTemplate
      : inferredStrategy
  // Triple X-style: tall enough dual/kids label with a short size run ? brand left, table right.
  const sideBySideJunior = strategy === 'dual-side-by-side-junior'
  // Sublogos follow the content mode: dual-product labels use the footer,
  // while single-product labels keep them with the product/brand block.
  const defaultLogoPlacement = dual ? 'footer' : 'brand'
  const logoPlacement =
    doc.boxLayout.logoPlacement === 'auto'
      ? defaultLogoPlacement
      : doc.boxLayout.logoPlacement
  const logosOnTable = logoPlacement === 'table'
  const logoList = resolveLogos(logos)
  const logoH =
    strategy === 'dual-compact-junior'
      ? 5.2
      : strategy === 'dual-wide-table'
        ? 5
        : compact
          ? 6
          : 7.2
  const brandBlue = doc.brandColorHex
  const pureK = doc.boxTextColorMode === 'pure-k'
  const companyFill = pureK ? PURE_K : brandBlue
  const titleFill = pureK ? PURE_K : brandBlue
  const skuFill = pureK ? PURE_K : brandBlue
  const markerStroke = pureK ? CAPSULE_STROKE : brandBlue

  const nodes: SceneNode[] = [
    { type: 'rect', x: 0, y: 0, w: pageW, h: pageH, fill: '#fff' },
    {
      type: 'rect',
      x: labelX,
      y: labelY,
      w: labelW,
      h: labelH,
      fill: '#fff',
      stroke: '#222',
      strokeWidth: 0.3,
      radius: 4,
    },
  ]

  nodes.push({
    type: 'text',
    x: 8,
    y: 7,
    runs: primaryCaptionRuns(doc, 4.3),
    fill: PURE_K,
  })
  drawDimensionCallouts(nodes, labelX, labelY, labelW, labelH)

  const footer = drawFooter(nodes, {
    labelX,
    labelY,
    labelW,
    labelH,
    marginX,
    marginBottom,
    legal: doc.legal,
    display: doc.legalDisplay,
    companyFill,
    classLogoHref: assets.classLogoHref,
    footerLogos: logoPlacement === 'footer' ? logoList : [],
    footerLogoH: logoH,
    compact: tightLayout || labelH <= 110,
    dual,
  })

  const tableStartY = labelY + marginTop
  const splitGap = 2.6
  let tablesBottom = tableStartY
  let skipDualWordmark = false
  const tableSystems = systems.length ? systems : (['MONDO', 'EU'] as SizeSystem[])

  if (flow.split && flow.colCountSecond > 0) {
    const firstRows = table.rows.slice(0, flow.splitIndex)
    const secondRows = table.rows.slice(flow.splitIndex)
    // ACCEL-style: full-width stacked tables; product sits in the brand band below.
    const tableW = contentW
    const h1 = drawBoxSizeTable(nodes, {
      x: contentLeft,
      y: tableStartY,
      width: tableW,
      rows: firstRows,
      systems: tableSystems,
      density: 'compact',
    })
    const h2 = drawBoxSizeTable(nodes, {
      x: contentLeft,
      y: tableStartY + h1 + splitGap,
      width: tableW,
      rows: secondRows,
      systems: tableSystems,
      density: 'compact',
    })
    tablesBottom = tableStartY + h1 + splitGap + h2
  } else if (sideBySideJunior) {
    const leftW = Math.min(contentW * 0.42, 50)
    const gap = 2.8
    const tableW = contentW - leftW - gap
    const h = drawBoxSizeTable(nodes, {
      x: contentLeft + leftW + gap,
      y: tableStartY,
      width: tableW,
      rows: table.rows,
      systems: tableSystems,
      density: 'compact',
    })
    tablesBottom = tableStartY + h
    const wordmark = assets.boxWordmarkHref || assets.wordmarkHref
    let hy = tableStartY
    if (wordmark) {
      const wmH = Math.min(8.5, h * 0.28)
      const wmW = Math.min(leftW * 1.05, 48)
      nodes.push({
        type: 'image',
        x: contentLeft,
        y: hy,
        w: wmW,
        h: wmH,
        href: wordmark,
        fit: 'contain',
        alignX: 'left',
      })
      hy += wmH + 2.4
    }
    // Range / model title for header (doc.title), not the per-product color name.
    const headerTitle = doc.title.length ? doc.title : doc.boxProducts[0]?.title ?? []
    const headerFs = Math.min(doc.titleSizes.box, 4.2)
    wrapTextRuns(
      headerTitle.map((r) => ({
        text: r.text,
        bold: r.bold !== false,
        fontSize: headerFs,
      })),
      headerFs,
      leftW,
    )
      .slice(0, 3)
      .forEach((line, i) => {
        nodes.push({
          type: 'text',
          x: contentLeft,
          y: hy + headerFs + i * (headerFs + 0.45),
          runs: line,
          fill: titleFill,
        })
      })
    skipDualWordmark = true
  } else {
    // Rocket: leave room on the right for badges sitting on the table band.
    const tableW =
      logosOnTable && logoList.length && strategy !== 'single-split-table'
        ? contentW - Math.min(contentW * 0.18, logoList.length * logoH * 1.15 + 2)
        : contentW
    const h = drawBoxSizeTable(nodes, {
      x: contentLeft,
      y: tableStartY,
      width: tableW,
      rows: table.rows,
      systems: tableSystems,
      density: tableDensity,
    })
    tablesBottom = tableStartY + h
    // Rocket: badges on the upper-right of the table band.
    if (logosOnTable && logoList.length && strategy !== 'single-split-table') {
      const logosWidth = logoList.reduce(
        (w, l) => w + l.aspectRatio * logoH + 0.5,
        -0.5,
      )
      drawLogoRow(
        nodes,
        logoList,
        contentRight - Math.min(logosWidth, contentW * 0.42),
        tableStartY - 0.5,
        logoH,
        0.5,
        contentW * 0.42,
      )
    }
  }

  const tableToProductsGap =
    strategy === 'dual-side-by-side-junior' ? 4.8 : compact ? 2.4 : 4.2
  const brandTop =
    tablesBottom + tableToProductsGap + doc.boxLayout.brandGapMm
  const brandBottomLimit = footer.top - 1.8
  const brandAreaH = Math.max(0, brandBottomLimit - brandTop)

  const wordmark = assets.boxWordmarkHref || assets.wordmarkHref
  const titleSize = doc.titleSizes.box
  const skuSize = compact ? 3.8 : 4.6

  if (dual) {
    const requestedAlign = doc.boxLayout.wordmarkAlign
    layoutDualProducts(nodes, {
      doc,
      assets,
      productHref,
      logos: logoPlacement === 'brand' ? logoList : [],
      logoH,
      strategy,
      contentLeft,
      contentRight,
      contentW,
      brandTop,
      brandAreaH,
      wordmark: skipDualWordmark ? undefined : wordmark,
      titleSize,
      skuSize,
      titleFill,
      skuFill,
      markerStroke,
      overflow,
      compact,
      wordmarkAlign:
        requestedAlign !== 'auto'
          ? requestedAlign
          : strategy === 'dual-wide-table'
            ? 'right'
            : strategy === 'dual-compact-junior' && !sideBySideJunior
              ? 'center'
              : 'left',
    })
  } else {
    layoutSingleProduct(nodes, {
      doc,
      assets,
      productHref,
      logos: logoPlacement === 'footer' ? [] : logoList,
      logoPlacement,
      logoH,
      strategy,
      labelX,
      labelY,
      labelW,
      labelH,
      contentLeft,
      contentRight,
      contentW,
      brandTop,
      brandAreaH,
      brandBottomLimit,
      wordmark,
      titleSize,
      skuSize,
      titleFill,
      skuFill,
      overflow,
      compact,
      tablesBottom,
      tableStartY,
      marginX,
      marginBottom,
    })
  }

  if (strategy !== 'single-split-table' && brandAreaH < 18) {
    overflow.push({
      block: 'brand',
      message:
        'Brand / product region is tight for this height. Increase label height or hide unused legal blocks.',
    })
  }
  if (tablesBottom > footer.top - 4) {
    overflow.push({
      block: 'table',
      message:
        'Size table overlaps the footer region. Split the table, reduce size systems, or increase height.',
    })
  }

  const meta: BoxLayoutMeta = {
    strategy,
    overflow,
    tableWarning: flow.warning,
    labelMm: { width: labelW, height: labelH },
    sheetMm: { width: pageW, height: pageH },
  }
  lastBoxLayoutMeta = meta

  return {
    kind: 'box',
    unit: 'mm',
    width: pageW,
    height: pageH,
    nodes,
    overflow,
    layoutStrategy: strategy,
    tableWarning: flow.warning,
  }
}

function layoutSingleProduct(
  nodes: SceneNode[],
  args: {
    doc: LabelDocument
    assets: BoxSceneAssets
    productHref: string | null
    logos: Array<{ href: string; aspectRatio: number }>
    logoPlacement: 'table' | 'brand' | 'footer'
    logoH: number
    strategy: BoxLayoutStrategy
    labelX: number
    labelY: number
    labelW: number
    labelH: number
    contentLeft: number
    contentRight: number
    contentW: number
    brandTop: number
    brandAreaH: number
    brandBottomLimit: number
    wordmark?: string
    titleSize: number
    skuSize: number
    titleFill: string
    skuFill: string
    overflow: LayoutOverflow[]
    compact: boolean
    tablesBottom: number
    tableStartY: number
    marginX: number
    marginBottom: number
  },
): void {
  const {
    doc,
    assets,
    productHref,
    logos,
    logoPlacement,
    logoH,
    strategy,
    labelX,
    labelY,
    labelW,
    labelH,
    contentLeft,
    contentRight,
    contentW,
    brandTop,
    brandAreaH,
    brandBottomLimit,
    wordmark,
    titleSize,
    skuSize,
    titleFill,
    skuFill,
    overflow,
    compact,
    tablesBottom,
    tableStartY,
    marginX,
    marginBottom,
  } = args

  const slot = doc.boxProducts[0] ?? {
    title: doc.title,
    sku: doc.sku,
    imagePath: doc.productImagePath,
    imageName: doc.productImageName,
  }
  const href = productHrefFor(0, productHref, assets) || productHref

  // ACCEL-style: logos sit near the upper-right of the table band when split.
  if (logoPlacement === 'table' && logos.length) {
    const logosWidth = logos.reduce((w, l) => w + l.aspectRatio * logoH + 0.5, -0.5)
    drawLogoRow(
      nodes,
      logos,
      contentRight - Math.min(logosWidth, contentW * 0.45),
      tableStartY - 1,
      logoH,
      0.5,
      contentW * 0.45,
    )
  }

  const textColW =
    strategy === 'single-split-table'
      ? href
        ? contentW * (doc.boxLayout.titleColumnPercent / 100)
        : contentW
      : href
        ? contentW * (doc.boxLayout.titleColumnPercent / 100)
        : contentW
  const singleTitleSize =
    strategy === 'single-split-table' ? Math.min(titleSize, 4.2) : titleSize
  const wordmarkScale = doc.boxLayout.wordmarkScale
  const wmH =
    Math.min(
      strategy === 'single-split-table' ? 8.5 : 8.2,
      Math.max(6.2, brandAreaH * 0.18),
    ) * wordmarkScale
  let cursorY = brandTop

  if (wordmark) {
    const wordmarkX =
      strategy === 'single-split-table'
        ? labelX + 1.8
        : contentLeft
    const wmW = Math.min(
      strategy === 'single-split-table' ? textColW * 1.05 : textColW * 1.15,
      66 * (labelW / 140) * wordmarkScale,
    )
    nodes.push({
      type: 'image',
      x: wordmarkX,
      y: cursorY,
      w: wmW,
      h: wmH,
      href: wordmark,
      fit: 'contain',
      alignX: 'left',
    })
    cursorY += wmH + (compact ? 2.2 : 3.4)
  }

  const titleLines = wrapTextRuns(
    slotTitleRuns(slot, singleTitleSize),
    singleTitleSize,
    textColW,
  )
  titleLines.slice(0, 3).forEach((line, i) => {
    nodes.push({
      type: 'text',
      x: contentLeft,
      y:
        cursorY +
        singleTitleSize +
        i * (singleTitleSize + 0.75),
      runs: line,
      fill: titleFill,
    })
  })
  cursorY += Math.min(titleLines.length, 3) * (singleTitleSize + 0.75) + 1.0

  if (slot.sku.trim()) {
    nodes.push({
      type: 'text',
      x: contentLeft,
      y: cursorY + skuSize,
      runs: [{ text: slot.sku, bold: false, fontSize: skuSize }],
      fill: skuFill,
    })
    cursorY += skuSize + 2
  }

  if (logoPlacement === 'brand' && logos.length) {
    drawLogoRow(nodes, logos, contentLeft, cursorY, logoH, 0.6, textColW)
    cursorY += logoH + 1.6
  }

  if (href) {
    const madeInOnly =
      doc.legalDisplay.showMadeIn &&
      Boolean(doc.legal.madeIn.trim()) &&
      companyLines(doc.legal, doc.legalDisplay, compact).length === 0 &&
      classLines(doc.legal, doc.legalDisplay, compact).length === 0
    const imgTop =
      strategy === 'single-split-table'
        ? Math.max(tablesBottom + 0.8, brandTop - 2.2)
        : Math.max(brandTop, tablesBottom + 3)
    // With only the country mark in the footer, the product may share that
    // lower band as long as it leaves a dedicated column on the right.
    const shareMinimalFooter =
      strategy === 'single-split-table' && madeInOnly
    const imgMaxBottom = shareMinimalFooter
      ? labelY + labelH - marginBottom
      : brandBottomLimit - 1.2
    // The footer can be only a small "Made in" band. Never force a 32 mm
    // image through that boundary when the table leaves less room.
    const maxH = Math.max(12, imgMaxBottom - imgTop)
    if (strategy === 'single-split-table') {
      const imageLeft = contentLeft + textColW + 4
      const imageRight = contentRight - (shareMinimalFooter ? 13 : 0)
      const imageAreaW = Math.max(24, imageRight - imageLeft)
      const imgW = Math.min(
        imageAreaW * 0.92,
        Math.min(82 * (labelW / 140), contentW * 0.62) *
          doc.boxLayout.productImageScale,
      )
      const imgH = Math.min(
        maxH,
        Math.min(labelH * 0.49, 59) * doc.boxLayout.productImageScale,
      )
      nodes.push({
        type: 'image',
        x: imageLeft + (imageAreaW - imgW) / 2,
        y: imgTop,
        w: imgW,
        h: imgH,
        href,
        fit: 'contain',
        alignX: 'center',
        alignY: 'bottom',
      })
    } else {
      const imgW = Math.min(
        contentW * 0.65,
        Math.min(72 * (labelW / 140), contentW * 0.54) *
          doc.boxLayout.productImageScale,
      )
      const imgH = Math.min(
        maxH,
        Math.min(labelH * 0.46, 58) * doc.boxLayout.productImageScale,
      )
      nodes.push({
        type: 'image',
        x: labelX + labelW - marginX - imgW,
        y: imgTop,
        w: imgW,
        h: imgH,
        href,
        fit: 'contain',
        alignX: 'right',
        alignY: 'bottom',
      })
    }
  }

  const used = cursorY - brandTop
  if (strategy !== 'single-split-table' && used > brandAreaH + 1) {
    overflow.push({
      block: 'product',
      message: `Single-product block needs ~${used.toFixed(1)} mm but only ${brandAreaH.toFixed(1)} mm is free.`,
    })
  }
  if (
    runsWidth(slotTitleRuns(slot, singleTitleSize)) > textColW * 1.6 &&
    titleLines.length > 3
  ) {
    overflow.push({
      block: 'title',
      message: 'Product title wraps heavily; shorten the title or widen the label.',
    })
  }
}

function layoutDualProducts(
  nodes: SceneNode[],
  args: {
    doc: LabelDocument
    assets: BoxSceneAssets
    productHref: string | null
    logos: Array<{ href: string; aspectRatio: number }>
    logoH: number
    strategy: BoxLayoutStrategy
    contentLeft: number
    contentRight: number
    contentW: number
    brandTop: number
    brandAreaH: number
    wordmark?: string
    titleSize: number
    skuSize: number
    titleFill: string
    skuFill: string
    markerStroke: string
    overflow: LayoutOverflow[]
    compact: boolean
    wordmarkAlign?: 'left' | 'center' | 'right'
  },
): void {
  const {
    doc,
    assets,
    productHref,
    logos,
    logoH,
    strategy,
    contentLeft,
    contentRight,
    contentW,
    brandTop,
    brandAreaH,
    wordmark,
    titleSize,
    skuSize,
    titleFill,
    skuFill,
    markerStroke,
    overflow,
    compact,
    wordmarkAlign = 'left',
  } = args

  const gap = Math.max(4, contentW * 0.04)
  const colW = (contentW - gap) / 2
  const slots = [
    doc.boxProducts[0] ?? {
      title: doc.title,
      sku: doc.sku,
      imagePath: doc.productImagePath,
      imageName: doc.productImageName,
    },
    doc.boxProducts[1] ?? {
      title: [{ text: 'PRODUCT 2', bold: true }],
      sku: '',
      imagePath: null,
      imageName: null,
    },
  ]

  let cursorY = brandTop
  const tightBrand = brandAreaH < 40
  const wmH = Math.min(
    strategy === 'dual-compact-junior'
      ? wordmarkAlign === 'center'
        ? 8.2
        : 6.8
      : tightBrand
        ? 5.8
        : 7.2,
    Math.max(5.2, brandAreaH * (wordmarkAlign === 'center' ? 0.18 : 0.14)),
  ) * doc.boxLayout.wordmarkScale

  // Always draw shared wordmark when provided (PDS right / Rocket center / other left).
  if (wordmark) {
    const wmW =
      wordmarkAlign === 'center'
        ? Math.min(contentW * 0.72, 78)
        : wordmarkAlign === 'right'
          ? Math.min(contentW * 0.48, 58)
          : Math.min(contentW * 0.42, 52)
    const scaledW = wmW * doc.boxLayout.wordmarkScale
    const x =
      wordmarkAlign === 'right'
        ? contentRight - scaledW
        : wordmarkAlign === 'center'
          ? contentLeft + (contentW - scaledW) / 2
          : contentLeft
    nodes.push({
      type: 'image',
      x,
      y: cursorY,
      w: scaledW,
      h: wmH,
      href: wordmark,
      fit: 'contain',
      alignX: wordmarkAlign,
    })
    cursorY += wmH + (compact ? 1.4 : 2.2)
  }

  if (
    strategy !== 'dual-side-by-side-junior' &&
    plainText(doc.title).trim()
  ) {
    const sharedTitleSize = Math.min(titleSize, compact ? 3.35 : 4)
    const sharedTitleWidth =
      wordmarkAlign === 'right' ? contentW * 0.56 : contentW * 0.72
    const sharedTitleX =
      wordmarkAlign === 'right'
        ? contentRight
        : wordmarkAlign === 'center'
          ? contentLeft + contentW / 2
          : contentLeft
    const sharedLines = wrapTextRuns(
      doc.title.map((run) => ({
        text: run.text,
        bold: run.bold !== false,
        fontSize: sharedTitleSize,
      })),
      sharedTitleSize,
      sharedTitleWidth,
    ).slice(0, 2)
    sharedLines.forEach((line, index) => {
      nodes.push({
        type: 'text',
        x: sharedTitleX,
        y: cursorY + sharedTitleSize + index * (sharedTitleSize + 0.45),
        runs: line,
        fill: titleFill,
        anchor:
          wordmarkAlign === 'right'
            ? 'end'
            : wordmarkAlign === 'center'
              ? 'middle'
              : undefined,
      })
    })
    cursorY +=
      sharedLines.length * (sharedTitleSize + 0.45) + (compact ? 2.2 : 2.8)
  }

  if (logos.length) {
    drawLogoRow(nodes, logos, contentLeft, cursorY, logoH, 0.6, contentW * 0.5)
    cursorY += logoH + (compact ? 1.2 : 1.8)
  }

  const productBottomLimit = brandTop + brandAreaH
  const dualTitleSize = Math.min(titleSize, compact ? 3.15 : 3.7)
  const sparseFooter =
    companyLines(doc.legal, doc.legalDisplay, compact).length === 0 &&
    classLines(doc.legal, doc.legalDisplay, compact).length === 0
  const remaining = Math.max(18, productBottomLimit - cursorY)
  // Bias remaining height toward product photos (refs show large images).
  const textReserve =
    strategy === 'dual-wide-table' ? (compact ? 10 : 11.5) : compact ? 9 : 11
  const imageH = Math.max(
    strategy === 'dual-wide-table' ? 28 : strategy === 'dual-compact-junior' ? 26 : 24,
    Math.min(remaining - textReserve, remaining * 0.72),
  )

  slots.forEach((slot, i) => {
    const colX = contentLeft + i * (colW + gap)
    let y = cursorY
    const titleLines = wrapTextRuns(
      slotTitleRuns(slot, dualTitleSize),
      dualTitleSize,
      colW,
    )
    titleLines.slice(0, 2).forEach((line, li) => {
      nodes.push({
        type: 'text',
        x: colX,
        y: y + dualTitleSize + li * (dualTitleSize + 0.4),
        runs: line,
        fill: titleFill,
      })
    })
    y += Math.min(titleLines.length, 2) * (dualTitleSize + 0.4) + 0.25

    const subtitle = slot.subtitle?.trim()
    if (subtitle) {
      const subFs = Math.max(2.35, dualTitleSize * 0.52)
      nodes.push({
        type: 'text',
        x: colX,
        y: y + subFs,
        runs: [{ text: subtitle, bold: false, fontSize: subFs }],
        fill: titleFill,
      })
      y += subFs + (compact ? 1.2 : 1.6)
    } else {
      // Preserve the same visual separation before the SKU/capsule row when
      // there is no subtitle; otherwise the capsule touches the title line.
      y += compact ? 1.2 : 1.6
    }

    if (slot.sku.trim()) {
      const skuFs = Math.min(skuSize, compact ? 3.1 : skuSize)
      const skuText = slot.sku
      const skuW = estimateTextWidth(skuText, skuFs, false)
      nodes.push({
        type: 'text',
        x: colX,
        y: y + skuFs,
        runs: [{ text: skuText, bold: false, fontSize: skuFs }],
        fill: skuFill,
      })
      // Empty rounded mark box next to SKU (production checkbox ? rect, not circle).
      const markW = Math.max(7.2, skuFs * 2)
      const markH = Math.max(3.8, skuFs * 1.05)
      nodes.push({
        type: 'rect',
        x: colX + skuW + 1.7,
        y: y + (skuFs - markH) / 2,
        w: markW,
        h: markH,
        stroke: markerStroke,
        strokeWidth: 0.32,
        radius: Math.min(1.9, markH * 0.42),
        fill: 'none',
      })
      y += skuFs + 0.7
    }

    const href = productHrefFor(i, productHref, assets, slot.imagePath)
    if (href) {
      const availH = Math.max(16, productBottomLimit - y)
      const baseH = Math.min(Math.max(imageH, availH * 0.94), availH)
      const h = Math.min(
        availH,
        baseH * doc.boxLayout.productImageScale,
      )
      const imgW = Math.min(
        colW *
          (sparseFooter
            ? 0.96
            : strategy === 'dual-side-by-side-junior'
              ? 1.12
              : 1.06),
        h *
          (sparseFooter
            ? 2.08
            : strategy === 'dual-side-by-side-junior'
              ? 1.85
              : 1.62) *
          doc.boxLayout.productImageScale,
      )
      nodes.push({
        type: 'image',
        x: colX + (colW - imgW) / 2,
        y,
        w: imgW,
        h,
        href,
        fit: 'contain',
      })
      y += h
    }

    if (y > productBottomLimit + 1.5) {
      overflow.push({
        block: `product-${i + 1}`,
        message: `Product ${i + 1} overflows the brand region (${plainText(slot.title) || 'untitled'}).`,
      })
    }
  })
}
