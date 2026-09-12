import {afterEach, expect, it, vi} from 'vitest'
import {BaseCommand} from '../../src/base-command.js'
import AccountsUpdate from '../../src/commands/accounts/update.js'
import BankCreate from '../../src/commands/bank-transactions/create.js'
import BankList from '../../src/commands/bank-transactions/list.js'
import ItemsList from '../../src/commands/items/list.js'
import JournalsList from '../../src/commands/manual-journals/list.js'
import OptionsUpdate from '../../src/commands/tracking/options/update.js'
import OptionsCreate from '../../src/commands/tracking/options/create.js'
import PaymentsCreate from '../../src/commands/payments/create.js'

afterEach(() => vi.restoreAllMocks())
const config = {runHook: vi.fn().mockResolvedValue({successes: []})} as never

function setup(flags: Record<string, unknown>, result: unknown) {
  const prototype = BaseCommand.prototype as any
  vi.spyOn(prototype, 'parse').mockResolvedValue({flags})
  const log = vi.spyOn(prototype, 'log').mockImplementation(() => {})
  const call = vi.spyOn(prototype, 'xeroCall').mockResolvedValue(result)
  return {log, call, prototype}
}

it.each(['csv', 'toon'])('uses %s output after updating an account', async format => {
  const {log} = setup({[format]: true, 'account-id': 'synthetic', name: 'Updated'}, {accountID: 'synthetic', name: 'Updated'})
  await new AccountsUpdate([], config).run()
  expect(log).toHaveBeenCalledOnce()
  expect(log.mock.calls[0][0]).toContain('Updated')
  expect(log.mock.calls[0][0]).not.toContain('Account updated:')
})

it.each(['csv', 'toon'])('uses %s output after creating a bank transaction', async format => {
  const {log, prototype} = setup({[format]: true, file: 'synthetic.json'}, {resource: {bankTransactionID: 'synthetic'}, shortCode: 'short'})
  vi.spyOn(prototype, 'readJsonFile').mockReturnValue({type: 'SPEND', lineItems: [{}]})
  await new BankCreate([], config).run()
  expect(log).toHaveBeenCalledOnce()
  expect(log.mock.calls[0][0]).toContain('https://go.xero.com/')
  expect(log.mock.calls[0][0]).not.toContain('Bank transaction created:')
})

it('does not add prose to a detailed TOON transaction', async () => {
  const {log} = setup({toon: true, 'bank-transaction-id': '00000000-0000-0000-0000-000000000000'}, [{bankTransactionID: 'synthetic'}])
  await new BankList([], config).run()
  expect(log).toHaveBeenCalledOnce()
})

it.each(['not-a-date', '2025-02-29', '2026-04-31'])('refuses an invalid modified-after date %s before requesting data', async date => {
  const {call} = setup({'modified-after': date}, [])
  await expect(new JournalsList([], config).run()).rejects.toThrow('--modified-after')
  expect(call).not.toHaveBeenCalled()
})

it('does not send pagination as item decimal precision', async () => {
  const {call} = setup({}, [])
  const getItems = vi.fn(async () => ({body: {items: []}}))
  call.mockImplementation(async (_flags, operation) => operation({accountingApi: {getItems}}, 'tenant'))
  await new ItemsList([], config).run()
  expect(getItems).toHaveBeenCalledWith('tenant')
  expect(ItemsList.flags).not.toHaveProperty('page')
})

it.each([null, [], 'text', 42])('refuses primitive or array tracking data %s before requesting changes', async data => {
  const {call, prototype} = setup({file: 'synthetic.json', 'category-id': 'synthetic'}, [])
  vi.spyOn(prototype, 'readJsonFile').mockReturnValue(data)
  await expect(new OptionsUpdate([], config).run()).rejects.toThrow('expected an object')
  expect(call).not.toHaveBeenCalled()
})

it('omits blank tracking options', async () => {
  const {call} = setup({'category-id': 'synthetic', names: ' Alpha, ,Beta, '}, [])
  const createTrackingOptions = vi.fn(async () => ({body: {options: []}}))
  call.mockImplementation(async (_flags, operation) => operation({accountingApi: {createTrackingOptions}}, 'tenant'))
  await new OptionsCreate([], config).run()
  expect(createTrackingOptions.mock.calls.map(call => call[2])).toEqual([{name: 'Alpha'}, {name: 'Beta'}])
})

it.each(['ACCREC', 'ACCPAY'])('links a payment to its related %s invoice, using the invoice identifier', async type => {
  const {log} = setup({'invoice-id': 'synthetic-invoice', 'account-id': 'synthetic-account', amount: '1'}, {
    resource: {paymentID: 'synthetic-payment', invoice: {invoiceID: 'synthetic-invoice', type}}, shortCode: 'short',
  })
  await new PaymentsCreate([], config).run()
  const link = String(log.mock.calls[1][0])
  expect(link).toContain('synthetic-invoice')
  expect(link).not.toContain('synthetic-payment')
  expect(link).not.toContain('bankTransactionID')
})
