import {Flags} from '@oclif/core'
import {BaseCommand} from '../../base-command.js'
import {extractReportGrid} from '../../lib/report-rows.js'

export default class ReportsTrialBalance extends BaseCommand {
  static override description = 'Generate a trial balance report from Xero'

  static override examples = [
    '<%= config.bin %> reports trial-balance',
    '<%= config.bin %> reports trial-balance --date 2025-12-31',
    '<%= config.bin %> reports trial-balance --payments-only --json',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    date: Flags.string({description: 'Report date (YYYY-MM-DD)'}),
    'payments-only': Flags.boolean({description: 'Report on cash transactions only, that is amounts actually paid, rather than the accrual view', default: false}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ReportsTrialBalance)

    const result = await this.xeroCall(flags, async (xero, tenantId) => {
      const response = await xero.accountingApi.getReportTrialBalance(
        tenantId,
        flags.date,
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
      this.log(`${(report.reportDate as string) ?? ''}`)
      this.log('')
    }

    const {columns, rows} = extractReportGrid(report)
    this.outputFormatted(rows, columns, flags)
  }
}
