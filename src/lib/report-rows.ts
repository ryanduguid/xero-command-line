import {formatCurrency, formatDate} from './formatters.js'

export type ReportColumn = {key: string; header: string; format?: (value: unknown) => string}

type Cell = Record<string, unknown>

const cellsOf = (row: unknown): Cell[] => ((row as Record<string, unknown>)?.cells ?? []) as Cell[]

const headingsOf = (sections: Array<Record<string, unknown>>): string[] => {
  const headerRow = sections.find((section) => section.rowType === 'Header')
  return cellsOf(headerRow).map((cell) => String(cell?.value ?? '').trim())
}

export function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const numeric = Number(value)
  return Number.isNaN(numeric) ? String(value) : formatCurrency(numeric)
}

/**
 * Flattens a Xero report into rows that keep every column the API returned,
 * labelled with the period headings from the report's own header row. A
 * comparison request therefore renders its comparison columns instead of only
 * the first amount.
 */
export function extractReportGrid(
  report: Record<string, unknown>,
  options: {sectionTitles?: boolean} = {},
): {columns: ReportColumn[]; rows: Record<string, unknown>[]} {
  const sections = (report.rows ?? []) as Array<Record<string, unknown>>
  const headings = headingsOf(sections)

  const entries: Array<{cells?: Cell[]; title?: string}> = []
  let widest = 0

  for (const section of sections) {
    if (section.rowType === 'Header') continue
    if (options.sectionTitles && section.title) entries.push({title: String(section.title)})
    for (const row of (section.rows ?? []) as Array<Record<string, unknown>>) {
      const cells = cellsOf(row)
      if (cells.length === 0) continue
      widest = Math.max(widest, cells.length)
      entries.push({cells})
    }
  }

  const width = Math.max(headings.length, widest, 1)
  const columns: ReportColumn[] = []
  for (let index = 0; index < width; index++) {
    const heading = headings[index] ?? ''
    if (index === 0) {
      columns.push({key: 'account', header: heading || 'Account'})
      continue
    }
    columns.push({
      format: formatAmount,
      header: heading || (width === 2 ? 'Amount' : `Amount ${index}`),
      key: `column${index}`,
    })
  }

  const rows = entries.map((entry) => {
    if (entry.title !== undefined) {
      const row: Record<string, unknown> = {account: `--- ${entry.title} ---`}
      for (const column of columns.slice(1)) row[column.key] = ''
      return row
    }
    const row: Record<string, unknown> = {}
    columns.forEach((column, index) => {
      row[column.key] = entry.cells?.[index]?.value ?? ''
    })
    return row
  })

  return {columns, rows}
}

/**
 * Aged payables and receivables by contact return eight columns: Date,
 * Reference, Due Date, a blank column, Total, Paid, Credited and Due. The
 * headings in the report decide the mapping, with those documented positions
 * as the fallback.
 */
export function extractAgedReport(report: Record<string, unknown>): {
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
} {
  const sections = (report.rows ?? []) as Array<Record<string, unknown>>
  const headings = headingsOf(sections).map((heading) => heading.toLowerCase())

  const indexOf = (heading: string, fallback: number): number => {
    const found = headings.indexOf(heading)
    return found === -1 ? fallback : found
  }

  const positions = {
    credited: indexOf('credited', 6),
    date: indexOf('date', 0),
    due: indexOf('due', 7),
    dueDate: indexOf('due date', 2),
    paid: indexOf('paid', 5),
    reference: indexOf('reference', 1),
    total: indexOf('total', 4),
  }

  const columns: ReportColumn[] = [
    {format: (v) => formatDate(v), header: 'Date', key: 'date'},
    {header: 'Reference', key: 'reference'},
    {format: (v) => formatDate(v), header: 'Due Date', key: 'dueDate'},
    {format: formatAmount, header: 'Total', key: 'total'},
    {format: formatAmount, header: 'Paid', key: 'paid'},
    {format: formatAmount, header: 'Credited', key: 'credited'},
    {format: formatAmount, header: 'Due', key: 'due'},
  ]

  const required = Math.max(...Object.values(positions)) + 1
  const rows: Record<string, unknown>[] = []

  for (const section of sections) {
    if (section.rowType === 'Header') continue
    for (const row of (section.rows ?? []) as Array<Record<string, unknown>>) {
      const cells = cellsOf(row)
      if (cells.length < required) continue
      rows.push({
        credited: cells[positions.credited]?.value,
        date: cells[positions.date]?.value,
        due: cells[positions.due]?.value,
        dueDate: cells[positions.dueDate]?.value,
        paid: cells[positions.paid]?.value,
        reference: cells[positions.reference]?.value,
        total: cells[positions.total]?.value,
      })
    }
  }

  return {columns, rows}
}
