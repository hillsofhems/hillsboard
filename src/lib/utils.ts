import type { LabelColor } from './types'

/** Mini-classNames-Helper (kein clsx-Dependency nötig). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Initialen aus einem Namen (max. 2 Buchstaben) – für Avatare. */
export function initials(name: string): string {
  const clean = name.trim()
  if (!clean) return '?'
  const words = clean.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Deterministische, ruhige Avatar-Hintergrundfarbe je Name. */
const AVATAR_BG = [
  'bg-sage-200 text-sage-700',
  'bg-terracotta-100 text-terracotta-600',
  'bg-sand-200 text-ink-soft',
  'bg-blue-100 text-blue-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
]
export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]
}

/** Label-Farben für Kanban-Karten: Hintergrund/Text/Punkt. */
export const LABEL_COLORS: Record<LabelColor, { dot: string; chip: string; name: string }> = {
  sage: { dot: 'bg-sage-500', chip: 'bg-sage-100 text-sage-700', name: 'Salbei' },
  terracotta: { dot: 'bg-terracotta-500', chip: 'bg-terracotta-100 text-terracotta-600', name: 'Terrakotta' },
  sand: { dot: 'bg-sand-400', chip: 'bg-sand-200 text-ink-soft', name: 'Sand' },
  blue: { dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-700', name: 'Blau' },
  rose: { dot: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700', name: 'Rosé' },
  amber: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', name: 'Amber' },
}

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[]

/**
 * Feste, bedeutungstragende Karten-Labels fürs Board (Farbe -> Bedeutung).
 * Reihenfolge = Reihenfolge in Auswahl & Legende.
 */
export const BOARD_LABELS: { key: LabelColor; name: string }[] = [
  { key: 'sage', name: 'Neue Produkte' },
  { key: 'terracotta', name: 'Vertriebsmöglichkeiten' },
  { key: 'blue', name: 'Events' },
  { key: 'sand', name: 'Weiteres' },
]

/** Name eines Labels anhand der Farbe (Fallback: generischer Farbname). */
export function boardLabelName(key: LabelColor | null | undefined): string {
  if (!key) return ''
  return BOARD_LABELS.find((l) => l.key === key)?.name ?? LABEL_COLORS[key]?.name ?? ''
}

/** Datum hübsch (de-DE), z. B. "6. Juni 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Datum + Uhrzeit (de-DE), z. B. "6. Juni 2026, 14:30". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Kurzes Datum für To-do-Fälligkeit, z. B. "06.06.". */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** True, wenn das Datum in der Vergangenheit liegt (für überfällige To-dos). */
export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

/** Relative Zeitangabe auf Deutsch, z. B. „vor 3 Min." / „gestern". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diffMin = Math.floor((Date.now() - t) / 60000)
  if (diffMin < 1) return 'gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min.`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `vor ${h} Std.`
  const days = Math.floor(h / 24)
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

/** Wandelt ein Datetime-ISO in den Wert für <input type="datetime-local">. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}
