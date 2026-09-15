// Typen des Rechnungsmoduls.
//   * Shopify*  – Ausschnitt der Admin-GraphQL-Antwort (Edge Function `shopify-orders`)
//   * Invoice*  – eingefrorener Snapshot, wie er in `invoices` gespeichert wird
// Alle Geldbeträge im Snapshot sind EUR-Dezimalzahlen mit 2 Nachkommastellen.

// ---------------------------------------------------------------------------
// Shopify (Admin GraphQL, Version 2026-07)
// ---------------------------------------------------------------------------
export interface ShopifyMoney {
  amount: string // z. B. "12.74"
  currencyCode: string
}

export interface ShopifyMoneyBag {
  shopMoney: ShopifyMoney
}

export interface ShopifyTaxLine {
  rate: number | null // 0.19
  ratePercentage: number | null // 19
  title: string // "DE MwSt"
  priceSet: ShopifyMoneyBag
}

export interface ShopifyDiscountApplication {
  allocationMethod: 'ACROSS' | 'EACH' | 'ONE' | string
  targetType: 'LINE_ITEM' | 'SHIPPING_LINE' | string
  targetSelection: 'ALL' | 'ENTITLED' | 'EXPLICIT' | string
  code?: string | null
  title?: string | null
  description?: string | null
  value?: { amount?: string; currencyCode?: string; percentage?: number }
}

export interface ShopifyDiscountAllocation {
  allocatedAmountSet: ShopifyMoneyBag
  discountApplication?: ShopifyDiscountApplication | null
}

export interface ShopifyAddress {
  firstName: string | null
  lastName: string | null
  name: string | null
  company: string | null
  address1: string | null
  address2: string | null
  zip: string | null
  city: string | null
  province: string | null
  provinceCode: string | null
  country: string | null
  countryCodeV2: string | null
  phone?: string | null
}

export interface ShopifyLineItem {
  id: string
  title: string
  variantTitle: string | null
  sku: string | null
  quantity: number
  currentQuantity: number
  originalUnitPriceSet: ShopifyMoneyBag
  originalTotalSet: ShopifyMoneyBag
  /** Enthält NUR Positionsrabatte, KEINE Bestellrabatte (Codes) → Allocations nutzen. */
  discountedTotalSet: ShopifyMoneyBag
  totalDiscountSet: ShopifyMoneyBag
  discountAllocations: ShopifyDiscountAllocation[]
  taxLines: ShopifyTaxLine[]
}

export interface ShopifyShippingLine {
  id: string
  title: string
  code: string | null
  originalPriceSet: ShopifyMoneyBag
  discountedPriceSet: ShopifyMoneyBag
  discountAllocations: ShopifyDiscountAllocation[]
  taxLines: ShopifyTaxLine[]
}

export interface ShopifyFulfillment {
  id: string
  createdAt: string
  status: string
  deliveredAt: string | null
}

export interface ShopifyRefund {
  id: string
  createdAt: string
  note: string | null
  totalRefundedSet: ShopifyMoneyBag
}

export interface ShopifyCustomer {
  id: string
  displayName: string | null
  firstName?: string | null
  lastName?: string | null
  defaultEmailAddress: { emailAddress: string | null } | null
}

export type ShopifyFinancialStatus =
  | 'PAID'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PARTIALLY_PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'VOIDED'
  | 'EXPIRED'
  | string

/** Vollständige Bestellung (action `get`). */
export interface ShopifyOrder {
  id: string
  name: string
  createdAt: string
  processedAt: string | null
  cancelledAt: string | null
  tags: string[]
  note: string | null
  sourceName: string | null
  displayFinancialStatus: ShopifyFinancialStatus
  displayFulfillmentStatus: string
  taxesIncluded: boolean
  taxExempt: boolean
  currencyCode: string
  paymentGatewayNames: string[]
  discountCodes: string[]
  email: string | null
  customer: ShopifyCustomer | null
  billingAddress: ShopifyAddress | null
  shippingAddress: ShopifyAddress | null
  fulfillments: ShopifyFulfillment[]
  lineItems: { nodes: ShopifyLineItem[] }
  shippingLines: { nodes: ShopifyShippingLine[] }
  discountApplications: { nodes: ShopifyDiscountApplication[] }
  subtotalPriceSet: ShopifyMoneyBag
  totalShippingPriceSet: ShopifyMoneyBag
  totalDiscountsSet: ShopifyMoneyBag | null
  totalTaxSet: ShopifyMoneyBag | null
  totalPriceSet: ShopifyMoneyBag
  currentTotalPriceSet: ShopifyMoneyBag
  totalRefundedSet: ShopifyMoneyBag
  refunds: ShopifyRefund[]
}

/** Zeile der Bestellliste (action `list`). */
export interface ShopifyOrderListItem {
  id: string
  name: string
  createdAt: string
  tags: string[]
  sourceName: string | null
  displayFinancialStatus: ShopifyFinancialStatus
  displayFulfillmentStatus: string
  email: string | null
  customer: { displayName: string | null; defaultEmailAddress: { emailAddress: string | null } | null } | null
  billingAddress: { name: string | null; company: string | null; countryCodeV2: string | null } | null
  shippingAddress: { name: string | null; company: string | null; countryCodeV2: string | null } | null
  totalPriceSet: ShopifyMoneyBag
}

