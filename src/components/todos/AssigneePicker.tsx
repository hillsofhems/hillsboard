import { Users } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

/**
 * Zuweisung eines To-dos: mehrere Personen (Avatare zum Antippen) ODER „Team".
 * Kompakt genug fürs kleine Team – kein Dropdown, direkt tappbar.
 */
export function AssigneePicker({
  profiles,
  selected,
  isTeam,
  onToggleUser,
  onToggleTeam,
}: {
  profiles: Profile[]
  selected: Set<string>
  isTeam: boolean
  onToggleUser: (userId: string) => void
  onToggleTeam: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Team-Umschalter */}
      <button
        type="button"
        onClick={onToggleTeam}
        aria-pressed={isTeam}
        className={cn(
          'inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
          isTeam
            ? 'border-sage-300 bg-sage-100 text-sage-700'
            : 'border-line text-ink-muted hover:bg-sand-50',
        )}
      >
        <Users className="h-3.5 w-3.5" />
        Team
      </button>

      {/* Einzelne Personen */}
      {profiles.map((p) => {
        const active = selected.has(p.id)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggleUser(p.id)}
            aria-pressed={active}
            title={p.name}
            className={cn(
              'rounded-full transition-all',
              active
                ? 'ring-2 ring-sage-500 ring-offset-1 ring-offset-surface'
                : 'opacity-40 grayscale hover:opacity-90 hover:grayscale-0',
            )}
          >
            <Avatar name={p.name} size="sm" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Anzeige der Zuweisung (read-only): „Team", Avatare + Namen oder „Niemand".
 */
export function AssigneeDisplay({
  isTeam,
  names,
  className,
}: {
  isTeam: boolean
  names: string[]
  className?: string
}) {
  if (isTeam) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sage-100 px-2 py-0.5 text-xs font-medium text-sage-700',
          className,
        )}
      >
        <Users className="h-3.5 w-3.5" /> Team
      </span>
    )
  }
  if (names.length === 0) {
    return <span className={cn('shrink-0 text-xs italic text-ink-faint', className)}>Niemand</span>
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5', className)}>
      <span className="flex -space-x-1.5">
        {names.slice(0, 3).map((n, i) => (
          <Avatar key={i} name={n} size="xs" className="ring-2 ring-surface" />
        ))}
      </span>
      <span className="truncate text-xs text-ink-soft">
        {names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`}
      </span>
    </span>
  )
}
