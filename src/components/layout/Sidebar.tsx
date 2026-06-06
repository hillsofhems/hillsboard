import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  CheckSquare,
  CalendarDays,
  Users,
  FolderOpen,
  FileText,
  Shield,
  X,
  Plus,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { usePages } from '@/context/PagesContext'
import { cn } from '@/lib/utils'

const mainNav = [
  { to: '/board', label: 'Board', icon: LayoutGrid },
  { to: '/todos', label: 'To-dos', icon: CheckSquare },
  { to: '/meetings', label: 'Meetings', icon: CalendarDays },
  { to: '/team', label: 'Team & Rollen', icon: Users },
  { to: '/files', label: 'Dateien', icon: FolderOpen },
]

/** Linke Navigations-Sidebar. Auf Mobile als Slide-over (open/onClose). */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { pages } = usePages()

  return (
    <>
      {/* Mobile-Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sand-50/70 backdrop-blur-sm transition-transform duration-200',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Marken-Kopf */}
        <div className="flex h-16 items-center justify-between gap-2 px-5">
          <div className="flex items-center gap-2.5">
            <img
              src="/favicon.svg"
              alt=""
              className="h-9 w-9 rounded-lg border border-line"
            />
            <div className="leading-tight">
              <div className="font-serif text-sm font-semibold text-ink">Hills of Hems</div>
              <div className="text-2xs uppercase tracking-wide text-ink-faint">Team Hub</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-sand-200 lg:hidden"
            aria-label="Menü schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-0.5">
            {mainNav.map((item) => (
              <li key={item.to}>
                <NavItem to={item.to} icon={item.icon} label={item.label} onClick={onClose} />
              </li>
            ))}
          </ul>

          {/* Info-Seiten */}
          <div className="mt-6 mb-1.5 flex items-center justify-between px-3">
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              Seiten
            </span>
            <NavLink
              to="/pages/new"
              onClick={onClose}
              title="Neue Seite"
              className="cursor-pointer rounded p-0.5 text-ink-faint hover:bg-sand-200 hover:text-ink"
            >
              <Plus className="h-3.5 w-3.5" />
            </NavLink>
          </div>
          <ul className="space-y-0.5">
            {pages.length === 0 && (
              <li className="px-3 py-1.5 text-xs text-ink-faint">Noch keine Seiten</li>
            )}
            {pages.map((p) => (
              <li key={p.id}>
                <NavItem to={`/pages/${p.id}`} icon={FileText} label={p.title} onClick={onClose} />
              </li>
            ))}
          </ul>

          {/* Admin */}
          {profile?.is_admin && (
            <>
              <div className="mt-6 mb-1.5 px-3">
                <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Verwaltung
                </span>
              </div>
              <ul className="space-y-0.5">
                <li>
                  <NavItem to="/admin" icon={Shield} label="Admin-Bereich" onClick={onClose} />
                </li>
              </ul>
            </>
          )}
        </nav>
      </aside>
    </>
  )
}

function NavItem({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-surface text-ink shadow-card'
            : 'text-ink-soft hover:bg-sand-100 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              isActive ? 'text-sage-600' : 'text-ink-muted group-hover:text-ink-soft',
            )}
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}
