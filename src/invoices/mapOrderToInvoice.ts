// ============================================================================
// Mapping Shopify-Bestellung → Rechnungs-Snapshot
// ----------------------------------------------------------------------------
// Grundsätze:
//   * Netto wird IMMER aus den Shopify-Steuerzeilen abgeleitet, nie selbst mit
//     einem Steuersatz gerechnet.
//   * Rabatte: `discountedTotalSet` enthält bei Shopify NUR Positionsrabatte,
//     Bestell-Rabattcodes stecken ausschließlich in `discountAllocations`.
//     Deshalb: Positionsbetrag = originalTotal − Σ Allocations (gilt für
//     Positionen UND Versand einheitlich).
//   * taxesIncluded=true (Onlineshop): Betrag ist brutto, netto = brutto − Steuer.
//     taxesIncluded=false (Orderchamp): Betrag ist netto, brutto = netto + Steuer.
//   * Alle Rechnungen in Cent; Rundungsdifferenz zu totalPrice ≤ 2 Cent wird auf
//     die größte Steuergruppe gelegt, darüber Fehler.
// ============================================================================
import type {
  InvoiceCustomerOverride,
  InvoiceDraft,
  InvoiceLine,
  InvoiceMeta,
  InvoiceRecipient,
  InvoiceRow,
  InvoiceSettings,
  InvoiceTaxGroup,
  MappingResult,
  ShopifyAddress,
  ShopifyDiscountAllocation,
  ShopifyOrder,
  ShopifyTaxLine,
} from './types'
import { fmtMoney, fromCents, sumCents, toBerlinDate, toCents, splitLines } from './format'

export interface MapOptions {
  settings: InvoiceSettings | null
  overrides: InvoiceCustomerOverride[]
}

/** EU-Mitgliedstaaten (ISO 3166-1 alpha-2) – für die Reverse-Charge-Erkennung. */
export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
])

/** Deutsche Ländernamen für die Anschrift (Fallback: Shopify-Name). */
const COUNTRY_NAMES_DE: Record<string, string> = {
  AT: 'Österreich', BE: 'Belgien', BG: 'Bulgarien', HR: 'Kroatien', CY: 'Zypern',
  CZ: 'Tschechien', DK: 'Dänemark', EE: 'Estland', FI: 'Finnland', FR: 'Frankreich',
  DE: 'Deutschland', GR: 'Griechenland', HU: 'Ungarn', IE: 'Irland', IT: 'Italien',
  LV: 'Lettland', LT: 'Litauen', LU: 'Luxemburg', MT: 'Malta', NL: 'Niederlande',
  PL: 'Polen', PT: 'Portugal', RO: 'Rumänien', SK: 'Slowakei', SI: 'Slowenien',
  ES: 'Spanien', SE: 'Schweden', CH: 'Schweiz', GB: 'Vereinigtes Königreich',
  US: 'USA', LI: 'Liechtenstein', NO: 'Norwegen',
}

/** Lesbare Zahlungsart aus Shopify-Gateway-Namen. */
const GATEWAY_LABELS: Record<string, string> = {
  shopify_payments: 'Shopify Payments',
  paypal: 'PayPal',
  klarna: 'Klarna',
  manual: 'manuell',
  bogus: 'Test-Gateway',
  cash: 'Barzahlung',
}

/** Maximale tolerierte Rundungsdifferenz (Cent). */
const MAX_ROUNDING_CENTS = 2

// ----------------------------------------------------------------------------
// Kleine Helfer
// ----------------------------------------------------------------------------
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

function allocationsCents(allocs: ShopifyDiscountAllocation[] | undefined): number {
  return sumCents((allocs ?? []).map((a) => toCents(a.allocatedAmountSet?.shopMoney?.amount)))
}

