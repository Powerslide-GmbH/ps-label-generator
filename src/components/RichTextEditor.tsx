import { useEffect, useRef } from 'react'
import type { RichText } from '@/domain/types'
import {
  applyBoldToSelection,
  mergeRuns,
  plainText,
} from '@/domain/richText'

type Props = {
  value: RichText
  onChange: (next: RichText) => void
  label?: string
}

function isBoldRun(bold: boolean | undefined): boolean {
  return bold !== false
}

function runsToHtml(runs: RichText): string {
  return runs
    .map((run) => {
      const bold = isBoldRun(run.bold)
      const weight = bold ? 700 : 400
      const escaped = run.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')
      return `<span data-bold="${bold}" style="font-weight:${weight}">${escaped || '&#8203;'}</span>`
    })
    .join('')
}

function htmlToRuns(root: HTMLElement): RichText {
  const runs: RichText = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip zero-width placeholders used for empty spans
      const text = (node.textContent ?? '').replace(/\u200B/g, '')
      if (!text) return
      const parent = node.parentElement
      const bold =
        parent?.dataset.bold === 'false'
          ? false
          : parent?.style.fontWeight === '400'
            ? false
            : true
      runs.push({ text, bold })
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.tagName === 'BR') {
        runs.push({ text: '\n', bold: true })
        return
      }
      el.childNodes.forEach(walk)
    }
  }
  root.childNodes.forEach(walk)
  return mergeRuns(runs.length ? runs : [{ text: '', bold: true }])
}

function getSelectionOffsets(root: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 }
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return { start: 0, end: 0 }
  const pre = range.cloneRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  // Exclude ZWSP so offsets match the text model (htmlToRuns strips them)
  const start = pre.toString().replace(/\u200B/g, '').length
  const end = start + range.toString().replace(/\u200B/g, '').length
  return { start, end }
}

function findModelOffset(root: HTMLElement, target: number): { node: Text; offset: number } | null {
  let seen = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  let node: Node | null
  while ((node = walker.nextNode())) {
    last = node as Text
    const text = last.textContent ?? ''
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\u200B') continue
      if (seen === target) return { node: last, offset: i }
      seen += 1
    }
  }
  if (last && seen === target) {
    return { node: last, offset: last.textContent?.length ?? 0 }
  }
  if (last) return { node: last, offset: last.textContent?.length ?? 0 }
  return null
}

function setSelectionOffsets(root: HTMLElement, start: number, end: number) {
  const sel = window.getSelection()
  if (!sel) return
  const a = findModelOffset(root, start)
  const b = findModelOffset(root, end)
  if (!a || !b) return
  const range = document.createRange()
  try {
    range.setStart(a.node, a.offset)
    range.setEnd(b.node, b.offset)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {
    // Ignore invalid ranges (e.g. empty editor)
  }
}

export function RichTextEditor({ value, onChange, label = 'Title' }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  /** Last runs we wrote (toolbar / input) so focused re-renders do not clobber the caret */
  const lastEmittedRef = useRef<string>('')

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const serialized = JSON.stringify(value)
    if (document.activeElement === el && serialized === lastEmittedRef.current) {
      return
    }
    el.innerHTML = runsToHtml(value)
    lastEmittedRef.current = serialized
  }, [value])

  function emitFromDom() {
    const el = editorRef.current
    if (!el) return
    const next = htmlToRuns(el)
    lastEmittedRef.current = JSON.stringify(next)
    onChange(next)
  }

  function withSelection(map: (runs: RichText, start: number, end: number) => RichText) {
    const el = editorRef.current
    if (!el) return
    const { start, end } = getSelectionOffsets(el)
    if (end <= start) return
    // Prefer live DOM runs so formatting never applies against a stale prop
    const current = htmlToRuns(el)
    const next = map(current, start, end)
    // Persist into the DOM immediately — otherwise onBlur/syncFromDom reverts to old HTML
    el.innerHTML = runsToHtml(next)
    lastEmittedRef.current = JSON.stringify(next)
    onChange(next)
    setSelectionOffsets(el, start, end)
    requestAnimationFrame(() => {
      el.focus()
      setSelectionOffsets(el, start, end)
    })
  }

  return (
    <div className="field">
      <div className="field-label-row">
        <label>{label}</label>
        <div className="rt-toolbar">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              withSelection((runs, s, e) => applyBoldToSelection(runs, s, e, true))
            }
          >
            Bold
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              withSelection((runs, s, e) => applyBoldToSelection(runs, s, e, false))
            }
          >
            Regular
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        className="rt-editor"
        contentEditable
        role="textbox"
        aria-label={label}
        suppressContentEditableWarning
        onInput={emitFromDom}
        onBlur={emitFromDom}
      />
      <p className="hint">
        Bold/regular here. Font size is set per output below (Size / Box / Chart).
        {plainText(value) ? '' : ''}
      </p>
    </div>
  )
}
