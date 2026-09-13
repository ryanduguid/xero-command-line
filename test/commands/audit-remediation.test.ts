import {afterEach, describe, expect, it, vi} from 'vitest'
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {BaseCommand} from '../../src/base-command.js'
import TrackingCategoriesCreate from '../../src/commands/tracking/categories/create.js'
import TrackingCategoriesUpdate from '../../src/commands/tracking/categories/update.js'
import TrackingOptionsCreate from '../../src/commands/tracking/options/create.js'
import {journalFileCreateSchema} from '../../src/lib/validators.js'


afterEach(() => vi.restoreAllMocks())

const makeConfig = () => ({runHook: async () => ({successes: []})}) as never

const jsonBlocks = (markdown: string): unknown[] =>
  [...markdown.matchAll(/```json\r?\n([\s\S]*?)```/g)].flatMap((match) => {
    try {
      return [JSON.parse(match[1])]
    } catch {
      return []
    }
  })

// F113: the documented manual journal payload must satisfy the file schema.
describe('documented manual journal example', () => {
  it.each(['README.md', 'SKILL.md'])('%s parses under the file schema', (file) => {
    const journals = jsonBlocks(readFileSync(file, 'utf-8')).filter(
      (block): block is Record<string, unknown> =>
        Boolean(block) && typeof block === 'object' && 'narration' in (block as Record<string, unknown>),
    )
    expect(journals.length).toBeGreaterThan(0)
    for (const journal of journals) {
      const parsed = journalFileCreateSchema.safeParse(journal)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    }
  })
})

// F119: the three tracking commands now accept the documented --file input.
// F116: --csv and --toon reach a create or update command's output.
describe('tracking commands', () => {
  const stubXeroCall = (resource: unknown) =>
    vi.spyOn(BaseCommand.prototype as never, 'xeroCall').mockImplementation(async (_flags, operation) =>
      operation(
        {
          accountingApi: {
            createTrackingCategory: async () => ({body: {trackingCategories: [resource]}}),
            createTrackingOptions: async () => ({body: {options: [resource]}}),
            updateTrackingCategory: async () => ({body: {trackingCategories: [resource]}}),
          },
        } as never,
        'tenant-id',
      ),
    )

  const captureLog = () => {
    const lines: string[] = []
    vi.spyOn(BaseCommand.prototype as never, 'log').mockImplementation((line?: string) => {
      lines.push(String(line ?? ''))
    })
    return lines
  }

  const writeFixture = (contents: unknown): string => {
    const dir = mkdtempSync(join(tmpdir(), 'xero-cli-test-'))
    const file = join(dir, 'payload.json')
    writeFileSync(file, JSON.stringify(contents))
    return file
  }

  it('creates a tracking category from a file', async () => {
    stubXeroCall({name: 'Department', trackingCategoryID: 'cat-1'})
    const lines = captureLog()
    const file = writeFixture({name: 'Department'})
    await new TrackingCategoriesCreate(['--client-id', 'client-id', '--file', file], makeConfig()).run()
    expect(lines.join('\n')).toContain('Tracking category created: Department (cat-1)')
  })

  it('updates a tracking category from a file', async () => {
    stubXeroCall({name: 'Renamed', trackingCategoryID: 'cat-1'})
    const lines = captureLog()
    const file = writeFixture({name: 'Renamed', trackingCategoryId: 'cat-1'})
    await new TrackingCategoriesUpdate(['--client-id', 'client-id', '--file', file], makeConfig()).run()
    expect(lines.join('\n')).toContain('Tracking category updated: Renamed (cat-1)')
  })

  it('creates tracking options from a file', async () => {
    stubXeroCall({name: 'Sales', trackingOptionID: 'opt-1'})
    const lines = captureLog()
    const file = writeFixture({optionNames: ['Sales'], trackingCategoryId: 'cat-1'})
    await new TrackingOptionsCreate(['--client-id', 'client-id', '--file', file], makeConfig()).run()
    expect(lines.join('\n')).toContain('Created 1 tracking option(s) for category cat-1.')
  })

  it('honours --csv and --toon on a create command', async () => {
    stubXeroCall({name: 'Department', trackingCategoryID: 'cat-1'})
    const csvLines = captureLog()
    await new TrackingCategoriesCreate(['--client-id', 'client-id', '--name', 'Department', '--csv'], makeConfig()).run()
    expect(csvLines.join('\n')).toContain('name,trackingCategoryID')
    expect(csvLines.join('\n')).toContain('Department,cat-1')

    vi.restoreAllMocks()
    stubXeroCall({name: 'Department', trackingCategoryID: 'cat-1'})
    const toonLines = captureLog()
    await new TrackingCategoriesCreate(['--client-id', 'client-id', '--name', 'Department', '--toon'], makeConfig()).run()
    const toon = toonLines.join('\n')
    expect(toon).toContain('Department')
    expect(toon).not.toContain('Tracking category created')
  })
})