export interface ShopifyPageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

// ---------------------------------------------------------------------------
// Hub-Tabellen
// ---------------------------------------------------------------------------
export interface InvoiceSettings {
  id: 1
  issuer_name: string
  issuer_address: string
  issuer_tax_number: string | null
  issuer_vat_id: string | null
  issuer_email: string | null
  issuer_phone: string | null
  issuer_web: string | null
  bank_details: string | null
  number_prefix: string
  logo_path: string | null
  footer_text: string | null
  updated_at: string
}

export interface InvoiceCustomerOverride {
  id: string
  match_email: string | null
  company_name: string | null
  vat_id: string | null
  billing_address_override: string | null
  reverse_charge: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export type InvoiceType = 'invoice' | 'cancellation'
export type InvoiceChannel = 'onlineshop' | 'orderchamp'

// ---------------------------------------------------------------------------
// Snapshot (Spalten recipient / lines / tax_summary / totals / meta)
// ---------------------------------------------------------------------------
export interface InvoiceRecipient {
  /** Anzeigename (Person) – bei Firmen steht die Firma zusätzlich in `company`. */
  name: string
  company: string | null
  /** Adresszeilen ohne Name/Firma: Straße, ggf. Zusatz, "PLZ Ort", Land (nur wenn ≠ DE). */
  address_lines: string[]
  country_code: string | null
  vat_id: string | null
  email: string | null
  /** Woher die Anschrift stammt – für Nachvollziehbarkeit. */
  source: 'billing' | 'shipping' | 'override'
}

export interface InvoiceLine {
  kind: 'item' | 'shipping'
  title: string
  variant: string | null
  sku: string | null
  quantity: number
  /** Einzelpreis netto (gerundet, informativ – `net` ist maßgeblich). */
  unit_net: number
  net: number
  /** Steuersatz in Prozent, z. B. 19 / 7 / 0. */
  tax_rate: number
  tax: number
  gross: number
  /** Auf diese Position entfallener Rabatt (brutto), 0 wenn keiner. */
  discount: number
}

export interface InvoiceTaxGroup {
  rate: number
  net: number
  tax: number
  gross: number
}

export interface InvoiceTotals {
  net: number
  tax: number
  gross: number
  currency: string
  /** Summe aller Rabatte (brutto) laut Shopify `totalDiscountsSet`. */
  discount: number
}

export interface InvoiceMeta {
  channel: InvoiceChannel
  order_date: string // ISO aus Shopify createdAt
  order_email: string | null
  customer_email: string | null
  customer_name: string | null
  payment_gateways: string[]
  /** Lesbarer Zahlungsweg für den Vermerk "Betrag bereits bezahlt via …" (null = generisch). */
  payment_method: string | null
  taxes_included: boolean
  delivery_date_source: 'fulfillment' | 'issue_date'
  discount_codes: string[]
  /** Infozeile "Enthält Rabatt …", null wenn kein Rabatt. */
  discount_note: string | null
  /** Refunds im Snapshot mitführen (v2: Teilgutschriften). */
  refunds: Array<{ id: string; created_at: string; amount: number; note: string | null }>
  total_refunded: number
  financial_status: string
  /** Hinweise aus dem Mapping, die der Nutzer in der Vorschau gesehen hat. */
  warnings: string[]
  /** Storno-Bezug – wird von der RPC ergänzt. */
  cancels_number?: string
  cancels_issue_date?: string
}

/** Was der Client an `create_invoice` übergibt. */
export interface InvoiceDraft {
  shopify_order_id: string
  shopify_order_name: string
  delivery_date: string | null // YYYY-MM-DD
  recipient: InvoiceRecipient
  lines: InvoiceLine[]
  tax_summary: InvoiceTaxGroup[]
  totals: InvoiceTotals
  reverse_charge: boolean
  meta: InvoiceMeta
}

/** Zeile der Tabelle `invoices`. */
export interface InvoiceRow {
  id: string
  number: string
  type: InvoiceType
  shopify_order_id: string
  shopify_order_name: string
  cancels_invoice_id: string | null
  issue_date: string // YYYY-MM-DD
  delivery_date: string | null
  recipient: InvoiceRecipient
  lines: InvoiceLine[]
  tax_summary: InvoiceTaxGroup[]
  totals: InvoiceTotals
  reverse_charge: boolean
  meta: InvoiceMeta
  pdf_path: string | null
  created_by: string | null
  created_at: string
}

/** Ergebnis des Mappings: Draft + Hinweise/Blocker für die Vorschau. */
export interface MappingResult {
  draft: InvoiceDraft
  warnings: string[]
  /** Nicht leer → Erstellung blockieren (z. B. fehlende USt-IdNr. bei Reverse Charge). */
  blockers: string[]
}
