// Formatierung & Geld-Arithmetik für das Rechnungsmodul.
// Beträge werden intern in CENT (Integer) gerechnet – nie mit Floats.

/** "12.74" | 12.74 → 1274 Cent. */
export function toCents(amount: string | number | null | undefined): number {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** 1274 → 12.74 (Dezimalzahl mit 2 Nachkommastellen für Snapshot/JSON). */
export function fromCents(cents: number): number {
  const v = Math.round(cents) / 100
  return v === 0 ? 0 : v // -0 vermeiden (Storno-Negation von 0)
}

/** Summe von Cent-Beträgen. */
export function sumCents(values: number[]): number {
  return values.reduce((s, v) => s + v, 0)
}

const NUMBER_DE = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1234.5 → "1.234,50". */
export function fmtNumber(n: number): string {
  return NUMBER_DE.format(Number.isFinite(n) ? n : 0)
}

/** 1234.5 → "1.234,50 €" (Währungssymbol nach deutscher Konvention hinten). */
export function fmtMoney(n: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency
  return `${fmtNumber(n)} ${symbol}`
}

/** 19 → "19 %", 7.5 → "7,5 %". */
export function fmtPercent(rate: number): string {
  const s = Number.isInteger(rate) ? String(rate) : String(rate).replace('.', ',')
  return `${s} %`
}

/** "2026-06-08" | ISO-Zeitstempel → "08.06.2026". */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return ''
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toBerlinDate(value)
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

const BERLIN_YMD = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** ISO-Zeitstempel → Kalendertag in Europe/Berlin als YYYY-MM-DD. */
export function toBerlinDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return BERLIN_YMD.format(d) // sv-SE liefert genau "YYYY-MM-DD"
}

/** Heutiger Kalendertag in Europe/Berlin (YYYY-MM-DD). */
export function todayBerlin(): string {
  return BERLIN_YMD.format(new Date())
}

/** Zahl für CSV mit Dezimalkomma, ohne Tausenderpunkt: 1234.5 → "1234,50". */
export function csvNumber(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')
}

/** Mehrzeiligen Text (Textarea) in getrimmte, nicht-leere Zeilen zerlegen. */
export function splitLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}
