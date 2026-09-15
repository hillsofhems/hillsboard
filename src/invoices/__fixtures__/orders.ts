// Test-Fixtures: Bestellungen nach dem Muster echter Shopify-Antworten
// (Struktur aus dem Hills-of-Hems-Shop, Personen-/Adressdaten anonymisiert).
import type {
  InvoiceCustomerOverride,
  InvoiceSettings,
  ShopifyAddress,
  ShopifyDiscountApplication,
  ShopifyLineItem,
  ShopifyMoneyBag,
  ShopifyOrder,
  ShopifyShippingLine,
  ShopifyTaxLine,
} from '../types'

export const money = (amount: string | number): ShopifyMoneyBag => ({
  shopMoney: { amount: typeof amount === 'number' ? amount.toFixed(2) : amount, currencyCode: 'EUR' },
})

export const tax19 = (amount: string | number): ShopifyTaxLine => ({
  rate: 0.19,
  ratePercentage: 19,
  title: 'DE MwSt',
  priceSet: money(amount),
})

export const tax7 = (amount: string | number): ShopifyTaxLine => ({
  rate: 0.07,
  ratePercentage: 7,
  title: 'DE MwSt',
  priceSet: money(amount),
})

export const tax0 = (amount: string | number = '0.0', title = 'DE MwSt'): ShopifyTaxLine => ({
  rate: 0,
  ratePercentage: 0,
  title,
  priceSet: money(amount),
})

export const DE_ADDRESS: ShopifyAddress = {
  firstName: 'Erika',
  lastName: 'Mustermann',
  name: 'Erika Mustermann',
  company: null,
  address1: 'Musterstraße 12',
  address2: null,
  zip: '68159',
  city: 'Mannheim',
  province: null,
  provinceCode: null,
  country: 'Germany',
  countryCodeV2: 'DE',
  phone: null,
}

/** Rechnungsadresse der Orderchamp-Bestellungen (Marktplatzbetreiber, öffentliche Firmenadresse). */
export const ORDERCHAMP_ADDRESS: ShopifyAddress = {
  firstName: null,
  lastName: 'Orderchamp B.V.',
  name: 'Orderchamp B.V.',
  company: 'Orderchamp B.V.',
  address1: 'Korte Leidsedwarsstraat 49A',
  address2: null,
  zip: '1017 PW',
  city: 'Amsterdam',
  province: null,
  provinceCode: null,
  country: 'Netherlands',
  countryCodeV2: 'NL',
  phone: null,
}

/** Lieferadresse eines (anonymisierten) NL-Händlers bei Orderchamp. */
export const NL_RETAILER_ADDRESS: ShopifyAddress = {
  firstName: 'Anna',
  lastName: 'de Vries',
  name: 'Anna de Vries',
  company: 'Winkel van Anna',
  address1: 'Voorbeeldweg 1',
  address2: null,
  zip: '9761 AA',
  city: 'Eelde',
  province: null,
  provinceCode: null,
  country: 'Netherlands',
  countryCodeV2: 'NL',
  phone: null,
}

let idCounter = 1000

export function lineItem(p: {
  title: string
  variant?: string | null
  sku?: string | null
  qty: number
  unit: string | number
  tax: ShopifyTaxLine[]
  /** Auf die Position entfallende Rabatt-Allocations (Beträge). */
  allocations?: Array<{ amount: string | number; app?: Partial<ShopifyDiscountApplication> }>
}): ShopifyLineItem {
  const unitCents = Math.round(Number(p.unit) * 100)
  const originalTotal = (unitCents * p.qty) / 100
  return {
    id: `gid://shopify/LineItem/${idCounter++}`,
    title: p.title,
    variantTitle: p.variant === undefined ? 'Default Title' : p.variant,
    sku: p.sku ?? null,
    quantity: p.qty,
    currentQuantity: p.qty,
    originalUnitPriceSet: money(p.unit),
    originalTotalSet: money(originalTotal),
    discountedTotalSet: money(originalTotal), // Shopify: enthält KEINE Bestellrabatte
    totalDiscountSet: money(0),
    discountAllocations: (p.allocations ?? []).map((a) => ({
      allocatedAmountSet: money(a.amount),
      discountApplication: {
        allocationMethod: 'ACROSS',
        targetType: 'LINE_ITEM',
        targetSelection: 'ALL',
        ...a.app,
      },
    })),
    taxLines: p.tax,
  }
}

export function shippingLine(p: {
  title?: string
  price: string | number
  tax: ShopifyTaxLine[]
  allocations?: Array<string | number>
}): ShopifyShippingLine {
  const priceCents = Math.round(Number(p.price) * 100)
  const allocCents = (p.allocations ?? [])
    .map((a) => Math.round(Number(a) * 100))
    .reduce((s, a) => s + a, 0)
  return {
    id: `gid://shopify/ShippingLine/${idCounter++}`,
    title: p.title ?? 'Standard',
    code: p.title ?? 'Standard',
    originalPriceSet: money(p.price),
    discountedPriceSet: money((priceCents - allocCents) / 100),
    discountAllocations: (p.allocations ?? []).map((a) => ({
      allocatedAmountSet: money(a),
      discountApplication: {
        allocationMethod: 'EACH',
        targetType: 'SHIPPING_LINE',
        targetSelection: 'ENTITLED',
        title: 'Kostenloser Versand',
      },
    })),
    taxLines: p.tax,
  }
}

