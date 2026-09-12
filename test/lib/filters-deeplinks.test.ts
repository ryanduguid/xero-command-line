import {expect, it} from 'vitest'
import {filterGuid, filterString} from '../../src/lib/filters.js'
import {bankTransactionDeepLink, billDeepLink, creditNoteDeepLink, contactDeepLink} from '../../src/lib/deeplinks.js'
import {formatDate} from '../../src/lib/formatters.js'

it('keeps quotes and backslashes inside filter strings and refuses injected GUIDs', () => {
  const value = 'a\\b" OR Reference="other'
  expect(JSON.parse(filterString(value))).toBe(value)
  expect(() => filterGuid(value, 'invoice-id')).toThrow('--invoice-id must be a UUID')
  expect(filterGuid('00000000-0000-0000-0000-000000000000', 'invoice-id')).toBe('guid("00000000-0000-0000-0000-000000000000")')
})

it.each([billDeepLink, creditNoteDeepLink, bankTransactionDeepLink])('encodes each level of a nested redirect', link => {
  const outer = new URL(link('code&other=1', 'id&other=2'))
  expect([...outer.searchParams.keys()]).toEqual(['shortcode', 'redirecturl'])
  expect(outer.searchParams.get('shortcode')).toBe('code&other=1')
  const inner = new URL(outer.searchParams.get('redirecturl')!, outer.origin)
  expect([...inner.searchParams.values()]).toEqual(['id&other=2'])
  expect(new URL(contactDeepLink('a/b', 'c/d')).pathname).toBe('/app/a%2Fb/contacts/contact/c%2Fd')
})

it.each(['', '+1000', '-0500'])('formats a Xero date with offset %s', offset => {
  expect(formatDate(`/Date(0${offset})/`)).toBe('1970-01-01')
})
