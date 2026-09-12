import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {createXeroClient, withRetry} from '../../src/lib/xero-client.js'
import {refreshAccessToken} from '../../src/lib/oauth.js'
import {clearCachedToken} from '../../src/lib/auth.js'

vi.mock('../../src/lib/auth.js', () => ({
  getCachedTokenSet: vi.fn(async () => ({accessToken: 'synthetic', refreshToken: 'synthetic', tenantId: 'synthetic'})),
  cacheTokenSet: vi.fn(), clearCachedToken: vi.fn(), isTokenExpired: () => true,
}))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

it.each([
  [400, 'invalid_grant', true], [500, 'invalid_grant', false], [400, 'invalid_client', false],
])('only clears confirmed invalid refresh tokens (%s %s)', async (status, error, cleared) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ok: false, status, text: async () => JSON.stringify({error})})))
  await expect(createXeroClient('synthetic', 'synthetic')).rejects.toThrow(cleared ? 'Session expired' : 'Token refresh failed')
  expect(vi.mocked(clearCachedToken).mock.calls.length).toBe(cleared ? 1 : 0)
})

it('preserves the cached token when the network fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unavailable') }))
  await expect(withRetry('synthetic', 'synthetic', vi.fn())).rejects.toThrow('network unavailable')
  expect(clearCachedToken).not.toHaveBeenCalled()
})

it('does not expose a malformed endpoint body or mark it as a revoked token', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ok: false, status: 502, text: async () => 'Authorization: Bearer synthetic-secret'})))
  const error = await refreshAccessToken('synthetic', 'synthetic').catch(error => error)
  expect(error.message).toBe('Token refresh failed (502)')
  expect(error.invalidRefreshToken).toBe(false)
})
