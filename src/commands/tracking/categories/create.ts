import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {trackingCategoryCreateSchema, formatZodError} from '../../../lib/validators.js'
import type {TrackingCategory} from 'xero-node'

export default class TrackingCategoriesCreate extends BaseCommand {
  static override description = 'Create a tracking category in Xero'

  static override examples = [
    '<%= config.bin %> tracking categories create --name "Department"',
    '<%= config.bin %> tracking categories create --file tracking-category.json',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({description: 'JSON file with tracking category data'}),
    name: Flags.string({description: 'Category name'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TrackingCategoriesCreate)

    const fileData = this.readResourceFile(flags.file)
    const parsed = trackingCategoryCreateSchema.safeParse({
      ...fileData,
      ...(flags.name === undefined ? {} : {name: flags.name}),
    })
    if (!parsed.success) {
      this.error(`Validation errors:\n${formatZodError(parsed.error)}`)
    }

    const result = await this.xeroCall(flags, async (xero, tenantId) => {
      const category: TrackingCategory = {name: parsed.data.name}
      const response = await xero.accountingApi.createTrackingCategory(tenantId, category)
      return response.body.trackingCategories?.[0]
    })

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2))
    } else if (flags.csv || flags.toon) {
      this.outputResourceRow(result, flags)
    } else {
      const r = result as Record<string, unknown> | undefined
      this.log(`Tracking category created: ${r?.name} (${r?.trackingCategoryID})`)
    }
  }
}
