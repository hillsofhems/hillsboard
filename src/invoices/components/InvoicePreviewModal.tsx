// Vorschau-Modal: zeigt alle Werte der Rechnung vor dem Erstellen, blockiert bei
// fehlenden Pflichtangaben und führt danach den Ablauf RPC → PDF → Upload aus.
// Schlägt der PDF-Teil fehl, bleibt die Rechnung (mit vergebener Nummer)
// bestehen und kann hier direkt erneut erzeugt werden.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Info, RefreshCw } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { getShopifyOrder, getSignedInvoiceUrl } from '../api'
import { createInvoiceWithPdf, generateInvoicePdf, InvoiceStepError, STEP_LABELS, type CreateStep } from '../createInvoice'
import { fmtDate, fmtMoney, fmtPercent, todayBerlin } from '../format'
import { buildCancellationDraft, mapOrderToInvoice } from '../mapOrderToInvoice'
import type { InvoiceCustomerOverride, InvoiceDraft, InvoiceRow, InvoiceSettings, MappingResult } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  mode: 'invoice' | 'cancellation'
  orderId: string
  orderName: string
  /** Bei Storno: die zu stornierende Originalrechnung. */
  original?: InvoiceRow | null
  settings: InvoiceSettings | null
  overrides: InvoiceCustomerOverride[]
  onCreated: (row: InvoiceRow) => void
}

type Phase = 'loading' | 'preview' | 'working' | 'pdf_failed' | 'done'

