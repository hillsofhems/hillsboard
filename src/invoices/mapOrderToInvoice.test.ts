import { describe, expect, it } from 'vitest'
import { buildCancellationDraft, mapOrderToInvoice } from './mapOrderToInvoice'
import type { InvoiceRow } from './types'
import {
  ORDERCHAMP_OVERRIDE,
  ORDER_FREE_SHIPPING,
  ORDER_MIXED_RATES,
  ORDER_ORDERCHAMP,
  ORDER_STANDARD,
  ORDER_WITH_DISCOUNT,
  ORDER_WITH_SHIPPING,
  SETTINGS,
  lineItem,
  makeOrder,
  shippingLine,
  tax19,
} from './__fixtures__/orders'

const opts = { settings: SETTINGS, overrides: [ORDERCHAMP_OVERRIDE] }

describe('mapOrderToInvoice', () => {
  it('Standardfall 19 % ohne Versand: Netto aus Steuerzeilen, eine Steuergruppe', () => {
    const { draft, warnings, blockers } = mapOrderToInvoice(ORDER_STANDARD(), opts)

    expect(blockers).toEqual([])
    expect(warnings).toEqual([])
    expect(draft.shopify_order_name).toBe('#1131')
    expect(draft.reverse_charge).toBe(false)
    expect(draft.meta.channel).toBe('onlineshop')
    expect(draft.meta.payment_method).toBe('Shopify Payments')

    expect(draft.lines).toHaveLength(2)
    expect(draft.lines[0]).toMatchObject({
      kind: 'item',
      title: 'Leinen-Servietten 2er-Set',
      variant: 'Hellrosa',
      sku: 'NK-101',
      quantity: 4,
      gross: 79.8,
      tax: 12.74,
      net: 67.06,
      tax_rate: 19,
      discount: 0,
    })
    expect(draft.lines[0].unit_net).toBeCloseTo(16.77, 2)
    expect(draft.lines[1]).toMatchObject({ gross: 14.95, tax: 2.39, net: 12.56, tax_rate: 19 })

    expect(draft.tax_summary).toEqual([{ rate: 19, net: 79.62, tax: 15.13, gross: 94.75 }])
    expect(draft.totals).toEqual({ net: 79.62, tax: 15.13, gross: 94.75, currency: 'EUR', discount: 0 })
    expect(draft.meta.discount_note).toBeNull()

    expect(draft.recipient).toMatchObject({
      name: 'Erika Mustermann',
      company: null,
      address_lines: ['Musterstraße 12', '68159 Mannheim'],
      country_code: 'DE',
      vat_id: null,
      source: 'billing',
    })
  })

  it('mit Versand: Versand als eigene Position mit eigener Steuerzeile', () => {
    const { draft, blockers } = mapOrderToInvoice(ORDER_WITH_SHIPPING(), opts)

    expect(blockers).toEqual([])
    expect(draft.lines).toHaveLength(2)
    expect(draft.lines[0]).toMatchObject({ kind: 'item', gross: 39.9, tax: 6.37, net: 33.53 })
    expect(draft.lines[1]).toMatchObject({
      kind: 'shipping',
      title: 'Versand (Standard)',
      quantity: 1,
      gross: 2.95,
      tax: 0.47,
      net: 2.48,
      tax_rate: 19,
    })
    expect(draft.tax_summary).toEqual([{ rate: 19, net: 36.01, tax: 6.84, gross: 42.85 }])
    expect(draft.totals.gross).toBe(42.85)
    expect(draft.meta.payment_method).toBe('PayPal')
  })

  it('mit Rabattcode (ACROSS): Rabatt kommt aus discountAllocations, Infozeile gesetzt', () => {
    const { draft, warnings, blockers } = mapOrderToInvoice(ORDER_WITH_DISCOUNT(), opts)

    expect(blockers).toEqual([])
    expect(warnings).toEqual([])
    // Versandzeile mit 0 € wird weggelassen
    expect(draft.lines).toHaveLength(2)
    for (const line of draft.lines) {
      expect(line).toMatchObject({ gross: 14.41, tax: 2.3, net: 12.11, discount: 2.54, tax_rate: 19 })
    }
    expect(draft.tax_summary).toEqual([{ rate: 19, net: 24.22, tax: 4.6, gross: 28.82 }])
    expect(draft.totals).toEqual({ net: 24.22, tax: 4.6, gross: 28.82, currency: 'EUR', discount: 5.08 })
    expect(draft.meta.discount_note).toContain('5,08 €')
    expect(draft.meta.discount_note).toContain('1F69KCH87AZF')
    expect(draft.meta.discount_codes).toEqual(['1F69KCH87AZF'])
    expect(draft.meta.payment_method).toBe('Barkauf')
  })

  it('kostenloser Versand per Rabatt: keine Versandposition, Rabatt-Info nennt den Grund', () => {
    const { draft, blockers } = mapOrderToInvoice(ORDER_FREE_SHIPPING(), opts)

    expect(blockers).toEqual([])
    expect(draft.lines).toHaveLength(1)
    expect(draft.lines[0].kind).toBe('item')
    expect(draft.totals).toEqual({ net: 67.06, tax: 12.74, gross: 79.8, currency: 'EUR', discount: 2.95 })
    expect(draft.meta.discount_note).toContain('Kostenloser Versand')
  })

  it('Reverse Charge Orderchamp: Nettopreise, 0 %, Empfänger Orderchamp B.V. mit USt-IdNr.', () => {
    const { draft, blockers } = mapOrderToInvoice(ORDER_ORDERCHAMP(), opts)

    expect(blockers).toEqual([])
    expect(draft.reverse_charge).toBe(true)
    expect(draft.meta.channel).toBe('orderchamp')
    expect(draft.meta.taxes_included).toBe(false)
    expect(draft.meta.payment_method).toBe('Orderchamp')

    // Rechnungsempfänger ist Orderchamp B.V. (Rechnungsadresse), nicht der Händler
    expect(draft.recipient).toMatchObject({
      company: 'Orderchamp B.V.',
      name: '',
      address_lines: ['Korte Leidsedwarsstraat 49A', '1017 PW Amsterdam', 'Niederlande'],
      country_code: 'NL',
      vat_id: 'NL000000000B00',
      email: 'service+nl@orderchamp.com',
    })

    expect(draft.lines).toHaveLength(2)
    expect(draft.lines[0]).toMatchObject({ quantity: 4, unit_net: 7.95, net: 31.8, tax: 0, gross: 31.8, tax_rate: 0 })
    expect(draft.tax_summary).toEqual([{ rate: 0, net: 63.6, tax: 0, gross: 63.6 }])
    expect(draft.totals).toEqual({ net: 63.6, tax: 0, gross: 63.6, currency: 'EUR', discount: 0 })

    // Lieferdatum aus dem ersten Fulfillment (Europe/Berlin)
    expect(draft.delivery_date).toBe('2026-06-08')
    expect(draft.meta.delivery_date_source).toBe('fulfillment')
  })

  it('Reverse Charge ohne USt-IdNr. des Empfängers blockiert die Erstellung', () => {
    const { blockers } = mapOrderToInvoice(ORDER_ORDERCHAMP(), {
      settings: SETTINGS,
      overrides: [{ ...ORDERCHAMP_OVERRIDE, vat_id: null }],
    })
    expect(blockers.some((b) => b.includes('USt-IdNr. des Empfängers'))).toBe(true)
  })

  it('Reverse Charge ohne USt-IdNr. des Ausstellers blockiert die Erstellung', () => {
    const { blockers } = mapOrderToInvoice(ORDER_ORDERCHAMP(), {
      settings: { ...SETTINGS, issuer_vat_id: null },
      overrides: [ORDERCHAMP_OVERRIDE],
    })
    expect(blockers.some((b) => b.includes('USt-IdNr. des Ausstellers'))).toBe(true)
  })

  it('Rundungsfall: 1 Cent Differenz zu totalPrice landet auf der größten Steuergruppe', () => {
    const order = makeOrder({
      total: '42.86', // Positionen ergeben 42.85
      totalTax: '6.84',
      lineItems: [lineItem({ title: 'Servietten', qty: 2, unit: '19.95', tax: [tax19('6.37')] })],
      shippingLines: [shippingLine({ price: '2.95', tax: [tax19('0.47')] })],
    })
    const { draft, warnings, blockers } = mapOrderToInvoice(order, opts)

    expect(blockers).toEqual([])
    expect(warnings.some((w) => w.includes('Rundungsdifferenz'))).toBe(true)
    expect(draft.totals.gross).toBe(42.86)
    expect(draft.tax_summary).toEqual([{ rate: 19, net: 36.02, tax: 6.84, gross: 42.86 }])
    // Zeilen bleiben konsistent zur Gruppe
    const lineGross = draft.lines.reduce((s, l) => s + Math.round(l.gross * 100), 0)
    expect(lineGross).toBe(4286)
  })

  it('Rundungsfall: mehr als 2 Cent Differenz wirft einen Fehler', () => {
    const order = makeOrder({
      total: '42.90',
      totalTax: '6.84',
      lineItems: [lineItem({ title: 'Servietten', qty: 2, unit: '19.95', tax: [tax19('6.37')] })],
      shippingLines: [shippingLine({ price: '2.95', tax: [tax19('0.47')] })],
    })
    expect(() => mapOrderToInvoice(order, opts)).toThrow(/weicht um/)
  })

  it('gemischte Steuersätze: Versand wird je Satz aufgeteilt, 0 % beim DE-Kunden warnt', () => {
    const { draft, warnings, blockers } = mapOrderToInvoice(ORDER_MIXED_RATES(), opts)

    expect(blockers).toEqual([])
    // 2 Positionen + Versand in 2 Teilzeilen
    expect(draft.lines).toHaveLength(4)
    const shipping = draft.lines.filter((l) => l.kind === 'shipping')
    expect(shipping).toHaveLength(2)
    expect(shipping.find((l) => l.tax_rate === 19)).toMatchObject({ gross: 1.57, tax: 0.25, net: 1.32 })
    expect(shipping.find((l) => l.tax_rate === 0)).toMatchObject({ gross: 1.38, tax: 0, net: 1.38 })

    expect(draft.tax_summary).toEqual([
      { rate: 19, net: 13.88, tax: 2.64, gross: 16.52 },
      { rate: 0, net: 14.33, tax: 0, gross: 14.33 },
    ])
    expect(draft.totals.gross).toBe(30.85)

    expect(warnings.some((w) => w.includes('mehrere Steuersätze'))).toBe(true)
    expect(warnings.some((w) => w.includes('Geschirrtuch Basilikum') && w.includes('0 %'))).toBe(true)
  })

  it('nicht bezahlte Bestellung wird blockiert', () => {
    const order = makeOrder({
      total: '14.95',
      totalTax: '2.39',
      financialStatus: 'PENDING',
      lineItems: [lineItem({ title: 'Tuch', qty: 1, unit: '14.95', tax: [tax19('2.39')] })],
    })
    const { blockers } = mapOrderToInvoice(order, opts)
    expect(blockers.some((b) => b.includes('nicht bezahlt'))).toBe(true)
  })

  it('ohne Fulfillment: Lieferdatum null → wird zum Rechnungsdatum', () => {
    const order = makeOrder({
      total: '14.95',
      totalTax: '2.39',
      fulfillments: [],
      lineItems: [lineItem({ title: 'Tuch', qty: 1, unit: '14.95', tax: [tax19('2.39')] })],
    })
    const { draft } = mapOrderToInvoice(order, opts)
    expect(draft.delivery_date).toBeNull()
    expect(draft.meta.delivery_date_source).toBe('issue_date')
  })

  it('Fulfillment spät abends UTC fällt in Europe/Berlin auf den Folgetag', () => {
    const order = makeOrder({
      total: '14.95',
      totalTax: '2.39',
      fulfillments: [{ createdAt: '2026-06-08T22:30:00Z' }],
      lineItems: [lineItem({ title: 'Tuch', qty: 1, unit: '14.95', tax: [tax19('2.39')] })],
    })
    expect(mapOrderToInvoice(order, opts).draft.delivery_date).toBe('2026-06-09')
  })

  it('unvollständige Einstellungen blockieren', () => {
    const { blockers } = mapOrderToInvoice(ORDER_STANDARD(), {
      settings: { ...SETTINGS, issuer_address: '' },
      overrides: [],
    })
    expect(blockers.some((b) => b.includes('Rechnungseinstellungen'))).toBe(true)
  })
})

