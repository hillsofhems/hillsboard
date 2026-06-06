import { useState, useRef, useEffect } from 'react'
import { Menu, ChevronDown, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

/**
 * Schlanke Topbar mit prominenter Rollenanzeige des eingeloggten Nutzers
 * (z. B. "Engelin · Design & Produktentwicklung") und Profil-Menü.
 */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { profile, myRoles, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Rollen-Text: primäre Rolle + ggf. "+N" für weitere.
  const primary = myRoles[0]
  const roleLabel = primary
    ? `${primary.funktionsbereich} · ${primary.rolle}`
    : 'Noch keine Rolle zugewiesen'

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={onMenu}
        className="cursor-pointer rounded-lg p-2 text-ink-soft hover:bg-sand-100 lg:hidden"
        aria-label="Menü öffnen"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Rollenanzeige – ganz prominent */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-serif text-base text-ink sm:text-lg">
          {profile?.name || 'Team-Mitglied'}
        </span>
        <span className="hidden text-ink-faint sm:inline">·</span>
        <span className="hidden truncate text-sm text-ink-muted sm:inline">{roleLabel}</span>
        {myRoles.length > 1 && (
          <Badge tone="sage" className="hidden sm:inline-flex">
            +{myRoles.length - 1}
          </Badge>
        )}
        {profile?.is_admin && (
          <Badge tone="terracotta" className="ml-1 hidden items-center gap-1 sm:inline-flex">
            <ShieldCheck className="h-3 w-3" /> Admin
          </Badge>
        )}
      </div>

      {/* Profil-Menü */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex cursor-pointer items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-sand-100"
        >
          <Avatar name={profile?.name || '?'} size="sm" />
          <ChevronDown className="h-4 w-4 text-ink-muted" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-slide-up">
            <div className="border-b border-line px-4 py-3">
              <div className="font-medium text-ink">{profile?.name || 'Team-Mitglied'}</div>
              <div className="truncate text-xs text-ink-muted">{profile?.email}</div>
              {/* Auf Mobile die Rolle hier zeigen */}
              <div className="mt-1.5 text-xs text-ink-soft sm:hidden">{roleLabel}</div>
            </div>
            {myRoles.length > 0 && (
              <div className="border-b border-line px-4 py-2.5">
                <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-faint">
                  Meine Rollen
                </div>
                <ul className="space-y-1">
                  {myRoles.map((r) => (
                    <li key={r.id} className="text-xs text-ink-soft">
                      <span className="font-medium text-ink">{r.rolle}</span>
                      <span className="text-ink-faint"> · {r.funktionsbereich}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={signOut}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-ink-soft',
                'transition-colors hover:bg-sand-100 hover:text-ink',
              )}
            >
              <LogOut className="h-4 w-4" /> Abmelden
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
