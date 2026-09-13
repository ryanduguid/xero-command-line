import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {extractReportGrid} from '../../lib/report-rows.js'

export default class ReportsBalanceSheet extends BaseCommand {
  static override description = 'Generate a balance sheet report from Xero'

  static override examples = [
    '<%= config.bin %> reports balance-sheet',
    '<%= config.bin %> reports balance-sheet --date 2025-12-31',
    '<%= config.bin %> reports balance-sheet --timeframe QUARTER --periods 4',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    date: Flags.string({description: 'Report date (YYYY-MM-DD)'}),
    periods: Flags.integer({description: 'Number of periods to compare'}),
    timeframe: Flags.string({description: 'Timeframe', options: ['MONTH', 'QUARTER', 'YEAR']}),
    'payments-only': Flags.boolean({description: 'Report on cash transactions only, that is amounts actually paid, rather than the accrual view', default: false}),
    'standard-layout': Flags.boolean({description: 'Use standard layout', default: false}),
    'tracking-option-id-1': Flags.string({description: 'Tracking option ID 1'}),
    'tracking-option-id-2': Flags.string({description: 'Tracking option ID 2'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ReportsBalanceSheet)

    const result = await this.xeroCall(flags, async (xero, tenantId) => {
      const response = await xero.accountingApi.getReportBalanceSheet(
        tenantId,
        flags.date,
        flags.periods,
        flags.timeframe as 'MONTH' | 'QUARTER' | 'YEAR' | undefined,
        flags['tracking-option-id-1'],
        flags['tracking-option-id-2'],
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
