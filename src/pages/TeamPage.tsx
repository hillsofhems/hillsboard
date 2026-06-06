import { useEffect, useMemo, useState } from 'react'
import { Search, Users, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { cn } from '@/lib/utils'

/**
 * Team & Rollen: durchsuchbare/filterbare Tabelle aller Funktionsbereiche.
 * Namen im Rollen-Feld werden mit echten Accounts verknüpft; eigene Rollen
 * werden hervorgehoben (per Namens-Match, expliziter Zuweisung oder TEAM/ALLE).
 */
export function TeamPage() {
  const { profile, myRoles } = useAuth()
  const { profiles } = useProfiles()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

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

  // IDs der mir explizit zugewiesenen Rollen (Admin-Zuweisung).
  const myRoleIds = useMemo(() => new Set(myRoles.map((r) => r.id)), [myRoles])

  // Prüft, ob ein Freitext-Name auf mich passt (voller Name oder Vorname).
  const myNames = useMemo(() => {
    const n = (profile?.name ?? '').toLowerCase().trim()
    return n ? new Set([n, n.split(/\s+/)[0]]) : new Set<string>()
  }, [profile])

  // Nur persönliche Treffer zählen als "Meine Rolle" – TEAM/ALLE bewusst NICHT
  // (sonst wäre fast alles markiert).
  const nameIsMine = (token: string) => {
    const t = token.toLowerCase().trim()
    if (!t) return false
    return myNames.has(t)
  }

  // Relevanz-Stufe einer Rolle für den eingeloggten Nutzer:
  //   3 = primär (verantwortlich ODER explizit zugewiesen) -> stärkste Hervorhebung
  //   2 = sekundär (unter "Weitere" genannt)
  //   1 = Team (TEAM/ALLE – betrifft alle, mild)
  //   0 = nicht meine
  const tierOf = (r: Role): 0 | 1 | 2 | 3 => {
    if (myRoleIds.has(r.id) || nameIsMine(r.verantwortlicher)) return 3
    if (r.weitere_personen.split(',').some(nameIsMine)) return 2
    const tokens = [r.verantwortlicher, ...r.weitere_personen.split(',')].map((s) =>
      s.toLowerCase().trim(),
    )
    if (tokens.includes('team') || tokens.includes('alle')) return 1
    return 0
  }

  const areas = useMemo(
    () => Array.from(new Set(roles.map((r) => r.funktionsbereich))),
    [roles],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return roles
      .filter((r) => {
        if (onlyMine && tierOf(r) === 0) return false
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
      // Eigene Rollen nach oben: primär vor sekundär vor Team, dann Reihenfolge.
      .sort((a, b) => tierOf(b) - tierOf(a) || a.position - b.position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, query, area, onlyMine, myRoleIds, myNames])

  const mineCount = useMemo(() => roles.filter((r) => tierOf(r) > 0).length, [roles, myRoleIds, myNames]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader
        title="Team & Rollen"
        description="Wer ist wofür verantwortlich? Deine eigenen Rollen sind hervorgehoben."
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
          className="sm:w-56"
          aria-label="Nach Funktionsbereich filtern"
        >
          <option value="">Alle Funktionsbereiche</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        {/* Schnellfilter: nur meine Rollen */}
        <button
          onClick={() => setOnlyMine((v) => !v)}
          aria-pressed={onlyMine}
          className={cn(
            'flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors',
            onlyMine
              ? 'border-sage-300 bg-sage-100 text-sage-700'
              : 'border-line-strong bg-surface text-ink-soft hover:bg-sand-50',
          )}
        >
          {profile && <Avatar name={profile.name} size="xs" />}
          Nur meine Rollen
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-2xs',
              onlyMine ? 'bg-sage-200 text-sage-700' : 'bg-sand-200 text-ink-muted',
            )}
          >
            {mineCount}
          </span>
        </button>
      </div>

      {loading ? (
        <Spinner label="Rollen werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={onlyMine ? 'Keine eigenen Rollen' : 'Keine Rollen gefunden'}
          description={
            onlyMine
              ? 'Dir sind noch keine Rollen zugeordnet. Ein Admin kann dir welche zuweisen.'
              : 'Passe Suche oder Filter an.'
          }
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
                {filtered.map((r) => {
                  const tier = tierOf(r)
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b border-line last:border-0 transition-colors',
                        tier === 3
                          ? 'bg-sage-50/70 hover:bg-sage-50'
                          : tier === 2
                            ? 'bg-sage-50/35 hover:bg-sage-50/60'
                            : 'hover:bg-sand-50/60',
                      )}
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'h-4 w-0.5 shrink-0 rounded-full',
                              tier === 3 ? 'bg-sage-500' : tier === 2 ? 'bg-sage-300' : 'bg-transparent',
                            )}
                            aria-hidden
                          />
                          <Badge tone="sand">{r.funktionsbereich}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2 font-medium text-ink">
                          {r.rolle}
                          <TierMark tier={tier} />
                        </div>
                      </td>
                      <td className="max-w-md px-4 py-3 align-top text-ink-muted">{r.beschreibung}</td>
                      <td className="px-4 py-3 align-top">
                        <PersonTag name={r.verantwortlicher} profiles={profiles} meId={profile?.id} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <PersonList value={r.weitere_personen} profiles={profiles} meId={profile?.id} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile-Karten */}
          <div className="space-y-3 md:hidden">
            {filtered.map((r) => {
              const tier = tierOf(r)
              return (
                <div
                  key={r.id}
                  className={cn(
                    'card p-4',
                    tier === 3 && 'border-l-2 border-l-sage-500 bg-sage-50/60',
                    tier === 2 && 'border-l-2 border-l-sage-300 bg-sage-50/30',
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Badge tone="sand">{r.funktionsbereich}</Badge>
                    <PersonTag name={r.verantwortlicher} profiles={profiles} meId={profile?.id} />
                  </div>
                  <div className="flex items-center gap-2 font-medium text-ink">
                    {r.rolle}
                    <TierMark tier={tier} />
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{r.beschreibung}</p>
                  {r.weitere_personen && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
                      <span>Weitere:</span>
                      <PersonList value={r.weitere_personen} profiles={profiles} meId={profile?.id} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <p className="mt-4 text-xs text-ink-faint">
            {filtered.length} von {roles.length} Rollen
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Abgestuftes, umbruchsicheres Kennzeichen für die eigene Beteiligung:
 *   3 = "Meine Rolle" (primär, kräftig) · 2 = "Beteiligt" (sekundär) · 1 = "Team".
 */
function TierMark({ tier }: { tier: 0 | 1 | 2 | 3 }) {
  if (tier === 3)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sage-500 px-2 py-0.5 text-2xs font-semibold text-white">
        <Check className="h-3 w-3" />
        Meine Rolle
      </span>
    )
  if (tier === 2)
    return (
      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-sage-200 bg-sage-50 px-2 py-0.5 text-2xs font-medium text-sage-600">
        Beteiligt
      </span>
    )
  if (tier === 1)
    return (
      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-sand-100 px-2 py-0.5 text-2xs font-medium text-ink-faint">
        Team
      </span>
    )
  return null
}

/** Findet das Profil, das zu einem Freitext-Namen passt (voller Name/Vorname). */
function resolveProfile(token: string, profiles: Profile[]): Profile | undefined {
  const t = token.toLowerCase().trim()
  if (!t) return undefined
  return profiles.find((p) => {
    const pn = p.name.toLowerCase().trim()
    if (!pn) return false
    return pn === t || pn.split(/\s+/)[0] === t
  })
}

/** Ein Verantwortlicher: als Account (Avatar) wenn erkannt, sonst Freitext. */
function PersonTag({
  name,
  profiles,
  meId,
}: {
  name: string
  profiles: Profile[]
  meId?: string
}) {
  const t = name.trim()
  // Platzhalter aus den Seed-Daten
  if (!t || t === '-' || t === '???') {
    return <span className="text-xs italic text-ink-faint">offen</span>
  }
  if (t.toLowerCase() === 'team' || t.toLowerCase() === 'alle') {
    return <Badge tone="sand">{t.toUpperCase()}</Badge>
  }

  const prof = resolveProfile(t, profiles)
  const isMe = prof && prof.id === meId

  if (prof) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2',
          isMe ? 'bg-sage-100 text-sage-700' : 'text-ink',
        )}
        title={isMe ? `${prof.name} (du)` : prof.name}
      >
        <Avatar name={prof.name} size="xs" />
        <span className="font-medium">{prof.name}</span>
        {isMe && <span className="text-2xs font-semibold uppercase text-sage-600">Du</span>}
      </span>
    )
  }
  // Kein passender Account -> Freitext (z. B. „Bee", falls kein Account existiert)
  return <span className="text-ink-soft">{t}</span>
}

/** Liste von „Weitere Personen" (komma-getrennt), je als PersonTag. */
function PersonList({
  value,
  profiles,
  meId,
}: {
  value: string
  profiles: Profile[]
  meId?: string
}) {
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return <span className="text-ink-faint">—</span>
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {parts.map((p, i) => (
        <PersonTag key={`${p}-${i}`} name={p} profiles={profiles} meId={meId} />
      ))}
    </div>
  )
}
