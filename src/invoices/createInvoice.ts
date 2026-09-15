// Ablauf "Rechnung erstellen" / "PDF erneut erzeugen".
//   1) RPC create_invoice   → Nummer vergeben, Snapshot gespeichert (unumkehrbar)
//   2) PDF im Browser rendern
//   3) PDF in Storage hochladen (YYYY/<number>.pdf)
//   4) pdf_path setzen (einmalig)
// Scheitert 2–4, existiert die Rechnung bereits mit vergebener Nummer – das ist
// korrekt so (lückenlos). Der Nutzer kann den PDF-Teil beliebig oft wiederholen.
import {
  createInvoiceRow,
  invoicePdfPath,
  loadLogoDataUrl,
  setInvoicePdfPath,
  uploadInvoicePdf,
} from './api'
import { renderInvoicePdfBlob } from './renderPdf'
import type { InvoiceDraft, InvoiceRow, InvoiceSettings, InvoiceType } from './types'

export type CreateStep = 'rpc' | 'render' | 'upload' | 'finalize' | 'done'

export const STEP_LABELS: Record<CreateStep, string> = {
  rpc: 'Rechnungsnummer vergeben & Snapshot speichern …',
  render: 'PDF wird erzeugt …',
  upload: 'PDF wird hochgeladen …',
  finalize: 'PDF wird verknüpft …',
  done: 'Fertig.',
}

export class InvoiceStepError extends Error {
  step: CreateStep
  /** Bereits angelegte Rechnung (wenn Schritt 1 erfolgreich war). */
  row: InvoiceRow | null
  constructor(step: CreateStep, message: string, row: InvoiceRow | null) {
    super(message)
    this.step = step
    this.row = row
  }
}

/** Rendert, lädt hoch und verknüpft das PDF einer bestehenden Rechnung. */
export async function generateInvoicePdf(
  row: InvoiceRow,
  settings: InvoiceSettings,
  onStep?: (step: CreateStep) => void,
): Promise<InvoiceRow> {
  let step: CreateStep = 'render'
  try {
    onStep?.(step)
    const logo = await loadLogoDataUrl(settings.logo_path)
    const blob = await renderInvoicePdfBlob(row, settings, logo)

    step = 'upload'
    onStep?.(step)
    const path = invoicePdfPath(row)
    await uploadInvoicePdf(path, blob)

    step = 'finalize'
    onStep?.(step)
    const updated = row.pdf_path === path ? row : await setInvoicePdfPath(row.id, path)

    onStep?.('done')
    return updated
  } catch (err) {
    throw new InvoiceStepError(step, err instanceof Error ? err.message : String(err), row)
  }
}

/** Kompletter Ablauf: Rechnung anlegen + PDF erzeugen. */
export async function createInvoiceWithPdf(
  draft: InvoiceDraft,
  type: InvoiceType,
  cancelsInvoiceId: string | null,
  settings: InvoiceSettings,
  onStep?: (step: CreateStep) => void,
): Promise<InvoiceRow> {
  onStep?.('rpc')
  let row: InvoiceRow
  try {
    row = await createInvoiceRow(draft, type, cancelsInvoiceId)
  } catch (err) {
    throw new InvoiceStepError('rpc', err instanceof Error ? err.message : String(err), null)
  }
  return generateInvoicePdf(row, settings, onStep)
}