export function makeOrder(p: {
  name?: string
  total: string | number
  totalTax: string | number
  totalDiscounts?: string | number
  lineItems: ShopifyLineItem[]
  shippingLines?: ShopifyShippingLine[]
  discountApplications?: ShopifyDiscountApplication[]
  discountCodes?: string[]
  taxesIncluded?: boolean
  tags?: string[]
  sourceName?: string
  financialStatus?: string
  gateways?: string[]
  email?: string | null
  customerEmail?: string | null
  customerName?: string | null
  billing?: ShopifyAddress | null
  shipping?: ShopifyAddress | null
  fulfillments?: Array<{ createdAt: string }>
  createdAt?: string
  cancelledAt?: string | null
}): ShopifyOrder {
  const email = p.email === undefined ? 'erika@example.com' : p.email
  const customerEmail = p.customerEmail === undefined ? email : p.customerEmail
  const shippingTotal = (p.shippingLines ?? []).reduce(
    (s, l) => s + Number(l.originalPriceSet.shopMoney.amount),
    0,
  )
  return {
    id: `gid://shopify/Order/${idCounter++}`,
    name: p.name ?? '#1001',
    createdAt: p.createdAt ?? '2026-08-09T14:19:43Z',
    processedAt: p.createdAt ?? '2026-08-09T14:19:38Z',
    cancelledAt: p.cancelledAt ?? null,
    tags: p.tags ?? [],
    note: null,
    sourceName: p.sourceName ?? 'web',
    displayFinancialStatus: p.financialStatus ?? 'PAID',
    displayFulfillmentStatus: 'FULFILLED',
    taxesIncluded: p.taxesIncluded ?? true,
    taxExempt: false,
    currencyCode: 'EUR',
    paymentGatewayNames: p.gateways ?? ['shopify_payments'],
    discountCodes: p.discountCodes ?? [],
    email,
    customer: {
      id: 'gid://shopify/Customer/1',
      displayName: p.customerName === undefined ? 'Erika Mustermann' : p.customerName,
      firstName: null,
      lastName: null,
      defaultEmailAddress: { emailAddress: customerEmail },
    },
    billingAddress: p.billing === undefined ? DE_ADDRESS : p.billing,
    shippingAddress: p.shipping === undefined ? DE_ADDRESS : p.shipping,
    fulfillments: (p.fulfillments ?? [{ createdAt: '2026-08-09T17:33:03Z' }]).map((f, i) => ({
      id: `gid://shopify/Fulfillment/${i + 1}`,
      createdAt: f.createdAt,
      status: 'SUCCESS',
      deliveredAt: null,
    })),
    lineItems: { nodes: p.lineItems },
    shippingLines: { nodes: p.shippingLines ?? [] },
    discountApplications: { nodes: p.discountApplications ?? [] },
    subtotalPriceSet: money(Number(p.total) - shippingTotal),
    totalShippingPriceSet: money(shippingTotal),
    totalDiscountsSet: money(p.totalDiscounts ?? 0),
    totalTaxSet: money(p.totalTax),
    totalPriceSet: money(p.total),
    currentTotalPriceSet: money(p.total),
    totalRefundedSet: money(0),
    refunds: [],
  }
}

/** Vollständige Aussteller-Einstellungen (reine Platzhalter für Tests). */
export const SETTINGS: InvoiceSettings = {
  id: 1,
  issuer_name: 'Hills of Hems',
  issuer_address: 'Teststraße 1\n12345 Teststadt',
  issuer_tax_number: '00/000/00000',
  issuer_vat_id: 'DE000000000',
  issuer_email: 'contact@hillsofhems.com',
  issuer_phone: null,
  issuer_web: 'hillsofhems.com',
  bank_details: null,
  number_prefix: 'HOH-',
  logo_path: null,
  footer_text: null,
  updated_at: '2026-09-01T00:00:00Z',
}

