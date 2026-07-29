import { describe, expect, it } from 'vitest'
import { isAppTab, parseAppUrl } from './urlState'

describe('urlState', () => {
  it('parses preset and tab from search', () => {
    expect(parseAppUrl('?preset=box-pds-dual-120&tab=box')).toEqual({
      preset: 'box-pds-dual-120',
      tab: 'box',
    })
  })

  it('rejects unknown tabs', () => {
    expect(isAppTab('box')).toBe(true)
    expect(isAppTab('size-normal')).toBe(true)
    expect(isAppTab('nope')).toBe(false)
    expect(parseAppUrl('?tab=nope').tab).toBeNull()
  })

  it('treats blank preset as null', () => {
    expect(parseAppUrl('?preset=%20&tab=box')).toEqual({
      preset: null,
      tab: 'box',
    })
  })
})
