// Datenzugriff des Rechnungsmoduls: Edge Function `shopify-orders`, Tabellen
// invoice_settings / invoice_customer_overrides / invoices, Storage-Bucket `invoices`.
import { supabase } from '@/lib/supabase'
import type {
  InvoiceCustomerOverride,
  InvoiceDraft,
  InvoiceRow,
  InvoiceSettings,
  InvoiceType,
  ShopifyOrder,
  ShopifyOrderListItem,
  ShopifyPageInfo,
} from './types'

export const INVOICE_BUCKET = 'invoices'

// ---------------------------------------------------------------------------
// Edge Function
// ---------------------------------------------------------------------------
export interface ListOrdersParams {
  first?: number
  after?: string | null
  from?: string
  to?: string
  paidOnly?: boolean
  channel?: 'all' | 'onlineshop' | 'orderchamp'
  search?: string
}

export interface ListOrdersResult {
  orders: ShopifyOrderListItem[]
  pageInfo: ShopifyPageInfo
  query: string
}

/** Ruft die Edge Function auf und hebt Fehlermeldungen aus dem JSON-Body. */
async function invokeShopify<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('shopify-orders', { body })
  if (error) {
    let message = error.message || 'Shopify-Abfrage fehlgeschlagen.'
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      try {
        const json = (await ctx.clone().json()) as { error?: string }
        if (json?.error) message = json.error
      } catch {
        // Body war kein JSON – Standardmeldung behalten
      }
    }
    throw new Error(message)
  }
  if (!data) throw new Error('Leere Antwort der Edge Function.')
  return data
}

export function listShopifyOrders(params: ListOrdersParams): Promise<ListOrdersResult> {
  return invokeShopify<ListOrdersResult>({ action: 'list', ...params })
}

export async function getShopifyOrder(id: string): Promise<ShopifyOrder> {
  const { order } = await invokeShopify<{ order: ShopifyOrder }>({ action: 'get', id })
  return order
}

// ---------------------------------------------------------------------------
// Einstellungen & Overrides
// ---------------------------------------------------------------------------
export async function loadInvoiceSettings(): Promise<InvoiceSettings | null> {
  const { data, error } = await supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as InvoiceSettings | null) ?? null
}

export async function saveInvoiceSettings(
  patch: Partial<Omit<InvoiceSettings, 'id' | 'updated_at'>>,
): Promise<InvoiceSettings> {
  const { data, error } = await supabase
    .from('invoice_settings')
    .upsert({ id: 1, ...patch }, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as InvoiceSettings
}

export async function loadCustomerOverrides(): Promise<InvoiceCustomerOverride[]> {
  const { data, error } = await supabase
    .from('invoice_customer_overrides')
    .select('*')
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data as InvoiceCustomerOverride[]) ?? []
}

export async function upsertCustomerOverride(
  values: Partial<InvoiceCustomerOverride> & { id?: string },
): Promise<InvoiceCustomerOverride> {
  const { id, created_at: _c, updated_at: _u, ...rest } = values
  const query = id
    ? supabase.from('invoice_customer_overrides').update(rest).eq('id', id)
    : supabase.from('invoice_customer_overrides').insert(rest)
  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)
  return data as InvoiceCustomerOverride
}

export async function deleteCustomerOverride(id: string): Promise<void> {
  const { error } = await supabase.from('invoice_customer_overrides').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Rechnungen
// ---------------------------------------------------------------------------
export async function loadInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as InvoiceRow[]) ?? []
}

export async function loadInvoicesForMonth(year: number, month: number): Promise<InvoiceRow[]> {
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${pad(month)}-01`
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .gte('issue_date', from)
    .lt('issue_date', nextMonth)
    .order('number')
  if (error) throw new Error(error.message)
  return (data as InvoiceRow[]) ?? []
}

/** RPC create_invoice – vergibt die fortlaufende Nummer, schreibt den Snapshot. */
export async function createInvoiceRow(
  draft: InvoiceDraft,
  type: InvoiceType,
  cancelsInvoiceId: string | null,
): Promise<InvoiceRow> {
  const { data, error } = await supabase.rpc('create_invoice', {
    p_order: draft,
    p_type: type,
    p_cancels: cancelsInvoiceId,
  })
  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function setInvoicePdfPath(invoiceId: string, pdfPath: string): Promise<InvoiceRow> {
  const { data, error } = await supabase.rpc('set_invoice_pdf_path', {
    p_invoice_id: invoiceId,
    p_pdf_path: pdfPath,
  })
  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

/** Storage-Pfad einer Rechnung: YYYY/<number>.pdf (muss zur RPC-Prüfung passen). */
export function invoicePdfPath(row: Pick<InvoiceRow, 'issue_date' | 'number'>): string {
  return `${row.issue_date.slice(0, 4)}/${row.number}.pdf`
}

/** Lädt das PDF hoch. Existiert die Datei bereits (Retry), gilt das als Erfolg. */
export async function uploadInvoicePdf(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (error && !/exists|duplicate/i.test(error.message)) {
    throw new Error(`Upload fehlgeschlagen: ${error.message}`)
  }
}

export async function getSignedInvoiceUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Signierte URL konnte nicht erstellt werden.')
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Logo (assets/logo.<ext> im selben Bucket)
// ---------------------------------------------------------------------------
export async function uploadInvoiceLogo(file: File): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : null
  if (!ext) throw new Error('Bitte ein PNG- oder JPG-Logo wählen.')
  const path = `assets/logo.${ext}`
  const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  })
  if (error) throw new Error(`Logo-Upload fehlgeschlagen: ${error.message}`)
  return path
}

/** Logo als Data-URL laden (react-pdf braucht eine eingebettete Bildquelle). */
export async function loadLogoDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const url = await getSignedInvoiceUrl(path, 120)
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
