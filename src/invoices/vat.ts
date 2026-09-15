// Umsatzsteuer-Auswertung über gespeicherte Rechnungen (Snapshot-Daten).
// Gruppiert nach Steuersatz, Stornorechnungen gehen mit negativen Beträgen ein,
// Reverse-Charge-Umsätze (§ 13b UStG) werden getrennt ausgewiesen.
// Zeitraum bezieht sich auf das Rechnungsdatum (issue_date).
import { fromCents, toCents } from './format'
import type { InvoiceRow } from './types'

export type PeriodKind = 'month' | 'quarter' | 'year'

export interface Period {
  kind: PeriodKind
  /** month: "YYYY-MM" · quarter: "YYYY-Qn" · year: "YYYY" */
  value: string
}

export interface PeriodRange {
  /** inklusiv, YYYY-MM-DD */
  from: string
  /** exklusiv, YYYY-MM-DD */
  to: string
  label: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/** Liefert [from, to) für eine Periode. Wirft bei ungültigem Wert. */
export function periodRange(p: Period): PeriodRange {
  if (p.kind === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(p.value)
    if (!m) throw new Error(`Ungültiger Monat: ${p.value}`)
    const y = Number(m[1])
    const mo = Number(m[2])
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`
    return { from: `${y}-${pad(mo)}-01`, to: next, label: `${MONTHS_DE[mo - 1]} ${y}` }
  }
  if (p.kind === 'quarter') {
    const m = /^(\d{4})-Q([1-4])$/.exec(p.value)
    if (!m) throw new Error(`Ungültiges Quartal: ${p.value}`)
    const y = Number(m[1])
    const q = Number(m[2])
    const startMonth = (q - 1) * 3 + 1
    const endMonth = startMonth + 3
    const to = endMonth > 12 ? `${y + 1}-01-01` : `${y}-${pad(endMonth)}-01`
    return { from: `${y}-${pad(startMonth)}-01`, to, label: `Q${q} ${y}` }
  }
  const m = /^(\d{4})$/.exec(p.value)
  if (!m) throw new Error(`Ungültiges Jahr: ${p.value}`)
  const y = Number(m[1])
  return { from: `${y}-01-01`, to: `${y + 1}-01-01`, label: String(y) }
}

/** Rechnungen im Zeitraum (nach Rechnungsdatum), sortiert nach Nummer. */
export function invoicesInPeriod(rows: InvoiceRow[], p: Period): InvoiceRow[] {
  const { from, to } = periodRange(p)
  return rows
    .filter((r) => r.issue_date >= from && r.issue_date < to)
    .sort((a, b) => a.number.localeCompare(b.number))
}

export interface VatRateSummary {
  rate: number
  /** Anzahl Rechnungen, die diesen Satz enthalten (Stornos mitgezählt). */
  count: number
  net: number
  tax: number
  gross: number
}

export interface VatSummary {
  invoices: number
  cancellations: number
  byRate: VatRateSummary[]
  /** Innergemeinschaftliche Lieferungen mit Reverse Charge (steuerfrei). */
  reverseCharge: { count: number; net: number }
  totals: { net: number; tax: number; gross: number }
}

export function summarizeVat(rows: InvoiceRow[]): VatSummary {
  const byRate = new Map<number, { count: number; net: number; tax: number; gross: number }>()
  let invoices = 0
  let cancellations = 0
  let rcCount = 0
  let rcNet = 0
  let net = 0
  let tax = 0
  let gross = 0

  for (const r of rows) {
    if (r.type === 'cancellation') cancellations += 1
    else invoices += 1

    for (const g of r.tax_summary) {
      const acc = byRate.get(g.rate) ?? { count: 0, net: 0, tax: 0, gross: 0 }
      acc.count += 1
      acc.net += toCents(g.net)
      acc.tax += toCents(g.tax)
      acc.gross += toCents(g.gross)
      byRate.set(g.rate, acc)
    }

    net += toCents(r.totals.net)
    tax += toCents(r.totals.tax)
    gross += toCents(r.totals.gross)

    if (r.reverse_charge) {
      rcCount += 1
      rcNet += toCents(r.totals.net)
    }
  }

  return {
    invoices,
    cancellations,
    byRate: [...byRate.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([rate, v]) => ({ rate, count: v.count, net: fromCents(v.net), tax: fromCents(v.tax), gross: fromCents(v.gross) })),
    reverseCharge: { count: rcCount, net: fromCents(rcNet) },
    totals: { net: fromCents(net), tax: fromCents(tax), gross: fromCents(gross) },
  }
}

/** Aktuelle Periode als Vorgabe (heutiger Tag in Europe/Berlin). */
export function defaultPeriod(kind: PeriodKind, todayYmd: string): Period {
  const y = todayYmd.slice(0, 4)
  const m = Number(todayYmd.slice(5, 7))
  if (kind === 'month') return { kind, value: `${y}-${pad(m)}` }
  if (kind === 'quarter') return { kind, value: `${y}-Q${Math.floor((m - 1) / 3) + 1}` }
  return { kind, value: y }
}
