import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, X, CalendarCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Availability, AvailabilityStatus } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/States'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// --- Datumshelfer (ohne Bibliothek) ---
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function startOfWeekMonday(base: Date): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  const wd = (d.getDay() + 6) % 7 // Mo=0 … So=6
  d.setDate(d.getDate() - wd)
  return d
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/**
 * Team-Verfügbarkeit: jede:r markiert pro Tag „Da" oder „Könnte".
 * Klick auf einen Tag schaltet die EIGENE Verfügbarkeit weiter:
 *   frei → Da → Könnte → frei. Andere sieht man als kleine Avatare.
 */
export function AvailabilityCalendar() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const meId = profile?.id
  const { profiles, nameOf } = useProfiles()

  const [rows, setRows] = useState<Availability[]>([])
  const [loading, setLoading] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)

  const today = useMemo(() => new Date(), [])
  const todayIso = isoDay(today)

  // Erster Tag des angezeigten Monats.
  const monthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + monthOffset, 1),
    [today, monthOffset],
  )
  const viewMonth = monthStart.getMonth()
  const monthLabel = monthStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  // Ganzer Monat im Raster (Mo–So-Wochen, inkl. Rand-Tage der Nachbarmonate).
  const days = useMemo(() => {
    const gridStart = startOfWeekMonday(monthStart)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    const gridEnd = addDays(startOfWeekMonday(monthEnd), 6)
    const count = Math.round((+gridEnd - +gridStart) / 86_400_000) + 1
    return Array.from({ length: count }, (_, i) => addDays(gridStart, i))
  }, [monthStart])

  const load = () => {
    setLoading(true)
    const from = isoDay(days[0])
    const to = isoDay(days[days.length - 1])
    supabase
      .from('availability')
      .select('*')
      .gte('day', from)
      .lte('day', to)
      .then(({ data }) => {
        setRows((data as Availability[]) ?? [])
        setLoading(false)
      })
  }
  useEffect(load, [monthStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // day -> userId -> status
  const map = useMemo(() => {
    const m: Record<string, Record<string, AvailabilityStatus>> = {}
    rows.forEach((r) => {
      ;(m[r.day] ??= {})[r.user_id] = r.status
    })
    return m
  }, [rows])

  const myStatus = (day: string): AvailabilityStatus | undefined =>
    meId ? map[day]?.[meId] : undefined

  // Klick: eigenen Status weiterschalten (frei → Da → Könnte → frei).
  const cycle = async (day: string) => {
    if (!meId) return
    const current = myStatus(day)
    const next: AvailabilityStatus | null =
      current === 'available' ? 'unavailable' : current === 'unavailable' ? null : 'available'

    // optimistisch
    setRows((prev) => {
      const without = prev.filter((r) => !(r.user_id === meId && r.day === day))
      return next ? [...without, { user_id: meId, day, status: next }] : without
    })

    if (next === null) {
      const { error } = await supabase
        .from('availability')
        .delete()
        .eq('user_id', meId)
        .eq('day', day)
      if (error) toast(error.message, 'error')
    } else {
      const { error } = await supabase
        .from('availability')
        .upsert({ user_id: meId, day, status: next }, { onConflict: 'user_id,day' })
      if (error) toast(error.message, 'error')
    }
  }

  const teamSize = profiles.length || 1

  return (
    <div>
      {/* Kopf: Monats-Titel + Navigation */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-ink">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthOffset((m) => m - 1)}
            className="cursor-pointer rounded-lg border border-line-strong bg-surface p-1.5 text-ink-soft hover:bg-sand-50"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            className={cn(
              'cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              monthOffset === 0
                ? 'border-sage-300 bg-sage-100 text-sage-700'
                : 'border-line-strong bg-surface text-ink-soft hover:bg-sand-50',
            )}
          >
            Heute
          </button>
          <button
            onClick={() => setMonthOffset((m) => m + 1)}
            className="cursor-pointer rounded-lg border border-line-strong bg-surface p-1.5 text-ink-soft hover:bg-sand-50"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Legende + Anleitung */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-sage-500" /> Da
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500" /> Kann nicht
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarCheck className="h-3.5 w-3.5 text-sage-600" /> alle da
        </span>
        <span className="text-ink-faint">
          · Klick: frei → <span className="font-medium text-sage-700">Da</span> →{' '}
          <span className="font-medium text-red-600">Kann nicht</span> → frei
        </span>
      </div>

      {loading ? (
        <Spinner label="Verfügbarkeit wird geladen …" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {/* Wochentag-Kopf */}
          <div className="grid grid-cols-7 border-b border-line bg-sand-50">
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Tage */}
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const dayIso = isoDay(d)
              const statuses = map[dayIso] ?? {}
              const availCount = Object.values(statuses).filter((s) => s === 'available').length
              const allHere = availCount > 0 && availCount >= teamSize
              const mine = myStatus(dayIso)
              const isToday = dayIso === todayIso
              const isPast = dayIso < todayIso
              const isWeekend = (d.getDay() + 6) % 7 >= 5
              const isOtherMonth = d.getMonth() !== viewMonth

              return (
                <button
                  key={dayIso}
                  onClick={() => cycle(dayIso)}
                  className={cn(
                    'group relative flex min-h-[84px] cursor-pointer flex-col border-b border-r border-line p-1.5 text-left transition-colors last:border-r-0',
                    isWeekend && 'bg-sand-50/40',
                    isOtherMonth && 'bg-sand-50/30',
                    isPast && !isOtherMonth && 'opacity-60',
                    // eigene Markierung tönt die Zelle
                    mine === 'available' && 'bg-sage-50',
                    mine === 'unavailable' && 'bg-red-50',
                    'hover:bg-sand-100/70',
                  )}
                  title="Klicken: deine Verfügbarkeit ändern"
                >
                  {/* Datumszeile */}
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs',
                        isToday
                          ? 'bg-sage-500 font-semibold text-white'
                          : isOtherMonth
                            ? 'text-ink-faint'
                            : 'text-ink-soft',
                      )}
                    >
                      {d.getDate()}
                    </span>
                    {allHere && <CalendarCheck className="h-3.5 w-3.5 text-sage-600" />}
                  </div>

                  {/* Avatare der Verfügbaren */}
                  <div className="flex flex-wrap gap-0.5">
                    {profiles.map((p) => {
                      const s = statuses[p.id]
                      if (!s) return null
                      return (
                        <span
                          key={p.id}
                          title={`${nameOf(p.id)} · ${s === 'available' ? 'Da' : 'Könnte'}`}
                          className={cn(
                            'rounded-full ring-2',
                            s === 'available' ? 'ring-sage-400' : 'ring-red-400',
                            p.id === meId && 'ring-offset-1 ring-offset-surface',
                          )}
                        >
                          <Avatar name={nameOf(p.id)} size="xs" className="h-5 w-5 text-[10px]" />
                        </span>
                      )
                    })}
                  </div>

                  {/* eigener Status-Hinweis (klein, erscheint dezent) */}
                  {mine && (
                    <span
                      className={cn(
                        'mt-auto inline-flex w-fit items-center gap-0.5 rounded px-1 text-2xs font-medium',
                        mine === 'available' ? 'text-sage-700' : 'text-red-600',
                      )}
                    >
                      {mine === 'available' ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      {mine === 'available' ? 'Du: Da' : 'Du: Kann nicht'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
