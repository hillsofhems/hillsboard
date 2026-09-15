// Rendert das PDF-Layout in Node (kein Browser nötig) und prüft, dass ein
// gültiges PDF entsteht. Mit INVOICE_PDF_OUT=<ordner> werden die Beispiel-PDFs
// zusätzlich auf die Platte geschrieben (Sichtprüfung des Layouts).
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Font, renderToBuffer } from '@react-pdf/renderer'
import { InvoiceDocument } from './InvoiceDocument'
import { registerInvoiceFonts } from './fonts'
import { buildCancellationDraft, mapOrderToInvoice } from './mapOrderToInvoice'
import type { InvoiceDraft, InvoiceRow } from './types'
import { ORDERCHAMP_OVERRIDE, ORDER_MIXED_RATES, ORDER_ORDERCHAMP, ORDER_WITH_DISCOUNT, SETTINGS } from './__fixtures__/orders'

const require = createRequire(import.meta.url)
const font = (pkg: string, file: string) => require.resolve(`@fontsource/${pkg}/files/${file}`)

registerInvoiceFonts(Font, {
  lora: {
    regular: font('lora', 'lora-latin-400-normal.woff'),
    semibold: font('lora', 'lora-latin-600-normal.woff'),
    bold: font('lora', 'lora-latin-700-normal.woff'),
  },
  inter: {
    regular: font('inter', 'inter-latin-400-normal.woff'),
    medium: font('inter', 'inter-latin-500-normal.woff'),
    semibold: font('inter', 'inter-latin-600-normal.woff'),
    bold: font('inter', 'inter-latin-700-normal.woff'),
  },
})

// Ausstellerdaten wie im Impressum von hillsofhems.com (öffentlich); Bank bewusst leer.
const settings = {
  ...SETTINGS,
  issuer_name: 'beeconnected GmbH',
  issuer_address: 'Abteilung Hills of Hems\nMühlweg 53\n69502 Hemsbach',
  issuer_tax_number: null,
  issuer_vat_id: 'DE214571497',
  issuer_email: 'contact@hillsofhems.com',
  issuer_phone: '+49 6201 4789970',
  issuer_web: 'www.hillsofhems.com',
  bank_details: null,
  footer_text: 'beeconnected GmbH · Sitz: Hemsbach · Amtsgericht Mannheim, HRB 432713 · Geschäftsführer: Rüdiger Heyden',
}

function asRow(draft: InvoiceDraft, number: string, type: InvoiceRow['type'] = 'invoice'): InvoiceRow {
  return {
    ...draft,
    id: `id-${number}`,
    number,
    type,
    cancels_invoice_id: null,
    issue_date: '2026-09-14',
    delivery_date: draft.delivery_date ?? '2026-09-14',
    pdf_path: null,
    created_by: null,
    created_at: '2026-09-14T09:00:00Z',
  }
}

const opts = { settings, overrides: [ORDERCHAMP_OVERRIDE] }
const outDir = process.env.INVOICE_PDF_OUT

async function render(row: InvoiceRow, file: string): Promise<Buffer> {
  const buf = await renderToBuffer(<InvoiceDocument invoice={row} settings={settings} />)
  if (outDir) {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, file), buf)
  }
  return buf
}

describe('InvoiceDocument', () => {
  it('rendert eine Standardrechnung mit Rabatt als PDF', async () => {
    const { draft } = mapOrderToInvoice(ORDER_WITH_DISCOUNT(), opts)
    const buf = await render(asRow(draft, 'HOH-2026-00001'), 'rechnung-standard.pdf')
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(10_000)
  })

  it('rendert eine Reverse-Charge-Rechnung (Orderchamp)', async () => {
    const { draft, blockers } = mapOrderToInvoice(ORDER_ORDERCHAMP(), opts)
    expect(blockers).toEqual([])
    const buf = await render(asRow(draft, 'HOH-2026-00002'), 'rechnung-orderchamp.pdf')
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('rendert eine Stornorechnung mit Bezug auf das Original', async () => {
    const { draft } = mapOrderToInvoice(ORDER_MIXED_RATES(), opts)
    const original = asRow(draft, 'HOH-2026-00003')
    const storno = asRow(buildCancellationDraft(original), 'HOH-2026-00004', 'cancellation')
    const buf = await render(storno, 'stornorechnung.pdf')
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
