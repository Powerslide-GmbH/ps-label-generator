export type AppTab = 'size-normal' | 'size-double' | 'box' | 'sizechart'

const TAB_VALUES: ReadonlySet<string> = new Set([
  'size-normal',
  'size-double',
  'box',
  'sizechart',
])

export function isAppTab(value: string | null | undefined): value is AppTab {
  return typeof value === 'string' && TAB_VALUES.has(value)
}

export type AppUrlState = {
  preset: string | null
  tab: AppTab | null
}

/** Read sharing params from the current (or given) search string. */
export function parseAppUrl(search = window.location.search): AppUrlState {
  const params = new URLSearchParams(search)
  const presetRaw = params.get('preset')?.trim() || null
  const tabRaw = params.get('tab')
  return {
    preset: presetRaw,
    tab: isAppTab(tabRaw) ? tabRaw : null,
  }
}

/**
 * Sync preset + tab into the URL without navigating/reloading.
 * Only touch `preset` and `tab` keys; leave other params alone.
 */
export function syncAppUrl(
  state: { preset?: string | null; tab: AppTab },
  mode: 'replace' | 'push' = 'replace',
): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const preset = state.preset?.trim() || null
  if (preset) url.searchParams.set('preset', preset)
  else url.searchParams.delete('preset')
  url.searchParams.set('tab', state.tab)
  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next === current) return
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
}
