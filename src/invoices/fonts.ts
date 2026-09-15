// Schriften für das PDF: Lora (Marke, Überschriften) + Inter (Fließtext, Tabellen)
// – dieselben Schriften wie im Hub. Quelle: @fontsource (WOFF, lokal gebündelt).
// Die Registrierung ist vom Renderer entkoppelt, damit sie im Browser (Vite-URLs)
// und in Node-Tests (Dateipfade) gleich funktioniert.
import type { Font as FontApi } from '@react-pdf/renderer'

export const FONT_SERIF = 'Lora'
export const FONT_SANS = 'Inter'

export interface FontSources {
  lora: { regular: string; semibold: string; bold: string }
  inter: { regular: string; medium: string; semibold: string; bold: string }
}

let registered = false

export function registerInvoiceFonts(Font: typeof FontApi, src: FontSources): void {
  if (registered) return
  registered = true

  Font.register({
    family: FONT_SERIF,
    fonts: [
      { src: src.lora.regular, fontWeight: 400 },
      { src: src.lora.semibold, fontWeight: 600 },
      { src: src.lora.bold, fontWeight: 700 },
    ],
  })
  Font.register({
    family: FONT_SANS,
    fonts: [
      { src: src.inter.regular, fontWeight: 400 },
      { src: src.inter.medium, fontWeight: 500 },
      { src: src.inter.semibold, fontWeight: 600 },
      { src: src.inter.bold, fontWeight: 700 },
    ],
  })
  // Keine Silbentrennung in Rechnungen (Produktnamen, Nummern).
  Font.registerHyphenationCallback((word) => [word])
}
