// Umsatzsteuer-Übersicht: Zeitraum wählen (Monat / Quartal / Jahr), Netto, USt und
// Brutto je Steuersatz, Reverse-Charge-Umsätze getrennt, Stornos verrechnet.
// Grundlage sind die gespeicherten Rechnungen (Rechnungsdatum). CSV für denselben Zeitraum.
import { useMemo, useState } from 'react'
import { Download, Percent } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { buildInvoicesCsv, downloadCsv } from '../csv'
import { fmtMoney, fmtPercent, todayBerlin } from '../format'
import type { InvoiceRow } from '../types'
import { defaultPeriod, invoicesInPeriod, periodRange, summarizeVat, type Period, type PeriodKind } from '../vat'

export function VatSummaryCard({ invoices }: { invoices: InvoiceRow[] }) {
  const { toast } = useToast()
  const today = todayBerlin()
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('month', today))

  const years = useMemo(() => {
    const set = new Set<string>([today.slice(0, 4)])
    invoices.forEach((i) => set.add(i.issue_date.slice(0, 4)))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [invoices, today])

  const range = useMemo(() => {
    try {
      return periodRange(period)
    } catch {
      return null
    }
  }, [period])

  const rows = useMemo(() => (range ? invoicesInPeriod(invoices, period) : []), [invoices, period, range])
  const summary = useMemo(() => summarizeVat(rows), [rows])

  const switchKind = (kind: PeriodKind) => setPeriod(defaultPeriod(kind, today))

  const exportCsv = () => {
    if (!range) return
    if (rows.length === 0) {
      toast(`Keine Rechnungen im Zeitraum ${range.label}.`, 'error')
      return
    }
    downloadCsv(`rechnungen-${period.value.toLowerCase()}.csv`, buildInvoicesCsv(rows))
    toast(`${rows.length} Rechnung${rows.length === 1 ? '' : 'en'} exportiert.`)
  }

  const quarterYear = period.kind === 'quarter' ? period.value.slice(0, 4) : today.slice(0, 4)
  const quarterNo = period.kind === 'quarter' ? period.value.slice(-1) : '1'

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sage-100 text-sage-700">
            <Percent className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Umsatzsteuer-Übersicht</h2>
            <p className="text-xs text-ink-muted">
              Nach Rechnungsdatum, Stornorechnungen sind verrechnet. Grundlage für die Buchhaltung / UStVA.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={!range}>
          <Download className="h-4 w-4" /> CSV {range ? range.label : ''}
        </Button>
      </div>

      {/* Zeitraum */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-line bg-surface p-1">
          {(['month', 'quarter', 'year'] as PeriodKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => switchKind(k)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                period.kind === k ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100',
              )}
            >
              {k === 'month' ? 'Monat' : k === 'quarter' ? 'Quartal' : 'Jahr'}
            </button>
          ))}
        </div>

        {period.kind === 'month' && (
          <Field label="Monat">
            <Input
              type="month"
              value={period.value}
              onChange={(e) => setPeriod({ kind: 'month', value: e.target.value })}
              className="w-44"
            />
          </Field>
        )}
        {period.kind === 'quarter' && (
          <>
            <Field label="Jahr">
              <Select value={quarterYear} onChange={(e) => setPeriod({ kind: 'quarter', value: `${e.target.value}-Q${quarterNo}` })} className="w-28">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quartal">
              <Select value={quarterNo} onChange={(e) => setPeriod({ kind: 'quarter', value: `${quarterYear}-Q${e.target.value}` })} className="w-24">
                {['1', '2', '3', '4'].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {period.kind === 'year' && (
          <Field label="Jahr">
            <Select value={period.value} onChange={(e) => setPeriod({ kind: 'year', value: e.target.value })} className="w-28">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <Badge tone="sage">{summary.invoices} Rechnung{summary.invoices === 1 ? '' : 'en'}</Badge>
          {summary.cancellations > 0 && (
            <Badge tone="terracotta">{summary.cancellations} Storno{summary.cancellations === 1 ? '' : 's'}</Badge>
          )}
        </div>
      </div>

      {/* Auswertung */}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-sand-50/50 px-4 py-6 text-center text-sm text-ink-faint">
          Keine Rechnungen im Zeitraum {range?.label ?? ''}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-sand-50 text-left text-2xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5 font-semibold">Steuersatz</th>
                <th className="px-4 py-2.5 text-right font-semibold">Rechnungen</th>
                <th className="px-4 py-2.5 text-right font-semibold">Netto</th>
                <th className="px-4 py-2.5 text-right font-semibold">Umsatzsteuer</th>
                <th className="px-4 py-2.5 text-right font-semibold">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {summary.byRate.map((g) => (
                <tr key={g.rate} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink">
                    {g.rate > 0 ? `Umsätze zu ${fmtPercent(g.rate)}` : 'Umsätze zu 0 %'}
                    {g.rate === 0 && summary.reverseCharge.count > 0 && (
                      <span className="ml-1 text-xs text-ink-faint">(inkl. Reverse Charge)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{g.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(g.net)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink">{fmtMoney(g.tax)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(g.gross)}</td>
                </tr>
              ))}
              {summary.reverseCharge.count > 0 && (
                <tr className="border-b border-line bg-sand-50/40 last:border-0">
                  <td className="px-4 py-2.5 text-ink-soft">
                    davon innergemeinschaftliche Lieferungen, steuerfrei (§ 13b Reverse Charge)
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{summary.reverseCharge.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">{fmtMoney(summary.reverseCharge.net)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">{fmtMoney(0)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">{fmtMoney(summary.reverseCharge.net)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink bg-sand-50/60 font-semibold text-ink">
                <td className="px-4 py-3">Gesamt {range?.label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{rows.length}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(summary.totals.net)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(summary.totals.tax)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(summary.totals.gross)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