function ratePercent(t: ShopifyTaxLine): number {
  if (typeof t.ratePercentage === 'number') return round2(t.ratePercentage)
  if (typeof t.rate === 'number') return round2(t.rate * 100)
  return 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Steuerzeilen nach Satz gruppieren: Map<Prozent, Cent>. */
function taxByRate(taxLines: ShopifyTaxLine[] | undefined): Map<number, number> {
  const m = new Map<number, number>()
  for (const t of taxLines ?? []) {
    const r = ratePercent(t)
    m.set(r, (m.get(r) ?? 0) + toCents(t.priceSet?.shopMoney?.amount))
  }
  return m
}

interface RawLine {
  kind: 'item' | 'shipping'
  title: string
  variant: string | null
  sku: string | null
  quantity: number
  rate: number
  amountCents: number // Betrag laut Shopify (brutto bei taxesIncluded, sonst netto)
  taxCents: number
  discountCents: number
}

/**
 * Zerlegt einen Positionsbetrag anhand seiner Steuerzeilen in (ggf. mehrere)
 * Rohzeilen je Steuersatz. Normalfall: genau eine Steuerzeile → eine Zeile.
 * Sonderfall (z. B. Versand bei gemischtem Warenkorb): mehrere Sätze → der
 * Anteil je Satz > 0 wird aus der Steuer zurückgerechnet, der Rest fällt auf
 * den 0-%-Anteil.
 */
function splitByRate(
  base: Omit<RawLine, 'rate' | 'amountCents' | 'taxCents'>,
  amountCents: number,
  taxLines: ShopifyTaxLine[] | undefined,
  taxesIncluded: boolean,
  warnings: string[],
): RawLine[] {
  const byRate = taxByRate(taxLines)

  // Keine Steuerzeilen → 0 %
  if (byRate.size === 0) {
    return [{ ...base, rate: 0, amountCents, taxCents: 0 }]
  }
  if (byRate.size === 1) {
    const rate = [...byRate.keys()][0]
    return [{ ...base, rate, amountCents, taxCents: byRate.get(rate) ?? 0 }]
  }

  // Mehrere Steuersätze auf einer Position (praktisch nur Versand).
  warnings.push(
    `Position „${base.title}“ enthält mehrere Steuersätze (${[...byRate.keys()]
      .map((r) => `${r} %`)
      .join(', ')}) und wurde entsprechend aufgeteilt.`,
  )
  const result: RawLine[] = []
  let remaining = amountCents
  const positiveRates = [...byRate.keys()].filter((r) => r > 0).sort((a, b) => b - a)
  for (const rate of positiveRates) {
    const tax = byRate.get(rate) ?? 0
    // Anteil zurückrechnen: brutto = Steuer × (100 + Satz) / Satz, netto = Steuer × 100 / Satz
    const share = taxesIncluded
      ? Math.round((tax * (100 + rate)) / rate)
      : Math.round((tax * 100) / rate)
    result.push({ ...base, rate, amountCents: share, taxCents: tax, discountCents: 0 })
    remaining -= share
  }
  if (byRate.has(0) || remaining !== 0) {
    result.push({ ...base, rate: 0, amountCents: remaining, taxCents: 0, discountCents: 0 })
  }
  // Rabatt der Position auf die erste Teilzeile legen (nur informativ)
  if (result.length) result[0].discountCents = base.discountCents
  return result
}

/** Anschriftzeilen (ohne Name/Firma) aus einer Shopify-Adresse. */
function addressLines(a: ShopifyAddress): string[] {
  const cc = a.countryCodeV2 ?? ''
  const lines = [
    a.address1?.trim() ?? '',
    a.address2?.trim() ?? '',
    `${a.zip?.trim() ?? ''} ${a.city?.trim() ?? ''}`.trim(),
  ]
  if (cc && cc !== 'DE') lines.push(COUNTRY_NAMES_DE[cc] ?? a.country ?? cc)
  return lines.filter(Boolean)
}

function personName(a: ShopifyAddress | null, fallback: string | null): string {
  const fromParts = `${a?.firstName ?? ''} ${a?.lastName ?? ''}`.trim()
  return (a?.name?.trim() || fromParts || fallback || '').trim()
}

// ----------------------------------------------------------------------------
// Hauptfunktion
// ----------------------------------------------------------------------------
export function mapOrderToInvoice(order: ShopifyOrder, opts: MapOptions): MappingResult {
  const warnings: string[] = []
  const blockers: string[] = []
  const { settings } = opts

  // --- Grundvoraussetzungen ---------------------------------------------------
  if (order.displayFinancialStatus !== 'PAID') {
    blockers.push(`Bestellung ${order.name} ist nicht bezahlt (Status ${order.displayFinancialStatus}).`)
  }
  if (order.cancelledAt) {
    blockers.push(`Bestellung ${order.name} wurde in Shopify storniert.`)
  }
  if (!settings || !settings.issuer_name.trim() || !settings.issuer_address.trim()) {
    blockers.push('Rechnungseinstellungen unvollständig: Name und Anschrift des Ausstellers fehlen.')
  } else if (!settings.issuer_tax_number?.trim() && !settings.issuer_vat_id?.trim()) {
    blockers.push('Rechnungseinstellungen unvollständig: Steuernummer oder USt-IdNr. des Ausstellers fehlt.')
  }

  // --- Kanal & Override -------------------------------------------------------
  const isOrderchamp =
    order.tags.some((t) => lower(t) === 'orderchamp') || lower(order.sourceName) === 'orderchamp'
  const channel = isOrderchamp ? 'orderchamp' : 'onlineshop'

  const customerEmail = order.customer?.defaultEmailAddress?.emailAddress ?? null
  const orderEmail = order.email ?? null
  const emails = new Set([lower(customerEmail), lower(orderEmail)].filter(Boolean))
  const override = opts.overrides.find((o) => o.match_email && emails.has(lower(o.match_email))) ?? null

  // --- Empfänger --------------------------------------------------------------
  const baseAddress = order.billingAddress ?? order.shippingAddress ?? null
  if (!baseAddress) blockers.push('Bestellung hat weder Rechnungs- noch Lieferadresse.')

  const countryCode = baseAddress?.countryCodeV2 ?? null
  let company = baseAddress?.company?.trim() || null
  let name = personName(baseAddress, order.customer?.displayName ?? null)
  let lines = baseAddress ? addressLines(baseAddress) : []
  let source: InvoiceRecipient['source'] = order.billingAddress ? 'billing' : 'shipping'

  if (override) {
    if (override.company_name?.trim()) company = override.company_name.trim()
    if (override.billing_address_override?.trim()) {
      lines = splitLines(override.billing_address_override)
      source = 'override'
    }
  }
  // Bei Firmen ohne abweichende Person nur die Firma zeigen (kein Doppel).
  if (company && lower(name) === lower(company)) name = ''
  if (!company && !name) blockers.push('Empfänger hat weder Name noch Firma.')

  const recipient: InvoiceRecipient = {
    name,
    company,
    address_lines: lines,
    country_code: countryCode,
    vat_id: override?.vat_id?.trim() || null,
    email: customerEmail ?? orderEmail,
    source,
  }

  // --- Reverse Charge ---------------------------------------------------------
  const totalTaxCents = toCents(order.totalTaxSet?.shopMoney?.amount)
  const reverseCharge =
    override?.reverse_charge === true ||
    (countryCode !== null &&
      countryCode !== 'DE' &&
      EU_COUNTRIES.has(countryCode) &&
      totalTaxCents === 0 &&
      Boolean(recipient.vat_id))

  if (reverseCharge) {
    if (!recipient.vat_id) {
      blockers.push(
        'Reverse Charge: USt-IdNr. des Empfängers fehlt. Bitte den Kunden-Override unter „Rechnungen → Einstellungen“ ergänzen.',
      )
    }
    if (!settings?.issuer_vat_id?.trim()) {
      blockers.push('Reverse Charge: USt-IdNr. des Ausstellers fehlt in den Rechnungseinstellungen.')
    }
    if (totalTaxCents !== 0) {
      blockers.push(
        `Reverse Charge ist für diesen Kunden hinterlegt, Shopify hat aber ${fmtMoney(fromCents(totalTaxCents))} Steuer berechnet. Bitte Bestellung prüfen.`,
      )
    }
    if (countryCode === 'DE') {
      blockers.push('Reverse Charge ist für Empfänger in Deutschland nicht anwendbar.')
    }
  }

  // --- Positionen -------------------------------------------------------------
  const taxesIncluded = order.taxesIncluded
  const raw: RawLine[] = []

  for (const li of order.lineItems?.nodes ?? []) {
    const qty = li.quantity
    if (li.currentQuantity !== undefined && li.currentQuantity !== qty) {
      warnings.push(
        `Position „${li.title}“: Menge wurde nach der Bestellung geändert (${qty} → ${li.currentQuantity}). Rechnung nutzt die ursprüngliche Menge.`,
      )
    }
    const originalTotal =
      li.originalTotalSet?.shopMoney?.amount !== undefined
        ? toCents(li.originalTotalSet.shopMoney.amount)
        : toCents(li.originalUnitPriceSet?.shopMoney?.amount) * qty
    const discount = allocationsCents(li.discountAllocations)
    const amount = originalTotal - discount
    const variant = li.variantTitle && li.variantTitle !== 'Default Title' ? li.variantTitle : null

    raw.push(
      ...splitByRate(
        { kind: 'item', title: li.title, variant, sku: li.sku ?? null, quantity: qty, discountCents: discount },
        amount,
        li.taxLines,
        taxesIncluded,
        warnings,
      ),
    )
  }

  for (const sl of order.shippingLines?.nodes ?? []) {
    const original = toCents(sl.originalPriceSet?.shopMoney?.amount)
    const discount = allocationsCents(sl.discountAllocations)
    const amount = original - discount
    if (amount === 0 && sumCents([...taxByRate(sl.taxLines).values()]) === 0) continue // kostenloser Versand → keine Position
    raw.push(
      ...splitByRate(
        { kind: 'shipping', title: `Versand${sl.title ? ` (${sl.title})` : ''}`, variant: null, sku: null, quantity: 1, discountCents: discount },
        amount,
        sl.taxLines,
        taxesIncluded,
        warnings,
      ),
    )
  }

  if (raw.length === 0) blockers.push('Bestellung enthält keine Positionen.')

  // --- Netto/Brutto je Zeile --------------------------------------------------
  const lineCents = raw.map((r) => {
    const gross = taxesIncluded ? r.amountCents : r.amountCents + r.taxCents
    const net = gross - r.taxCents
    return { ...r, gross, net }
  })

  // 0 % bei Inlandskunden ohne Reverse Charge → sehr wahrscheinlich Shop-Konfiguration
  if (!reverseCharge && countryCode === 'DE') {
    for (const l of lineCents) {
      if (l.kind === 'item' && l.rate === 0 && l.gross > 0) {
        warnings.push(
          `Position „${l.title}“ wurde ohne MwSt. (0 %) verkauft. Bitte im Shopify-Produkt „Steuern erheben“ prüfen – die Rechnung übernimmt die Bestellung so, wie sie ist.`,
        )
      }
    }
  }

  // --- Steuergruppen ----------------------------------------------------------
  const groups = new Map<number, { net: number; tax: number; gross: number }>()
  for (const l of lineCents) {
    const g = groups.get(l.rate) ?? { net: 0, tax: 0, gross: 0 }
    g.net += l.net
    g.tax += l.taxCents
    g.gross += l.gross
    groups.set(l.rate, g)
  }

  // --- Abgleich mit Shopify-Summen -------------------------------------------
  const totalPriceCents = toCents(order.totalPriceSet?.shopMoney?.amount)
  const sumGross = sumCents(lineCents.map((l) => l.gross))
  const sumTax = sumCents(lineCents.map((l) => l.taxCents))

  const largestRate = [...groups.entries()].sort((a, b) => b[1].gross - a[1].gross)[0]?.[0]

  const grossDiff = totalPriceCents - sumGross
  if (Math.abs(grossDiff) > MAX_ROUNDING_CENTS) {
    throw new Error(
      `Summe der Positionen (${fmtMoney(fromCents(sumGross))}) weicht um ${fmtMoney(
        fromCents(grossDiff),
      )} vom Bestellwert (${fmtMoney(fromCents(totalPriceCents))}) ab. Rechnung kann nicht automatisch erstellt werden.`,
    )
  }
  const taxDiff = totalTaxCents - sumTax
  if (Math.abs(taxDiff) > MAX_ROUNDING_CENTS) {
    throw new Error(
      `Summe der Steuerzeilen (${fmtMoney(fromCents(sumTax))}) weicht um ${fmtMoney(
        fromCents(taxDiff),
      )} von der Bestellsteuer (${fmtMoney(fromCents(totalTaxCents))}) ab.`,
    )
  }

  if (largestRate !== undefined && (grossDiff !== 0 || taxDiff !== 0)) {
    const g = groups.get(largestRate)!
    g.gross += grossDiff
    g.tax += taxDiff
    g.net = g.gross - g.tax
    // Größte Zeile der Gruppe mitziehen, damit Zeilen und Gruppen konsistent bleiben.
    const biggest = lineCents
      .filter((l) => l.rate === largestRate)
      .sort((a, b) => b.gross - a.gross)[0]
    if (biggest) {
      biggest.gross += grossDiff
      biggest.taxCents += taxDiff
      biggest.net = biggest.gross - biggest.taxCents
    }
    if (grossDiff !== 0 || taxDiff !== 0) {
      warnings.push(
        `Rundungsdifferenz von ${fmtMoney(fromCents(Math.abs(grossDiff) || Math.abs(taxDiff)))} auf die Steuergruppe ${largestRate} % gelegt.`,
      )
    }
  }

  // --- Rabatt-Info ------------------------------------------------------------
  const totalDiscountCents = toCents(order.totalDiscountsSet?.shopMoney?.amount)
  const allocatedCents = sumCents(raw.map((r) => r.discountCents))
  if (totalDiscountCents !== allocatedCents) {
    warnings.push(
      `Rabattsumme laut Shopify (${fmtMoney(fromCents(totalDiscountCents))}) entspricht nicht den zugeordneten Rabatten (${fmtMoney(
        fromCents(allocatedCents),
      )}).`,
    )
  }
  const discountCodes = order.discountCodes ?? []
  const discountTitles = (order.discountApplications?.nodes ?? [])
    .map((d) => d.code || d.title || '')
    .filter(Boolean)
  const discountLabel = [...new Set([...discountCodes, ...discountTitles])].join(', ')
  const discountNote =
    totalDiscountCents > 0
      ? `Enthält Rabatt in Höhe von ${fmtMoney(fromCents(totalDiscountCents))}${discountLabel ? ` (${discountLabel})` : ''}.`
      : null

  // --- Lieferdatum ------------------------------------------------------------
  const firstFulfillment = [...(order.fulfillments ?? [])]
    .filter((f) => f.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  const deliveryDate = firstFulfillment ? toBerlinDate(firstFulfillment.createdAt) : null

  // --- Zahlungsart ------------------------------------------------------------
  const gateways = order.paymentGatewayNames ?? []
  let paymentMethod: string | null = gateways
    .map((g) => GATEWAY_LABELS[lower(g)] ?? g)
    .filter(Boolean)
    .join(', ')
  if (!paymentMethod && isOrderchamp) paymentMethod = 'Orderchamp'
  if (!paymentMethod) paymentMethod = null

  // --- Refunds (nur Snapshot, v1 ohne Teilgutschrift) -------------------------
  const refunds = (order.refunds ?? []).map((r) => ({
    id: r.id,
    created_at: r.createdAt,
    amount: fromCents(toCents(r.totalRefundedSet?.shopMoney?.amount)),
    note: r.note ?? null,
  }))
  const totalRefunded = fromCents(toCents(order.totalRefundedSet?.shopMoney?.amount))
  if (totalRefunded > 0) {
    warnings.push(`Bestellung hat Erstattungen über ${fmtMoney(totalRefunded)}. Teilgutschriften sind in v1 nicht abgebildet.`)
  }

  // --- Snapshot zusammenbauen -------------------------------------------------
  const invoiceLines: InvoiceLine[] = lineCents.map((l) => ({
    kind: l.kind,
    title: l.title,
    variant: l.variant,
    sku: l.sku,
    quantity: l.quantity,
    unit_net: fromCents(l.quantity ? Math.round(l.net / l.quantity) : l.net),
    net: fromCents(l.net),
    tax_rate: l.rate,
    tax: fromCents(l.taxCents),
    gross: fromCents(l.gross),
    discount: fromCents(l.discountCents),
  }))

  const taxSummary: InvoiceTaxGroup[] = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, g]) => ({ rate, net: fromCents(g.net), tax: fromCents(g.tax), gross: fromCents(g.gross) }))

  const totalNet = sumCents([...groups.values()].map((g) => g.net))
  const totalTax = sumCents([...groups.values()].map((g) => g.tax))
  const totalGross = sumCents([...groups.values()].map((g) => g.gross))

  const meta: InvoiceMeta = {
    channel,
    order_date: order.createdAt,
    order_email: orderEmail,
    customer_email: customerEmail,
    customer_name: order.customer?.displayName ?? null,
    payment_gateways: gateways,
    payment_method: paymentMethod,
    taxes_included: taxesIncluded,
    delivery_date_source: deliveryDate ? 'fulfillment' : 'issue_date',
    discount_codes: discountCodes,
    discount_note: discountNote,
    refunds,
    total_refunded: totalRefunded,
    financial_status: order.displayFinancialStatus,
    warnings,
  }

  const draft: InvoiceDraft = {
    shopify_order_id: order.id,
    shopify_order_name: order.name,
    delivery_date: deliveryDate,
    recipient,
    lines: invoiceLines,
    tax_summary: taxSummary,
    totals: {
      net: fromCents(totalNet),
      tax: fromCents(totalTax),
      gross: fromCents(totalGross),
      currency: order.currencyCode || 'EUR',
      discount: fromCents(totalDiscountCents),
    },
    reverse_charge: reverseCharge,
    meta,
  }

  return { draft, warnings, blockers }
}

