import {Flags} from '@oclif/core'
import {BaseCommand} from '../../../base-command.js'
import {trackingCategoryUpdateSchema, formatZodError} from '../../../lib/validators.js'
import type {TrackingCategory} from 'xero-node'

export default class TrackingCategoriesUpdate extends BaseCommand {
  static override description = 'Update a tracking category in Xero'

  static override examples = [
    '<%= config.bin %> tracking categories update --category-id abc-123 --name "Updated Name"',
    '<%= config.bin %> tracking categories update --category-id abc-123 --status ARCHIVED',
    '<%= config.bin %> tracking categories update --file tracking-category.json',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    'category-id': Flags.string({description: 'Tracking category ID'}),
    file: Flags.string({description: 'JSON file with tracking category update data'}),
    name: Flags.string({description: 'New category name'}),
    status: Flags.string({description: 'Category status', options: ['ACTIVE', 'ARCHIVED']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TrackingCategoriesUpdate)

    const fileData = this.readResourceFile(flags.file)
    const parsed = trackingCategoryUpdateSchema.safeParse({
      ...fileData,
      ...(flags['category-id'] === undefined ? {} : {trackingCategoryId: flags['category-id']}),
      ...(flags.name === undefined ? {} : {name: flags.name}),
      ...(flags.status === undefined ? {} : {status: flags.status}),
    })
    if (!parsed.success) {
      this.error(`Validation errors:\n${formatZodError(parsed.error)}`)
    }

    const result = await this.xeroCall(flags, async (xero, tenantId) => {
      const category: TrackingCategory = {
        name: parsed.data.name,
        status: parsed.data.status as TrackingCategory['status'],
      }
      const response = await xero.accountingApi.updateTrackingCategory(tenantId, parsed.data.trackingCategoryId, category)
      return response.body.trackingCategories?.[0]
    })

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2))
    } else if (flags.csv || flags.toon) {
      this.outputResourceRow(result, flags)
    } else {
      const r = result as Record<string, unknown> | undefined
      this.log(`Tracking category updated: ${r?.name} (${r?.trackingCategoryID})`)
    }
  }
}
