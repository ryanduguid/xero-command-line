import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {performLogin} from '../../src/lib/oauth.js'

const http = vi.hoisted(() => ({
  handler: undefined as any,
  server: {listen: vi.fn(), on: vi.fn(), close: vi.fn()},
}))
const open = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('node:http', () => ({
  createServer: (handler: any) => {
    http.handler = handler
    return http.server
  },
}))
vi.mock('open', () => ({default: open}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ok: true, json: async () => ({access_token: 'synthetic-token'})})
    .mockResolvedValueOnce({ok: true, json: async () => [{tenantId: 'synthetic-tenant', tenantName: 'Synthetic'}]}))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function beginLogin() {
  const result = performLogin('synthetic-client').catch((error: Error) => error)
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce())
  const state = new URL(open.mock.calls[0][0]).searchParams.get('state')!
  return {result, state}
}

function callback(params: Record<string, string>) {
  const response = {writeHead: vi.fn(), end: vi.fn()}
  http.handler({url: `/callback?${new URLSearchParams(params)}`}, response)
  return response
}

describe('OAuth callback', () => {
  it.each([undefined, 'wrong-state'])('ignores an error callback with state %s and accepts the pending login', async (wrongState) => {
    const {result, state} = await beginLogin()
    const response = callback({error: 'access_denied', ...(wrongState ? {state: wrongState} : {})})
    expect(response.writeHead.mock.calls[0][0]).toBe(400)
    expect(http.server.close).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    callback({code: 'synthetic-code', state})
    expect(await result).toMatchObject({tenantId: 'synthetic-tenant'})
    expect(http.server.listen).toHaveBeenCalledWith(8742, '127.0.0.1', expect.any(Function))
  })

  it('keeps the login pending after a wrong-state code', async () => {
    const {result, state} = await beginLogin()
    const response = callback({code: 'synthetic-code', state: 'wrong-state'})
    expect(response.writeHead.mock.calls[0][0]).toBe(400)
    expect(http.server.close).not.toHaveBeenCalled()
    callback({code: 'synthetic-code', state})
    expect(await result).toMatchObject({tenantId: 'synthetic-tenant'})
  })

  it('returns a matching-state error as plain text and ends the login', async () => {
    const {result, state} = await beginLogin()
    const description = '<b>Synthetic error</b>'
    const response = callback({error: 'access_denied', error_description: description, state})
    expect(response.writeHead).toHaveBeenCalledWith(200, {'Content-Type': 'text/plain; charset=utf-8'})
    expect(response.end.mock.calls[0][0]).toContain(description)
    expect(await result).toEqual(new Error(`OAuth error: ${description}`))
    expect(http.server.close).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out without exchanging a code', async () => {
    const {result} = await beginLogin()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await result).toEqual(new Error('OAuth callback timed out after 2 minutes. Please try again.'))
    expect(http.server.close).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })
})
