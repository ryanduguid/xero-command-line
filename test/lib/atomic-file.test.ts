import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {FileLockError, withFileLock, writeFileAtomic} from '../../src/lib/atomic-file.js'

const fsync = vi.hoisted(() => ({fail: false}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    fsyncSync(fd: number) {
      if (fsync.fail) throw Object.assign(new Error('EIO: i/o error, fsync'), {code: 'EIO'})
      actual.fsyncSync(fd)
    },
  }
})

let dir: string
let lock: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xero-atomic-file-'))
  lock = join(dir, 'tokens.json.lock')
})

afterEach(() => {
  fsync.fail = false
  vi.useRealTimers()
  rmSync(dir, {recursive: true, force: true})
})

/** A lock directory last touched a minute ago, with an optional owner file. */
function oldLock(owner?: string): void {
  mkdirSync(lock)
  if (owner !== undefined) writeFileSync(join(lock, 'owner'), owner)
  const minuteAgo = new Date(Date.now() - 60_000)
  utimesSync(lock, minuteAgo, minuteAgo)
}

describe('writeFileAtomic', () => {
  it('removes its temp file and leaves the target alone when a write step fails', () => {
    const target = join(dir, 'tokens.json')
    writeFileSync(target, 'old')
    fsync.fail = true
    expect(() => writeFileAtomic(target, 'new')).toThrow('EIO')
    expect(readFileSync(target, 'utf-8')).toBe('old')
    expect(readdirSync(dir)).toEqual(['tokens.json'])
  })
})

describe('withFileLock', () => {
  it('reclaims an old lock whose owner has exited', async () => {
    const exited = spawnSync(process.execPath, ['-e', '']).pid
    oldLock(`${exited} 0123456789abcdef`)
    await expect(withFileLock(lock, () => 'ran')).resolves.toBe('ran')
    expect(existsSync(lock)).toBe(false)
  })

  it('reclaims an old lock that never got an owner', async () => {
    oldLock()
    await expect(withFileLock(lock, () => 'ran')).resolves.toBe('ran')
    expect(existsSync(lock)).toBe(false)
  })

  it('keeps an old lock while its owner is still running', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'Date']})
    oldLock(`${process.pid} 0123456789abcdef`)
    const attempt = expect(withFileLock(lock, () => 'ran')).rejects.toBeInstanceOf(FileLockError)
    await vi.advanceTimersByTimeAsync(11_000)
    await attempt
    expect(readFileSync(join(lock, 'owner'), 'utf-8')).toBe(`${process.pid} 0123456789abcdef`)
  })

  it('does not remove a lock that no longer carries its token', async () => {
    await withFileLock(lock, () => writeFileSync(join(lock, 'owner'), 'another holder'))
    expect(readFileSync(join(lock, 'owner'), 'utf-8')).toBe('another holder')
  })

  it('removes its own lock after running', async () => {
    await expect(withFileLock(lock, () => existsSync(join(lock, 'owner')))).resolves.toBe(true)
    expect(readdirSync(dir)).toEqual([])
  })
})
