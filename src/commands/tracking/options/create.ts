import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {trackingOptionsCreateSchema, formatZodError} from '../../../lib/validators.js'
import type {TrackingOption} from 'xero-node'

export default class TrackingOptionsCreate extends BaseCommand {
  static override description = 'Create tracking options for a category in Xero'

  static override examples = [
    '<%= config.bin %> tracking options create --category-id abc-123 --names "Sales,Marketing,Engineering"',
    '<%= config.bin %> tracking options create --file tracking-options.json',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    'category-id': Flags.string({description: 'Tracking category ID'}),
    file: Flags.string({description: 'JSON file with tracking options data'}),
    names: Flags.string({description: 'Comma-separated option names'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TrackingOptionsCreate)

    const fileData = this.readResourceFile(flags.file)
    const optionNames = flags.names === undefined
      ? undefined
      : flags.names.split(',').map(n => n.trim()).filter(Boolean)

    const parsed = trackingOptionsCreateSchema.safeParse({
      ...fileData,
      ...(flags['category-id'] === undefined ? {} : {trackingCategoryId: flags['category-id']}),
      ...(optionNames === undefined ? {} : {optionNames}),
    })
    if (!parsed.success) {
      this.error(`Validation errors:\n${formatZodError(parsed.error)}`)
    }

    const results: unknown[] = []
    await this.xeroCall(flags, async (xero, tenantId) => {
      for (const name of parsed.data.optionNames) {
        const option: TrackingOption = {name}
        const response = await xero.accountingApi.createTrackingOptions(
          tenantId,
          parsed.data.trackingCategoryId,
          option,
        )
        if (response.body.options) {
          results.push(...response.body.options)
        }
      }
    })

    if (flags.json) {
      this.log(JSON.stringify(results, null, 2))
    } else if (flags.csv || flags.toon) {
      this.outputResourceRow(results, flags)
    } else {
      this.log(`Created ${results.length} tracking option(s) for category ${parsed.data.trackingCategoryId}.`)
    }
  }
}
