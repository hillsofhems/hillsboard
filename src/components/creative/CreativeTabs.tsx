import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Zieljahr des Reiters „Ideen …" in der Creative Area. */
export const IDEAS_YEAR = 2027

const TABS = [
  { to: '/creative', label: 'Brainstorming', end: true },
  { to: `/creative/${IDEAS_YEAR}`, label: `Ideen ${IDEAS_YEAR}`, end: false },
]

/** Reiter-Leiste der Creative Area: Brainstorming (Bubbles) | Ideen 2027 (privat). */
export function CreativeTabs() {
  return (
    <div className="mb-6 inline-flex rounded-lg border border-line bg-surface p-1">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              isActive ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