export const ORDERCHAMP_OVERRIDE: InvoiceCustomerOverride = {
  id: 'override-orderchamp',
  match_email: 'service+nl@orderchamp.com',
  company_name: 'Orderchamp B.V.',
  vat_id: 'NL000000000B00',
  billing_address_override: null,
  reverse_charge: true,
  note: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Fertige Bestellungen
// ---------------------------------------------------------------------------

/** Standardfall: zwei Positionen 19 %, kein Versand, kein Rabatt. */
export const ORDER_STANDARD = () =>
  makeOrder({
    name: '#1131',
    total: '94.75',
    totalTax: '15.13',
    lineItems: [
      lineItem({ title: 'Leinen-Servietten 2er-Set', variant: 'Hellrosa', sku: 'NK-101', qty: 4, unit: '19.95', tax: [tax19('12.74')] }),
      lineItem({ title: 'Waffel-Küchentuch', variant: 'Salbeigrün', sku: 'WAF-01', qty: 1, unit: '14.95', tax: [tax19('2.39')] }),
    ],
  })

/** Mit kostenpflichtigem Versand (eigene Steuerzeile). */
export const ORDER_WITH_SHIPPING = () =>
  makeOrder({
    name: '#1130',
    total: '42.85',
    totalTax: '6.84',
    gateways: ['paypal'],
    lineItems: [
      lineItem({ title: 'Waffel-Servietten 2er-Set', variant: 'Dunkel Grau', sku: 'WAFS-03', qty: 2, unit: '19.95', tax: [tax19('6.37')] }),
    ],
    shippingLines: [shippingLine({ price: '2.95', tax: [tax19('0.47')] })],
  })

/** Rabattcode 15 % ACROSS – Rabatt steckt nur in discountAllocations. */
export const ORDER_WITH_DISCOUNT = () =>
  makeOrder({
    name: '#1127',
    total: '28.82',
    totalTax: '4.60',
    totalDiscounts: '5.08',
    gateways: ['Barkauf'],
    discountCodes: ['1F69KCH87AZF'],
    discountApplications: [
      { allocationMethod: 'ACROSS', targetSelection: 'ALL', targetType: 'LINE_ITEM', value: { percentage: 15 }, code: '1F69KCH87AZF' },
    ],
    lineItems: [
      lineItem({ title: 'You make my heart smile Tasse', variant: null, sku: 'MUG-103', qty: 1, unit: '16.95', tax: [tax19('2.30')], allocations: [{ amount: '2.54', app: { code: '1F69KCH87AZF' } }] }),
      lineItem({ title: 'Tee Tasse – Keramik-Unikat', variant: null, sku: 'MUG-101', qty: 1, unit: '16.95', tax: [tax19('2.30')], allocations: [{ amount: '2.54', app: { code: '1F69KCH87AZF' } }] }),
    ],
    shippingLines: [shippingLine({ title: 'Hauptlager Deutschland', price: '0.0', tax: [] })],
  })

/** Kostenloser Versand über automatischen Rabatt (Versandzeile 2,95 → 0,00). */
export const ORDER_FREE_SHIPPING = () =>
  makeOrder({
    name: '#1125',
    total: '79.80',
    totalTax: '12.74',
    totalDiscounts: '2.95',
    discountApplications: [
      { allocationMethod: 'EACH', targetSelection: 'ENTITLED', targetType: 'SHIPPING_LINE', value: { percentage: 100 }, title: 'Kostenloser Versand' },
    ],
    lineItems: [
      lineItem({ title: 'Leinen-Servietten 2er-Set', variant: 'Hellrosa', sku: 'NK-101', qty: 4, unit: '19.95', tax: [tax19('12.74')] }),
    ],
    shippingLines: [shippingLine({ price: '2.95', tax: [tax19('0.0')], allocations: ['2.95'] })],
  })

/** Orderchamp B2B: Nettopreise (taxesIncluded=false), 0 % Steuer, Empfänger Orderchamp B.V. */
export const ORDER_ORDERCHAMP = () =>
  makeOrder({
    name: 'OC1108099',
    total: '63.60',
    totalTax: '0.0',
    taxesIncluded: false,
    tags: ['Orderchamp'],
    sourceName: 'Orderchamp',
    gateways: [],
    email: 'anna@example.nl',
    customerEmail: 'service+nl@orderchamp.com',
    customerName: 'Orderchamp B.V.',
    billing: ORDERCHAMP_ADDRESS,
    shipping: NL_RETAILER_ADDRESS,
    createdAt: '2026-06-06T18:49:03Z',
    fulfillments: [{ createdAt: '2026-06-08T17:00:43Z' }],
    lineItems: [
      lineItem({ title: 'Tee Tasse – Keramik-Unikat', sku: 'MUG-101', qty: 4, unit: '7.95', tax: [tax0('0.0', 'Tax')] }),
      lineItem({ title: 'You make my heart smile Tasse', sku: 'MUG-103', qty: 4, unit: '7.95', tax: [tax0('0.0', 'Tax')] }),
    ],
  })

/** Gemischter Warenkorb: eine Position ohne MwSt. (0 %), Versand mit zwei Steuerzeilen. */
export const ORDER_MIXED_RATES = () =>
  makeOrder({
    name: '#1122',
    total: '30.85',
    totalTax: '2.64',
    lineItems: [
      lineItem({ title: 'Geschirrtuch Basilikum', variant: null, sku: 'TT-105', qty: 1, unit: '12.95', tax: [tax0('0.0')] }),
      lineItem({ title: 'Waffel-Küchentuch', variant: 'Beige', sku: null, qty: 1, unit: '14.95', tax: [tax19('2.39')] }),
    ],
    shippingLines: [shippingLine({ price: '2.95', tax: [tax0('0.0'), tax19('0.25')] })],
  })
