// Monatsübersicht als CSV für Excel / Lexware:
//   Trennzeichen ";", Dezimalkomma, UTF-8 mit BOM, eine Zeile pro Rechnung,
//   Netto/Steuer/Brutto je vorkommendem Steuersatz als eigene Spalten.
import { csvNumber, fmtDate } from './format'
import type { InvoiceRow } from './types'

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'boolean' ? (value ? 'ja' : 'nein') : String(value)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function recipientLabel(row: InvoiceRow): string {
  const { company, name } = row.recipient
  if (company && name) return `${company}, ${name}`
  return company || name || ''
}

/** Baut den CSV-Text (ohne BOM) aus den Rechnungen eines Zeitraums. */
export function buildInvoicesCsv(rows: InvoiceRow[]): string {
  // Alle vorkommenden Steuersätze (absteigend), damit die Spalten stabil sind
  const rates = [...new Set(rows.flatMap((r) => r.tax_summary.map((g) => g.rate)))].sort((a, b) => b - a)
  if (rates.length === 0) rates.push(19)

  const header = [
    'Rechnungsnummer',
    'Datum',
    'Typ',
    'Bestellnummer',
    'Kanal',
    'Empfänger',
    'Land',
    'USt-IdNr. Empfänger',
    ...rates.flatMap((r) => [`Netto ${r} %`, `USt ${r} %`, `Brutto ${r} %`]),
    'Netto gesamt',
    'USt gesamt',
    'Brutto gesamt',
    'Reverse Charge',
    'Storno zu',
    'Zahlungsart',
    'Lieferdatum',
  ]

  const lines = rows.map((row) => {
    const byRate = new Map(row.tax_summary.map((g) => [g.rate, g]))
    const cells: Array<string | number | boolean | null> = [
      row.number,
      fmtDate(row.issue_date),
      row.type === 'invoice' ? 'Rechnung' : 'Stornorechnung',
      row.shopify_order_name,
      row.meta.channel === 'orderchamp' ? 'Orderchamp' : 'Onlineshop',
      recipientLabel(row),
      row.recipient.country_code ?? '',
      row.recipient.vat_id ?? '',
      ...rates.flatMap((r) => {
        const g = byRate.get(r)
        return [csvNumber(g?.net ?? 0), csvNumber(g?.tax ?? 0), csvNumber(g?.gross ?? 0)]
      }),
      csvNumber(row.totals.net),
      csvNumber(row.totals.tax),
      csvNumber(row.totals.gross),
      row.reverse_charge,
      row.meta.cancels_number ?? '',
      row.meta.payment_method ?? '',
      fmtDate(row.delivery_date ?? row.issue_date),
    ]
    return cells.map(csvCell).join(';')
  })

  return [header.map(csvCell).join(';'), ...lines].join('\r\n') + '\r\n'
}

/** Löst den Browser-Download aus (UTF-8 mit BOM, damit Excel Umlaute erkennt). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