describe('buildCancellationDraft', () => {
  it('negiert alle Beträge und verweist auf die Originalrechnung', () => {
    const { draft } = mapOrderToInvoice(ORDER_WITH_SHIPPING(), opts)
    const original: InvoiceRow = {
      ...draft,
      id: 'inv-1',
      number: 'HOH-2026-00007',
      type: 'invoice',
      cancels_invoice_id: null,
      issue_date: '2026-09-14',
      delivery_date: draft.delivery_date,
      pdf_path: '2026/HOH-2026-00007.pdf',
      created_by: null,
      created_at: '2026-09-14T10:00:00Z',
    }

    const storno = buildCancellationDraft(original)

    expect(storno.totals).toEqual({ net: -36.01, tax: -6.84, gross: -42.85, currency: 'EUR', discount: 0 })
    expect(storno.lines[1]).toMatchObject({ kind: 'shipping', gross: -2.95, tax: -0.47, net: -2.48 })
    expect(storno.tax_summary).toEqual([{ rate: 19, net: -36.01, tax: -6.84, gross: -42.85 }])
    expect(storno.meta.cancels_number).toBe('HOH-2026-00007')
    expect(storno.meta.cancels_issue_date).toBe('2026-09-14')
    expect(storno.recipient).toEqual(original.recipient)
    // -0 vermeiden
    expect(Object.is(storno.totals.discount, -0)).toBe(false)
  })
})
