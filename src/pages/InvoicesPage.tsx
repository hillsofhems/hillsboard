import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  RefreshCw,
  Search,
  Settings2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Field'
import { Spinner, ErrorState, EmptyState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  getSignedInvoiceUrl,
  listShopifyOrders,
  loadCustomerOverrides,
  loadInvoiceSettings,
  loadInvoices,
  type ListOrdersParams,
} from '@/invoices/api'
import { generateInvoicePdf } from '@/invoices/createInvoice'
import { fmtDate, fmtMoney } from '@/invoices/format'
import { InvoicePreviewModal } from '@/invoices/components/InvoicePreviewModal'
import { VatSummaryCard } from '@/invoices/components/VatSummaryCard'
import type {
  InvoiceCustomerOverride,
  InvoiceRow,
  InvoiceSettings,
  ShopifyOrderListItem,
  ShopifyPageInfo,
} from '@/invoices/types'

const PAGE_SIZE = 25

const FINANCIAL_LABELS: Record<string, { label: string; tone: 'sage' | 'sand' | 'terracotta' | 'neutral' | 'blue' }> = {
  PAID: { label: 'Bezahlt', tone: 'sage' },
  PENDING: { label: 'Ausstehend', tone: 'sand' },
  AUTHORIZED: { label: 'Autorisiert', tone: 'sand' },
  PARTIALLY_PAID: { label: 'Teilbezahlt', tone: 'sand' },
  PARTIALLY_REFUNDED: { label: 'Teilerstattet', tone: 'terracotta' },
  REFUNDED: { label: 'Erstattet', tone: 'terracotta' },
  VOIDED: { label: 'Storniert', tone: 'neutral' },
  EXPIRED: { label: 'Abgelaufen', tone: 'neutral' },
}

interface Filters {
  from: string
  to: string
  channel: 'all' | 'onlineshop' | 'orderchamp'
  paidOnly: boolean
  withoutInvoice: boolean
  search: string
}

const DEFAULT_FILTERS: Filters = {
  from: '',
  to: '',
  channel: 'all',
  paidOnly: true,
  withoutInvoice: false,
  search: '',
}

type ModalState =
  | { mode: 'invoice'; orderId: string; orderName: string }
  | { mode: 'cancellation'; orderId: string; orderName: string; original: InvoiceRow }
  | null

function isOrderchamp(o: ShopifyOrderListItem): boolean {
  return o.tags.some((t) => t.toLowerCase() === 'orderchamp') || (o.sourceName ?? '').toLowerCase() === 'orderchamp'
}

function customerLabel(o: ShopifyOrderListItem): string {
  const b = o.billingAddress
  const company = b?.company?.trim()
  const name = b?.name?.trim() || o.customer?.displayName?.trim() || o.shippingAddress?.name?.trim() || ''
  if (company && name && company.toLowerCase() !== name.toLowerCase()) return `${company} · ${name}`
  return company || name || o.email || '—'
}

