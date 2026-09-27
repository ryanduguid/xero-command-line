import {randomBytes} from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {join} from 'node:path'

const RENAME_RETRIES = 3
const LOCK_STALE_MS = 10_000
const LOCK_TIMEOUT_MS = 10_000
const OWNER_FILE = 'owner'
// Windows can refuse a delete while another process briefly holds a handle.
const RM_OPTIONS = {recursive: true, force: true, maxRetries: 5, retryDelay: 20}

export class FileLockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileLockError'
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code
}

/** Synchronous sleep that does not depend on an event loop turn. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Write `contents` to `path` atomically: write to a unique temp file in the same
 * directory, fsync it, then rename over the target. Readers observe either the
 * old file or the new one, never a partially written file. writeFileSync keeps
 * writing until every byte is down, and a failure at any step removes the temp
 * file, which holds the same data as the target.
 */
export function writeFileAtomic(path: string, contents: string, mode = 0o600): void {
  const tmpPath = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    const fd = openSync(tmpPath, 'w', mode)
    try {
      writeFileSync(fd, contents)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameWithRetry(tmpPath, path)
  } catch (error) {
    try {
      rmSync(tmpPath, {force: true})
    } catch {
      // Keep the original failure; a leftover temp file is the lesser problem.
    }
    throw error
  }
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      const code = errorCode(error)
      // Windows can refuse to replace a file another process has open. Retry briefly.
      const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!retryable || attempt >= RENAME_RETRIES) throw error
      sleepSync(20 * attempt)
    }
  }
}

/**
 * Run `fn` while holding a cross-process lock at `lockPath`.
 *
 * The lock is a directory: mkdir is atomic on every platform and fails with EEXIST
 * while another process holds it. The holder writes its pid and a random token
 * into it. A lock is reclaimed only once it is older than LOCK_STALE_MS and its
 * owner has exited or never wrote the owner file, so a slow holder keeps its
 * lock, and release removes the lock only while it still carries this call's
 * token.
 */
export async function withFileLock<T>(lockPath: string, fn: () => T | Promise<T>): Promise<T> {
  const token = `${process.pid} ${randomBytes(8).toString('hex')}`
  const start = Date.now()

  for (;;) {
    try {
      mkdirSync(lockPath)
      break
    } catch (error) {
      const code = errorCode(error)
      // Windows answers EPERM, not EEXIST, while a released lock is still being deleted.
      if (code !== 'EEXIST' && !(code === 'EPERM' && process.platform === 'win32')) throw error
      if (code === 'EEXIST' && reclaimAbandonedLock(lockPath)) continue

      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new FileLockError(
          `Timed out waiting for lock ${lockPath}. If no other xero process is running, remove it and retry.`,
        )
      }

      await sleep(10 + Math.floor(Math.random() * 40))
    }
  }

  try {
    writeFileSync(join(lockPath, OWNER_FILE), token, {mode: 0o600})
  } catch (error) {
    rmSync(lockPath, RM_OPTIONS)
    throw error
  }

  try {
    return await fn()
  } finally {
    if (readOwner(lockPath) === token) rmSync(lockPath, RM_OPTIONS)
  }
}

/**
 * Remove `lockPath` if its holder is gone, returning true when it did.
 *
 * Reclaimers take a guard directory and check again under it, so one that judged
 * the lock abandoned cannot delete a lock another reclaimer has just taken.
 */
function reclaimAbandonedLock(lockPath: string): boolean {
  if (!isAbandoned(lockPath)) return false
  const guard = `${lockPath}.reclaim`
  try {
    mkdirSync(guard)
  } catch {
    // Another process is reclaiming. A guard left behind by a crash is cleared by age.
    if (olderThan(guard, LOCK_STALE_MS)) rmSync(guard, RM_OPTIONS)
    return false
  }

  try {
    if (!isAbandoned(lockPath)) return false
    rmSync(lockPath, RM_OPTIONS)
    return true
  } finally {
    rmSync(guard, RM_OPTIONS)
  }
}

function isAbandoned(lockPath: string): boolean {
  if (!olderThan(lockPath, LOCK_STALE_MS)) return false
  const owner = readOwner(lockPath)
  // An owner file that exists but cannot be read belongs to a live lock until proven otherwise.
  if (owner === undefined) return false
  if (owner === null) return true
  return !isRunning(Number(owner.split(' ')[0]))
}

function olderThan(path: string, ms: number): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > ms
  } catch {
    // Gone between the failed mkdir and the stat: released, not stale.
    return false
  }
}

/** The lock's owner token, null when it has no owner file, undefined when that file cannot be read. */
function readOwner(lockPath: string): string | null | undefined {
  try {
    return readFileSync(join(lockPath, OWNER_FILE), 'utf-8')
  } catch (error) {
    return errorCode(error) === 'ENOENT' ? null : undefined
  }
}

function isRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return errorCode(error) === 'EPERM'
  }
}
