import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {extractReportGrid} from '../../lib/report-rows.js'

export default class ReportsProfitAndLoss extends BaseCommand {
  static override description = 'Generate a profit and loss report from Xero'

  static override examples = [
    '<%= config.bin %> reports profit-and-loss',
    '<%= config.bin %> reports profit-and-loss --from 2025-01-01 --to 2025-12-31',
    '<%= config.bin %> reports profit-and-loss --timeframe QUARTER --periods 4',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    from: Flags.string({description: 'Start date (YYYY-MM-DD)'}),
    to: Flags.string({description: 'End date (YYYY-MM-DD)'}),
    periods: Flags.integer({description: 'Number of periods to compare'}),
    timeframe: Flags.string({description: 'Timeframe', options: ['MONTH', 'QUARTER', 'YEAR']}),
    'payments-only': Flags.boolean({description: 'Report on cash transactions only, that is amounts actually paid, rather than the accrual view', default: false}),
    'standard-layout': Flags.boolean({description: 'Use standard layout', default: false}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ReportsProfitAndLoss)

    const result = await this.xeroCall(flags, async (xero, tenantId) => {
      const response = await xero.accountingApi.getReportProfitAndLoss(
        tenantId,
        flags.from,
        flags.to,
        flags.periods,
        flags.timeframe as 'MONTH' | 'QUARTER' | 'YEAR' | undefined,
        undefined, // tracking category ID
        undefined, // tracking option ID
        undefined, // tracking category ID 2
        undefined, // tracking option ID 2
        flags['standard-layout'] || undefined,
        flags['payments-only'] || undefined,
      )
      return response.body.reports?.[0]
    })

    if (flags.json) {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const report = result as Record<string, unknown> | undefined
    if (!report) {
      this.log('No report data returned.')
      return
    }

    if (!flags.csv && !flags.toon) {
      this.log(`\n${report.reportName as string}`)
      this.log('')
    }

    const {columns, rows} = extractReportGrid(report, {sectionTitles: true})
    this.outputFormatted(rows, columns, flags)
  }
}
