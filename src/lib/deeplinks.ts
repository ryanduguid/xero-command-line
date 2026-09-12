export const contactDeepLink = (shortCode: string, contactId: string) =>
  `https://go.xero.com/app/${encodeURIComponent(shortCode)}/contacts/contact/${encodeURIComponent(contactId)}`

export const invoiceDeepLink = (shortCode: string, invoiceId: string) =>
  `https://go.xero.com/app/${encodeURIComponent(shortCode)}/invoicing/view/${encodeURIComponent(invoiceId)}`

export const billDeepLink = (shortCode: string, billId: string) =>
  `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(shortCode)}&redirecturl=${encodeURIComponent(`/AccountsPayable/Edit.aspx?InvoiceID=${encodeURIComponent(billId)}`)}`

export const creditNoteDeepLink = (shortCode: string, creditNoteId: string) =>
  `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(shortCode)}&redirecturl=${encodeURIComponent(`/AccountsPayable/ViewCreditNote.aspx?creditNoteID=${encodeURIComponent(creditNoteId)}`)}`

export const quoteDeepLink = (shortCode: string, quoteId: string) =>
  `https://go.xero.com/app/${encodeURIComponent(shortCode)}/quotes/view/${encodeURIComponent(quoteId)}`

export const bankTransactionDeepLink = (shortCode: string, bankTransactionId: string) =>
  `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(shortCode)}&redirecturl=${encodeURIComponent(`/Bank/ViewTransaction.aspx?bankTransactionID=${encodeURIComponent(bankTransactionId)}`)}`