// ----------------------------------------------------------------------------
// Stornorechnung: gleiche Positionen, negative Beträge, Bezug auf Original
// ----------------------------------------------------------------------------
export function buildCancellationDraft(original: InvoiceRow): InvoiceDraft {
  const neg = (n: number) => fromCents(-toCents(n))
  return {
    shopify_order_id: original.shopify_order_id,
    shopify_order_name: original.shopify_order_name,
    delivery_date: original.delivery_date,
    recipient: original.recipient,
    lines: original.lines.map((l) => ({
      ...l,
      unit_net: neg(l.unit_net),
      net: neg(l.net),
      tax: neg(l.tax),
      gross: neg(l.gross),
      discount: neg(l.discount),
    })),
    tax_summary: original.tax_summary.map((g) => ({
      rate: g.rate,
      net: neg(g.net),
      tax: neg(g.tax),
      gross: neg(g.gross),
    })),
    totals: {
      net: neg(original.totals.net),
      tax: neg(original.totals.tax),
      gross: neg(original.totals.gross),
      currency: original.totals.currency,
      discount: neg(original.totals.discount),
    },
    reverse_charge: original.reverse_charge,
    meta: {
      ...original.meta,
      warnings: [],
      cancels_number: original.number,
      cancels_issue_date: original.issue_date,
    },
  }
}
