import {describe, expect, it} from 'vitest'
import {extractAgedReport, extractReportGrid} from '../../src/lib/report-rows.js'

const cells = (...values: unknown[]) => ({cells: values.map((value) => ({value}))})

// F114: the aged reports must place the monetary values under their own headings.
describe('aged report extraction', () => {
  const report = {
    reportName: 'Aged Payables by Contact',
    rows: [
      {
        rowType: 'Header',
        ...cells('Date', 'Reference', 'Due Date', '', 'Total', 'Paid', 'Credited', 'Due'),
      },
      {
        rowType: 'Section',
        rows: [cells('2026-01-01', 'INV-001', '2026-01-31', '', 100, 25, 5, 70)],
      },
    ],
  }

  it('maps the eight documented columns', () => {
    const {columns, rows} = extractAgedReport(report)
    expect(columns.map((column) => column.header)).toEqual([
      'Date',
      'Reference',
      'Due Date',
      'Total',
      'Paid',
      'Credited',
      'Due',
    ])
    expect(rows).toEqual([
      {
        credited: 5,
        date: '2026-01-01',
        due: 70,
        dueDate: '2026-01-31',
        paid: 25,
        reference: 'INV-001',
        total: 100,
      },
    ])
  })

  it('falls back to the documented positions when the header row is absent', () => {
    const {rows} = extractAgedReport({
      rows: [{rowType: 'Section', rows: [cells('2026-01-01', 'INV-001', '2026-01-31', '', 100, 25, 5, 70)]}],
    })
    expect(rows[0]).toMatchObject({credited: 5, due: 70, paid: 25, total: 100})
  })
})

// F115: comparison and year-to-date columns must survive rendering.
describe('report grid extraction', () => {
  it('keeps every comparison column with its period heading', () => {
    const {columns, rows} = extractReportGrid(
      {
        rows: [
          {rowType: 'Header', ...cells('Account', '30 Jun 2026', '30 Jun 2025')},
          {rowType: 'Section', title: 'Assets', rows: [cells('Bank', 111.11, 222.22)]},
        ],
      },
      {sectionTitles: true},
    )

    expect(columns.map((column) => column.header)).toEqual(['Account', '30 Jun 2026', '30 Jun 2025'])
    expect(rows).toEqual([
      {account: '--- Assets ---', column1: '', column2: ''},
      {account: 'Bank', column1: 111.11, column2: 222.22},
    ])
  })

  it('keeps the trial balance year-to-date pair', () => {
    const {columns, rows} = extractReportGrid({
      rows: [
        {rowType: 'Header', ...cells('Account', 'Debit', 'Credit', 'YTD Debit', 'YTD Credit')},
        {rowType: 'Section', rows: [cells('Sales', '', 20, '', 200)]},
      ],
    })

    expect(columns.map((column) => column.header)).toEqual([
      'Account',
      'Debit',
      'Credit',
      'YTD Debit',
      'YTD Credit',
    ])
    expect(rows[0]).toEqual({account: 'Sales', column1: '', column2: 20, column3: '', column4: 200})
  })

  it('labels a single amount column when the report supplies no headings', () => {
    const {columns} = extractReportGrid({rows: [{rowType: 'Section', rows: [cells('Bank', 10)]}]})
    expect(columns.map((column) => column.header)).toEqual(['Account', 'Amount'])
  })
})
