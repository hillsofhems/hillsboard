// PDF im Browser rendern. @react-pdf/renderer wird erst bei Bedarf geladen
// (großes Bundle), die Schriften kommen als Vite-Assets aus @fontsource.
import loraRegular from '@fontsource/lora/files/lora-latin-400-normal.woff?url'
import loraSemibold from '@fontsource/lora/files/lora-latin-600-normal.woff?url'
import loraBold from '@fontsource/lora/files/lora-latin-700-normal.woff?url'
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import interMedium from '@fontsource/inter/files/inter-latin-500-normal.woff?url'
import interSemibold from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import { registerInvoiceFonts } from './fonts'
import type { InvoiceRow, InvoiceSettings } from './types'

/** Vite liefert relative Asset-URLs; react-pdf braucht absolute. */
function absolute(url: string): string {
  return new URL(url, window.location.origin).toString()
}

export async function renderInvoicePdfBlob(
  invoice: InvoiceRow,
  settings: InvoiceSettings,
  logoDataUrl: string | null,
): Promise<Blob> {
  const [{ pdf, Font }, { InvoiceDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./InvoiceDocument'),
  ])
  registerInvoiceFonts(Font, {
    lora: { regular: absolute(loraRegular), semibold: absolute(loraSemibold), bold: absolute(loraBold) },
    inter: {
      regular: absolute(interRegular),
      medium: absolute(interMedium),
      semibold: absolute(interSemibold),
      bold: absolute(interBold),
    },
  })
  return pdf(<InvoiceDocument invoice={invoice} settings={settings} logoDataUrl={logoDataUrl} />).toBlob()
}
