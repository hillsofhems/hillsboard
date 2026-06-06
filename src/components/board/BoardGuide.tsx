import { Columns3, Plus, Move, MousePointerClick, ChevronRight, X } from 'lucide-react'

const STEPS = [
  {
    icon: Columns3,
    title: 'Spalte anlegen',
    text: 'Oben rechts auf „Spalte" tippen und benennen.',
  },
  {
    icon: Plus,
    title: 'Karte erstellen',
    text: 'Unten in einer Spalte auf „Karte hinzufügen".',
  },
  {
    icon: Move,
    title: 'Verschieben',
    text: 'Karte mit gedrückter Maus in eine andere Spalte ziehen.',
  },
  {
    icon: MousePointerClick,
    title: 'Details öffnen',
    text: 'Karte anklicken: Beschreibung, Verantwortliche & To-dos.',
  },
]

/** Kurze, grafische Anleitung über dem Board (einklappbar). */
export function BoardGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-sage-200 bg-gradient-to-br from-sage-50 to-sand-50 p-4 sm:p-5 animate-fade-in">
      <button
        onClick={onClose}
        aria-label="Anleitung ausblenden"
        className="absolute right-3 top-3 cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-sage-100 hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 className="mb-4 font-serif text-base font-semibold text-ink">
        So funktioniert das Board
      </h2>

      {/* Schritte: nebeneinander mit Pfeilen (Desktop), gestapelt (Mobile) */}
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-1">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex items-center gap-1 sm:flex-1">
            <div className="flex flex-1 items-start gap-3 rounded-lg bg-surface/70 p-3 sm:flex-col sm:items-center sm:text-center">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-500 text-white">
                <step.icon className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-sage-200 bg-white text-2xs font-bold text-sage-700">
                  {i + 1}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">{step.title}</div>
                <p className="mt-0.5 text-xs leading-snug text-ink-muted">{step.text}</p>
              </div>
            </div>
            {/* Pfeil zwischen den Schritten (nur Desktop, nicht nach dem letzten) */}
            {i < STEPS.length - 1 && (
              <ChevronRight className="hidden h-5 w-5 shrink-0 text-sage-300 sm:block" />
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