/** Rechnungen: Shopify-Bestellungen listen, Rechnung/Storno erzeugen, PDFs öffnen, CSV exportieren. */
export function InvoicesPage() {
  const { toast } = useToast()

  // Stammdaten
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [overrides, setOverrides] = useState<InvoiceCustomerOverride[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [baseLoading, setBaseLoading] = useState(true)
  const [baseError, setBaseError] = useState<string | null>(null)

  // Bestellungen
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS)
  const [orders, setOrders] = useState<ShopifyOrderListItem[]>([])
  const [pageInfo, setPageInfo] = useState<ShopifyPageInfo>({ hasNextPage: false, endCursor: null })
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  const [modal, setModal] = useState<ModalState>(null)
  const [busyRow, setBusyRow] = useState<string | null>(null)

  const loadBase = useCallback(async () => {
    setBaseLoading(true)
    setBaseError(null)
    try {
      const [s, o, inv] = await Promise.all([loadInvoiceSettings(), loadCustomerOverrides(), loadInvoices()])
      setSettings(s)
      setOverrides(o)
      setInvoices(inv)
    } catch (err) {
      setBaseError(err instanceof Error ? err.message : String(err))
    } finally {
      setBaseLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBase()
  }, [loadBase])

  const loadOrders = useCallback(
    async (f: Filters, after: string | null) => {
      setOrdersLoading(true)
      setOrdersError(null)
      try {
        const params: ListOrdersParams = {
          first: PAGE_SIZE,
          after,
          from: f.from || undefined,
          to: f.to || undefined,
          paidOnly: f.paidOnly,
          channel: f.channel,
          search: f.search || undefined,
        }
        const res = await listShopifyOrders(params)
        setOrders(res.orders)
        setPageInfo(res.pageInfo)
      } catch (err) {
        setOrdersError(err instanceof Error ? err.message : String(err))
      } finally {
        setOrdersLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadOrders(applied, cursorStack[cursorStack.length - 1] ?? null)
  }, [applied, cursorStack, loadOrders])

  const applyFilters = () => {
    setApplied(filters)
    setCursorStack([null])
  }
  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setApplied(DEFAULT_FILTERS)
    setCursorStack([null])
  }
  const nextPage = () => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) setCursorStack((s) => [...s, pageInfo.endCursor])
  }
  const prevPage = () => {
    setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  }

  // Rechnungen je Bestellung
  const byOrder = useMemo(() => {
    const m = new Map<string, { invoice?: InvoiceRow; cancellation?: InvoiceRow }>()
    for (const inv of invoices) {
      const entry = m.get(inv.shopify_order_id) ?? {}
      if (inv.type === 'invoice') entry.invoice = inv
      else entry.cancellation = inv
      m.set(inv.shopify_order_id, entry)
    }
    return m
  }, [invoices])

  const visibleOrders = useMemo(
    () => (applied.withoutInvoice ? orders.filter((o) => !byOrder.get(o.id)?.invoice) : orders),
    [orders, applied.withoutInvoice, byOrder],
  )

  const upsertInvoice = (row: InvoiceRow) => {
    setInvoices((prev) => {
      const idx = prev.findIndex((i) => i.id === row.id)
      if (idx === -1) return [row, ...prev]
      const next = [...prev]
      next[idx] = row
      return next
    })
  }

  const openPdf = async (row: InvoiceRow) => {
    if (!row.pdf_path) return
    setBusyRow(row.id)
    try {
      const url = await getSignedInvoiceUrl(row.pdf_path)
      const win = window.open(url, '_blank', 'noopener')
      if (!win) toast('Popup blockiert – bitte Popups für den Hub erlauben.', 'error')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'PDF konnte nicht geöffnet werden.', 'error')
    } finally {
      setBusyRow(null)
    }
  }

  const regeneratePdf = async (row: InvoiceRow) => {
    if (!settings) return
    setBusyRow(row.id)
    try {
      const updated = await generateInvoicePdf(row, settings)
      upsertInvoice(updated)
      toast(`PDF für ${updated.number} erzeugt.`)
      await openPdf(updated)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'PDF konnte nicht erzeugt werden.', 'error')
    } finally {
      setBusyRow(null)
    }
  }

  const settingsIncomplete =
    !settings ||
    !settings.issuer_name.trim() ||
    !settings.issuer_address.trim() ||
    (!settings.issuer_tax_number?.trim() && !settings.issuer_vat_id?.trim())

  return (
    <div>
      <PageHeader
        title="Rechnungen"
        description="Rechnungen zu bezahlten Shopify-Bestellungen erzeugen – nur für die interne Buchhaltung."
        actions={
          <Link to="/rechnungen/einstellungen">
            <Button variant="secondary">
              <Settings2 className="h-4 w-4" /> Einstellungen
            </Button>
          </Link>
        }
      />

      {baseLoading ? (
        <Spinner label="Einstellungen werden geladen …" />
      ) : baseError ? (
        <ErrorState message={baseError} onRetry={loadBase} />
      ) : (
        <>
          {settingsIncomplete && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">Rechnungseinstellungen unvollständig.</span> Name, Anschrift und
                Steuernummer bzw. USt-IdNr. des Ausstellers sind Pflicht, bevor Rechnungen erstellt werden können.{' '}
                <Link to="/rechnungen/einstellungen" className="underline underline-offset-2">
                  Jetzt ausfüllen
                </Link>
              </div>
            </div>
          )}

          {/* Filter */}
          <div className="card mb-5 p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <Field label="Von">
                <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
              </Field>
              <Field label="Bis">
                <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              </Field>
              <Field label="Kanal">
                <Select
                  value={filters.channel}
                  onChange={(e) => setFilters({ ...filters, channel: e.target.value as Filters['channel'] })}
                >
                  <option value="all">Alle</option>
                  <option value="onlineshop">Onlineshop</option>
                  <option value="orderchamp">Orderchamp</option>
                </Select>
              </Field>
              <Field label="Suche" className="col-span-2 md:col-span-1 lg:col-span-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <Input
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                    placeholder="#1131, OC1108099, Name, E-Mail"
                    className="pl-9"
                  />
                </div>
              </Field>
              <div className="flex items-end gap-2">
                <Button onClick={applyFilters} className="flex-1">
                  Anwenden
                </Button>
                <Button variant="ghost" onClick={resetFilters} title="Filter zurücksetzen">
                  Reset
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sage-500"
                  checked={filters.paidOnly}
                  onChange={(e) => setFilters({ ...filters, paidOnly: e.target.checked })}
                />
                Nur bezahlte Bestellungen
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sage-500"
                  checked={filters.withoutInvoice}
                  onChange={(e) => setFilters({ ...filters, withoutInvoice: e.target.checked })}
                />
                Nur ohne Rechnung
                <span className="text-xs text-ink-faint">(filtert die aktuelle Seite)</span>
              </label>
            </div>
          </div>

          {/* Tabelle */}
          {ordersLoading ? (
            <Spinner label="Bestellungen werden geladen …" />
          ) : ordersError ? (
            <ErrorState
              message={ordersError}
              onRetry={() => loadOrders(applied, cursorStack[cursorStack.length - 1] ?? null)}
            />
          ) : visibleOrders.length === 0 ? (
            <EmptyState
              icon={FilePlus2}
              title="Keine Bestellungen"
              description={
                applied.withoutInvoice
                  ? 'Auf dieser Seite haben alle Bestellungen bereits eine Rechnung.'
                  : 'Für diese Filter wurden keine Bestellungen gefunden.'
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-semibold">Bestellung</th>
                    <th className="px-4 py-3 font-semibold">Kunde</th>
                    <th className="px-4 py-3 font-semibold">Kanal</th>
                    <th className="px-4 py-3 text-right font-semibold">Brutto</th>
                    <th className="px-4 py-3 font-semibold">Zahlstatus</th>
                    <th className="px-4 py-3 font-semibold">Rechnung</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((o) => {
                    const status = FINANCIAL_LABELS[o.displayFinancialStatus] ?? {
                      label: o.displayFinancialStatus,
                      tone: 'neutral' as const,
                    }
                    const entry = byOrder.get(o.id)
                    const inv = entry?.invoice
                    const storno = entry?.cancellation
                    const paid = o.displayFinancialStatus === 'PAID'
                    return (
                      <tr key={o.id} className="border-b border-line last:border-0 hover:bg-sand-50/60">
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <div className="font-medium tabular-nums text-ink">{o.name}</div>
                          <div className="text-xs tabular-nums text-ink-muted">{fmtDate(o.createdAt)}</div>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-soft" title={customerLabel(o)}>
                          {customerLabel(o)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={isOrderchamp(o) ? 'blue' : 'sand'}>
                            {isOrderchamp(o) ? 'Orderchamp' : 'Onlineshop'}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-ink">
                          {fmtMoney(Number(o.totalPriceSet.shopMoney.amount), o.totalPriceSet.shopMoney.currencyCode)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>

                        {/* Rechnung: Status UND Aktion in einer Spalte – der wichtigste Button steht hier,
                            direkt sichtbar, ohne horizontales Scrollen. */}
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {!inv && paid && (
                            <Button
                              size="sm"
                              className="whitespace-nowrap"
                              onClick={() => setModal({ mode: 'invoice', orderId: o.id, orderName: o.name })}
                              disabled={settingsIncomplete}
                              title={settingsIncomplete ? 'Erst Einstellungen ausfüllen' : 'Rechnung erstellen'}
                            >
                              <FilePlus2 className="h-3.5 w-3.5" /> Rechnung erstellen
                            </Button>
                          )}
                          {!inv && !paid && <span className="text-xs text-ink-faint">nicht bezahlt</span>}

                          {inv && !storno && (
                            <div className="flex items-center gap-1.5">
                              <span className={cn('font-medium tabular-nums', inv.pdf_path ? 'text-ink' : 'text-amber-700')}>
                                {inv.number}
                              </span>
                              {inv.pdf_path ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="whitespace-nowrap"
                                  loading={busyRow === inv.id}
                                  onClick={() => openPdf(inv)}
                                  title={`Rechnung ${inv.number} öffnen`}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" /> PDF
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="whitespace-nowrap"
                                  loading={busyRow === inv.id}
                                  onClick={() => regeneratePdf(inv)}
                                  title="PDF fehlt – aus dem Snapshot neu erzeugen"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" /> PDF erzeugen
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="px-2 text-ink-faint hover:bg-terracotta-50 hover:text-terracotta-600"
                                title="Stornorechnung erstellen"
                                aria-label="Stornorechnung erstellen"
                                onClick={() =>
                                  setModal({ mode: 'cancellation', orderId: o.id, orderName: o.name, original: inv })
                                }
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          {inv && storno && (
                            <div className="flex items-center gap-1.5">
                              <span className="tabular-nums text-ink-faint line-through">{inv.number}</span>
                              <Badge tone="terracotta">Storno</Badge>
                              <span className="font-medium tabular-nums text-ink">{storno.number}</span>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="whitespace-nowrap"
                                loading={busyRow === storno.id}
                                onClick={() => (storno.pdf_path ? openPdf(storno) : regeneratePdf(storno))}
                                title={storno.pdf_path ? `Stornorechnung ${storno.number} öffnen` : 'Storno-PDF neu erzeugen'}
                              >
                                {storno.pdf_path ? (
                                  <ExternalLink className="h-3.5 w-3.5" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}{' '}
                                PDF
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginierung */}
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={prevPage} disabled={cursorStack.length <= 1 || ordersLoading}>
              <ChevronLeft className="h-4 w-4" /> Zurück
            </Button>
            <span className="text-xs text-ink-muted">Seite {cursorStack.length}</span>
            <Button size="sm" variant="secondary" onClick={nextPage} disabled={!pageInfo.hasNextPage || ordersLoading}>
              Weiter <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Umsatzsteuer-Übersicht + CSV-Export je Zeitraum */}
          <div className="mt-8">
            <VatSummaryCard invoices={invoices} />
          </div>
        </>
      )}

      {modal && (
        <InvoicePreviewModal
          open
          onClose={() => setModal(null)}
          mode={modal.mode}
          orderId={modal.orderId}
          orderName={modal.orderName}
          original={modal.mode === 'cancellation' ? modal.original : null}
          settings={settings}
          overrides={overrides}
          onCreated={upsertInvoice}
        />
      )}
    </div>
  )
}
