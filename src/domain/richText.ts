import type { RichText, TextRun } from './types'

export function plainText(runs: RichText): string {
  return runs.map((r) => r.text).join('')
}

export function richFromPlain(text: string, opts?: Partial<TextRun>): RichText {
  return [{ text, bold: opts?.bold ?? true, fontSize: opts?.fontSize }]
}

/** Demo-style title: main name bold, trailing size token lighter/smaller */
export function demoTitle(name: string, suffix?: string): RichText {
  const runs: RichText = [{ text: name.trim(), bold: true, fontSize: 11 }]
  if (suffix?.trim()) {
    runs.push({ text: ` ${suffix.trim()}`, bold: false, fontSize: 9 })
  }
  return runs
}

export function applyBoldToSelection(
  runs: RichText,
  start: number,
  end: number,
  bold: boolean,
): RichText {
  return mapRange(runs, start, end, (run) => ({ ...run, bold }))
}

export function applySizeToSelection(
  runs: RichText,
  start: number,
  end: number,
  fontSize: number,
): RichText {
  return mapRange(runs, start, end, (run) => ({ ...run, fontSize }))
}

function mapRange(
  runs: RichText,
  start: number,
  end: number,
  map: (run: TextRun) => TextRun,
): RichText {
  if (end <= start) return runs
  const out: RichText = []
  let cursor = 0
  for (const run of runs) {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd
    if (runEnd <= start || runStart >= end) {
      out.push(run)
      continue
    }
    const localStart = Math.max(0, start - runStart)
    const localEnd = Math.min(run.text.length, end - runStart)
    if (localStart > 0) out.push({ ...run, text: run.text.slice(0, localStart) })
    out.push(map({ ...run, text: run.text.slice(localStart, localEnd) }))
    if (localEnd < run.text.length) out.push({ ...run, text: run.text.slice(localEnd) })
  }
  return mergeRuns(out)
}

/** Treat missing bold as true (matches rendering / titleRuns). */
export function isBold(run: TextRun): boolean {
  return run.bold !== false
}

export function mergeRuns(runs: RichText): RichText {
  const out: RichText = []
  for (const run of runs) {
    if (!run.text) continue
    const prev = out[out.length - 1]
    if (
      prev &&
      isBold(prev) === isBold(run) &&
      prev.fontSize === run.fontSize
    ) {
      prev.text += run.text
    } else {
      // Normalize bold so undefined and true stay consistent after merge
      out.push({ ...run, bold: isBold(run) })
    }
  }
  return out.length ? out : [{ text: '', bold: true }]
}

export function replacePlainKeepingStyle(runs: RichText, text: string): RichText {
  if (!runs.length) return [{ text, bold: true }]
  if (runs.length === 1) return [{ ...runs[0], text }]
  // Keep first-run style for whole new string when user types plain
  return [{ ...runs[0], text }]
}