export function InvoicePreviewModal({
  open,
  onClose,
  mode,
  orderId,
  orderName,
  original,
  settings,
  overrides,
  onCreated,
}: Props) {
  const { toast } = useToast()
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<MappingResult | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [step, setStep] = useState<CreateStep>('rpc')
  const [created, setCreated] = useState<InvoiceRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const isCancellation = mode === 'cancellation'

  // Bestellung laden (Rechnung) bzw. Storno-Entwurf aus dem Original bauen.
  useEffect(() => {
    if (!open) return
    let active = true
    setPhase('loading')
    setLoadError(null)
    setMapping(null)
    setMapError(null)
    setCreated(null)
    setActionError(null)

    if (isCancellation) {
      if (!original) {
        setLoadError('Originalrechnung fehlt.')
        return
      }
      const draft = buildCancellationDraft(original)
      setMapping({ draft, warnings: [], blockers: [] })
      setPhase('preview')
      return
    }

    getShopifyOrder(orderId)
      .then((order) => {
        if (!active) return
        try {
          setMapping(mapOrderToInvoice(order, { settings, overrides }))
        } catch (err) {
          setMapError(err instanceof Error ? err.message : String(err))
        }
        setPhase('preview')
      })
      .catch((err: unknown) => {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      active = false
    }
  }, [open, orderId, isCancellation, original, settings, overrides, reloadKey])

  const draft: InvoiceDraft | null = mapping?.draft ?? null
  const blockers = useMemo(() => {
    const list = [...(mapping?.blockers ?? [])]
    if (!settings) list.unshift('Rechnungseinstellungen fehlen.')
    return list
  }, [mapping, settings])
  const canCreate = phase === 'preview' && !!draft && blockers.length === 0 && !mapError

  const confirm = async () => {
    if (!draft || !settings) return
    setPhase('working')
    setActionError(null)
    try {
      const row = await createInvoiceWithPdf(
        draft,
        mode,
        isCancellation ? (original?.id ?? null) : null,
        settings,
        setStep,
      )
      setCreated(row)
      onCreated(row)
      setPhase('done')
      toast(`${isCancellation ? 'Stornorechnung' : 'Rechnung'} ${row.number} erstellt.`)
      void openPdf(row, true)
    } catch (err) {
      if (err instanceof InvoiceStepError) {
        setActionError(err.message)
        if (err.row) {
          // Rechnung existiert bereits – nur der PDF-Teil ist offen.
          setCreated(err.row)
          onCreated(err.row)
          setPhase('pdf_failed')
        } else {
          setPhase('preview')
        }
      } else {
        setActionError(err instanceof Error ? err.message : String(err))
        setPhase('preview')
      }
    }
  }

  const retryPdf = async () => {
    if (!created || !settings) return
    setPhase('working')
    setActionError(null)
    try {
      const row = await generateInvoicePdf(created, settings, setStep)
      setCreated(row)
      onCreated(row)
      setPhase('done')
      toast(`PDF für ${row.number} erzeugt.`)
      void openPdf(row, true)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
      setPhase('pdf_failed')
    }
  }

  const openPdf = async (row: InvoiceRow, silent = false) => {
    if (!row.pdf_path) return
    try {
      const url = await getSignedInvoiceUrl(row.pdf_path)
      const win = window.open(url, '_blank', 'noopener')
      if (!win && !silent) toast('Popup blockiert – bitte „PDF öffnen“ erneut klicken.', 'error')
    } catch (err) {
      if (!silent) toast(err instanceof Error ? err.message : 'PDF konnte nicht geöffnet werden.', 'error')
    }
  }

  const title = isCancellation
    ? `Stornorechnung zu ${original?.number ?? orderName}`
    : `Rechnung zu Bestellung ${orderName}`

  return (
    <Modal
      open={open}
      onClose={phase === 'working' ? () => undefined : onClose}
      title={title}
      size="lg"
      footer={
        phase === 'done' && created ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Schließen
            </Button>
            <Button onClick={() => openPdf(created)} disabled={!created.pdf_path}>
              <ExternalLink className="h-4 w-4" /> PDF öffnen
            </Button>
          </>
        ) : phase === 'pdf_failed' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Später
            </Button>
            <Button onClick={retryPdf}>
              <RefreshCw className="h-4 w-4" /> PDF erneut erzeugen
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={phase === 'working'}>
              Abbrechen
            </Button>
            <Button
              onClick={confirm}
              disabled={!canCreate}
              loading={phase === 'working'}
              variant={isCancellation ? 'danger' : 'primary'}
            >
              {isCancellation ? 'Stornorechnung erstellen' : 'Rechnung erstellen'}
            </Button>
          </>
        )
      }
    >
      {phase === 'loading' && !loadError && <Spinner label="Bestellung wird geladen …" />}
      {loadError && (
        <ErrorState
          message={loadError}
          onRetry={() => {
            setReloadKey((k) => k + 1)
          }}
        />
      )}

      {mapError && (
        <div className="rounded-lg border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-sm text-terracotta-600">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Rechnung kann nicht automatisch erstellt werden
          </div>
          {mapError}
        </div>
      )}

      {phase === 'working' && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-700">
          <RefreshCw className="h-4 w-4 animate-spin" /> {STEP_LABELS[step]}
        </div>
      )}

      {(phase === 'done' || phase === 'pdf_failed') && created && (
        <div
          className={cn(
            'mb-4 rounded-lg border px-4 py-3 text-sm',
            phase === 'done'
              ? 'border-sage-200 bg-sage-50 text-sage-700'
              : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {phase === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {phase === 'done'
              ? `${created.type === 'cancellation' ? 'Stornorechnung' : 'Rechnung'} ${created.number} wurde erstellt.`
              : `${created.number} ist angelegt, aber das PDF fehlt noch.`}
          </div>
          {phase === 'pdf_failed' && actionError && <p className="mt-1">{actionError}</p>}
          {phase === 'pdf_failed' && (
            <p className="mt-1 text-xs">
              Die Nummer ist bereits vergeben – das ist korrekt so. Erzeuge das PDF einfach erneut.
            </p>
          )}
        </div>
      )}

      {actionError && phase === 'preview' && (
        <div className="mb-4 rounded-lg border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-sm text-terracotta-600">
          {actionError}
        </div>
      )}

      {draft && (
        <div className="space-y-5">
          {blockers.length > 0 && (
            <div className="rounded-lg border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-sm text-terracotta-600">
              <div className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" /> Erstellung blockiert
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {mapping && mapping.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="mb-1 flex items-center gap-2 font-medium">
                <Info className="h-4 w-4" /> Hinweise
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {mapping.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Kopf: Empfänger + Meta */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-sand-50/60 p-4 text-sm">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-faint">Empfänger</div>
              {draft.recipient.company && <div className="font-medium text-ink">{draft.recipient.company}</div>}
              {draft.recipient.name && <div className="text-ink">{draft.recipient.name}</div>}
              {draft.recipient.address_lines.map((l, i) => (
                <div key={i} className="text-ink-soft">
                  {l}
                </div>
              ))}
              {draft.recipient.vat_id && (
                <div className="mt-1.5 text-xs text-ink-muted">USt-IdNr. {draft.recipient.vat_id}</div>
              )}
              {draft.recipient.email && <div className="text-xs text-ink-faint">{draft.recipient.email}</div>}
            </div>
            <div className="rounded-lg border border-line bg-sand-50/60 p-4 text-sm">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-faint">Rechnungsdaten</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-ink-muted">Typ</dt>
                <dd>
                  <Badge tone={isCancellation ? 'terracotta' : 'sage'}>
                    {isCancellation ? 'Stornorechnung' : 'Rechnung'}
                  </Badge>
                </dd>
                <dt className="text-ink-muted">Nummer</dt>
                <dd className="text-ink">{created?.number ?? 'wird beim Erstellen vergeben'}</dd>
                <dt className="text-ink-muted">Rechnungsdatum</dt>
                <dd className="text-ink">{fmtDate(created?.issue_date ?? todayBerlin())}</dd>
                <dt className="text-ink-muted">Lieferdatum</dt>
                <dd className="text-ink">
                  {draft.delivery_date ? fmtDate(draft.delivery_date) : 'wie Rechnungsdatum'}
                </dd>
                <dt className="text-ink-muted">Bestellung</dt>
                <dd className="text-ink">
                  {draft.shopify_order_name} · {fmtDate(draft.meta.order_date)}
                </dd>
                <dt className="text-ink-muted">Kanal</dt>
                <dd className="text-ink">{draft.meta.channel === 'orderchamp' ? 'Orderchamp' : 'Onlineshop'}</dd>
                <dt className="text-ink-muted">Zahlung</dt>
                <dd className="text-ink">{draft.meta.payment_method ?? 'bereits bezahlt'}</dd>
                {draft.reverse_charge && (
                  <>
                    <dt className="text-ink-muted">Steuer</dt>
                    <dd>
                      <Badge tone="blue">Reverse Charge</Badge>
                    </dd>
                  </>
                )}
                {isCancellation && original && (
                  <>
                    <dt className="text-ink-muted">Storno zu</dt>
                    <dd className="text-ink">
                      {original.number} vom {fmtDate(original.issue_date)}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* Positionen */}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-sand-50 text-left text-2xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2 font-semibold">Position</th>
                  <th className="px-3 py-2 text-right font-semibold">Menge</th>
                  <th className="px-3 py-2 text-right font-semibold">Netto</th>
                  <th className="px-3 py-2 text-right font-semibold">USt.</th>
                  <th className="px-3 py-2 text-right font-semibold">Steuer</th>
                  <th className="px-3 py-2 text-right font-semibold">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <div className="text-ink">{l.title}</div>
                      <div className="text-xs text-ink-faint">
                        {[l.variant, l.sku ? `Art.-Nr. ${l.sku}` : null].filter(Boolean).join(' · ')}
                        {l.discount ? ` · Rabatt ${fmtMoney(l.discount)}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPercent(l.tax_rate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.tax)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(l.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Steuerzusammenfassung */}
          <div className="ml-auto max-w-sm text-sm">
            {draft.tax_summary.map((g) => (
              <div key={g.rate} className="flex items-center justify-between py-1 text-ink-soft">
                <span>
                  Netto {fmtPercent(g.rate)} / USt. {fmtPercent(g.rate)}
                </span>
                <span className="tabular-nums">
                  {fmtMoney(g.net)} / {fmtMoney(g.tax)}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-ink pt-2 font-semibold text-ink">
              <span>{isCancellation ? 'Gutschriftbetrag' : 'Gesamtbetrag'}</span>
              <span className="tabular-nums">{fmtMoney(draft.totals.gross)}</span>
            </div>
            {draft.meta.discount_note && (
              <p className="mt-2 text-xs text-ink-muted">{draft.meta.discount_note}</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
