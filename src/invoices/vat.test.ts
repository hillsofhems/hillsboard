import { describe, expect, it } from 'vitest'
import { defaultPeriod, invoicesInPeriod, periodRange, summarizeVat } from './vat'
import type { InvoiceRow } from './types'

function row(p: {
  number: string
  issue_date: string
  type?: InvoiceRow['type']
  reverse_charge?: boolean
  tax_summary: Array<{ rate: number; net: number; tax: number; gross: number }>
}): InvoiceRow {
  const net = p.tax_summary.reduce((s, g) => s + g.net, 0)
  const tax = p.tax_summary.reduce((s, g) => s + g.tax, 0)
  const gross = p.tax_summary.reduce((s, g) => s + g.gross, 0)
  return {
    id: p.number,
    number: p.number,
    type: p.type ?? 'invoice',
    shopify_order_id: 'gid://shopify/Order/1',
    shopify_order_name: '#1',
    cancels_invoice_id: null,
    issue_date: p.issue_date,
    delivery_date: p.issue_date,
    recipient: { name: 'X', company: null, address_lines: [], country_code: 'DE', vat_id: null, email: null, source: 'billing' },
    lines: [],
    tax_summary: p.tax_summary,
    totals: { net: Math.round(net * 100) / 100, tax: Math.round(tax * 100) / 100, gross: Math.round(gross * 100) / 100, currency: 'EUR', discount: 0 },
    reverse_charge: p.reverse_charge ?? false,
    meta: {
      channel: 'onlineshop',
      order_date: p.issue_date,
      order_email: null,
      customer_email: null,
      customer_name: null,
      payment_gateways: [],
      payment_method: null,
      taxes_included: true,
      delivery_date_source: 'fulfillment',
      discount_codes: [],
      discount_note: null,
      refunds: [],
      total_refunded: 0,
      financial_status: 'PAID',
      warnings: [],
    },
    pdf_path: null,
    created_by: null,
    created_at: p.issue_date,
  }
}

describe('periodRange', () => {
  it('Monat, Quartal und Jahr inkl. Jahreswechsel', () => {
    expect(periodRange({ kind: 'month', value: '2026-12' })).toEqual({ from: '2026-12-01', to: '2027-01-01', label: 'Dezember 2026' })
    expect(periodRange({ kind: 'quarter', value: '2026-Q4' })).toEqual({ from: '2026-10-01', to: '2027-01-01', label: 'Q4 2026' })
    expect(periodRange({ kind: 'quarter', value: '2026-Q1' })).toEqual({ from: '2026-01-01', to: '2026-04-01', label: 'Q1 2026' })
    expect(periodRange({ kind: 'year', value: '2026' })).toEqual({ from: '2026-01-01', to: '2027-01-01', label: '2026' })
  })

  it('defaultPeriod aus dem heutigen Datum', () => {
    expect(defaultPeriod('month', '2026-09-16')).toEqual({ kind: 'month', value: '2026-09' })
    expect(defaultPeriod('quarter', '2026-09-16')).toEqual({ kind: 'quarter', value: '2026-Q3' })
    expect(defaultPeriod('year', '2026-09-16')).toEqual({ kind: 'year', value: '2026' })
  })
})

describe('summarizeVat', () => {
  const rows = [
    row({ number: 'HOH-2026-00001', issue_date: '2026-09-02', tax_summary: [{ rate: 19, net: 104.74, tax: 19.91, gross: 124.65 }] }),
    row({ number: 'HOH-2026-00002', issue_date: '2026-09-10', reverse_charge: true, tax_summary: [{ rate: 0, net: 63.6, tax: 0, gross: 63.6 }] }),
    row({
      number: 'HOH-2026-00003',
      issue_date: '2026-09-12',
      tax_summary: [
        { rate: 19, net: 13.88, tax: 2.64, gross: 16.52 },
        { rate: 0, net: 14.33, tax: 0, gross: 14.33 },
      ],
    }),
    // Storno von 00003 im selben Monat: hebt sich auf
    row({
      number: 'HOH-2026-00004',
      issue_date: '2026-09-13',
      type: 'cancellation',
      tax_summary: [
        { rate: 19, net: -13.88, tax: -2.64, gross: -16.52 },
        { rate: 0, net: -14.33, tax: 0, gross: -14.33 },
      ],
    }),
    row({ number: 'HOH-2026-00005', issue_date: '2026-10-01', tax_summary: [{ rate: 19, net: 100, tax: 19, gross: 119 }] }),
  ]

  it('gruppiert nach Steuersatz, verrechnet Stornos, weist Reverse Charge getrennt aus', () => {
    const sept = invoicesInPeriod(rows, { kind: 'month', value: '2026-09' })
    expect(sept.map((r) => r.number)).toEqual(['HOH-2026-00001', 'HOH-2026-00002', 'HOH-2026-00003', 'HOH-2026-00004'])

    const s = summarizeVat(sept)
    expect(s.invoices).toBe(3)
    expect(s.cancellations).toBe(1)
    expect(s.byRate).toEqual([
      { rate: 19, count: 3, net: 104.74, tax: 19.91, gross: 124.65 },
      { rate: 0, count: 3, net: 63.6, tax: 0, gross: 63.6 },
    ])
    expect(s.reverseCharge).toEqual({ count: 1, net: 63.6 })
    expect(s.totals).toEqual({ net: 168.34, tax: 19.91, gross: 188.25 })
  })

  it('Quartal umfasst beide Monate', () => {
    const q3 = summarizeVat(invoicesInPeriod(rows, { kind: 'quarter', value: '2026-Q3' }))
    const q4 = summarizeVat(invoicesInPeriod(rows, { kind: 'quarter', value: '2026-Q4' }))
    expect(q3.totals.tax).toBe(19.91)
    expect(q4.totals).toEqual({ net: 100, tax: 19, gross: 119 })
  })

  it('leerer Zeitraum liefert Nullen', () => {
    const s = summarizeVat(invoicesInPeriod(rows, { kind: 'month', value: '2025-01' }))
    expect(s).toEqual({
      invoices: 0,
      cancellations: 0,
      byRate: [],
      reverseCharge: { count: 0, net: 0 },
      totals: { net: 0, tax: 0, gross: 0 },
    })
  })
})
