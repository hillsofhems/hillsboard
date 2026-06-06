import { useEffect, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/types'
import { PageHeader } from '@/components/layout/AppLayout'
import { Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'

/** Team & Rollen: durchsuchbare/filterbare Tabelle aller Funktionsbereiche. */
export function TeamPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')

  const load = () => {
    setLoading(true)
    setError(null)
    supabase
      .from('roles')
      .select('*')
      .order('position')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setRoles((data as Role[]) ?? [])
        setLoading(false)
      })
  }

  useEffect(load, [])

  const areas = useMemo(
    () => Array.from(new Set(roles.map((r) => r.funktionsbereich))),
    [roles],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return roles.filter((r) => {
      if (area && r.funktionsbereich !== area) return false
      if (!q) return true
      return (
        r.funktionsbereich.toLowerCase().includes(q) ||
        r.rolle.toLowerCase().includes(q) ||
        r.beschreibung.toLowerCase().includes(q) ||
        r.verantwortlicher.toLowerCase().includes(q) ||
        r.weitere_personen.toLowerCase().includes(q)
      )
    })
  }, [roles, query, area])

  return (
    <div>
      <PageHeader
        title="Team & Rollen"
        description="Wer ist wofür verantwortlich? Suche und filtere nach Funktionsbereich."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rolle, Beschreibung oder Person suchen …"
            className="pl-9"
            aria-label="Rollen durchsuchen"
          />
        </div>
        <Select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="sm:w-64"
          aria-label="Nach Funktionsbereich filtern"
        >
          <option value="">Alle Funktionsbereiche</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spinner label="Rollen werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Keine Rollen gefunden"
          description="Passe Suche oder Filter an."
        />
      ) : (
        <>
          {/* Desktop-Tabelle */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3 font-semibold">Funktionsbereich</th>
                  <th className="px-4 py-3 font-semibold">Rolle</th>
                  <th className="px-4 py-3 font-semibold">Beschreibung</th>
                  <th className="px-4 py-3 font-semibold">Verantwortlich</th>
                  <th className="px-4 py-3 font-semibold">Weitere</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-line last:border-0 transition-colors hover:bg-sand-50/60"
                  >
                    <td className="px-4 py-3 align-top">
                      <Badge tone="sand">{r.funktionsbereich}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top font-medium text-ink">{r.rolle}</td>
                    <td className="max-w-md px-4 py-3 align-top text-ink-muted">{r.beschreibung}</td>
                    <td className="px-4 py-3 align-top">
                      <Responsible value={r.verantwortlicher} />
                    </td>
                    <td className="px-4 py-3 align-top text-ink-muted">{r.weitere_personen || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile-Karten */}
          <div className="space-y-3 md:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Badge tone="sand">{r.funktionsbereich}</Badge>
                  <Responsible value={r.verantwortlicher} />
                </div>
                <div className="font-medium text-ink">{r.rolle}</div>
                <p className="mt-1 text-sm text-ink-muted">{r.beschreibung}</p>
                {r.weitere_personen && (
                  <p className="mt-2 text-xs text-ink-faint">Weitere: {r.weitere_personen}</p>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-ink-faint">
            {filtered.length} von {roles.length} Rollen
          </p>
        </>
      )}
    </div>
  )
}

/** Stellt den Verantwortlichen dar – „???“ / „-“ als dezenter Hinweis. */
function Responsible({ value }: { value: string }) {
  const v = value.trim()
  if (!v || v === '-' || v === '???') {
    return <span className="text-xs italic text-ink-faint">offen</span>
  }
  return <span className="font-medium text-ink">{v}</span>
}
