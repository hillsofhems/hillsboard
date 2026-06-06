import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, ExternalLink, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CardTodo } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { Select } from '@/components/ui/Field'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { cn, formatShortDate, isOverdue } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

// To-do mit eingebettetem Karten-Titel (für Kontext + Rücklink).
type TodoWithCard = CardTodo & {
  board_cards: { title: string; column_id: string } | null
}

type StatusFilter = 'open' | 'done' | 'all'

/** „Alle To-dos“: filterbar nach Person & Status, mit Rücklink zur Karte. */
export function TodosPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { profiles, nameOf } = useProfiles()
  const meId = profile?.id
  const [todos, setTodos] = useState<TodoWithCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [person, setPerson] = useState<string>('') // '' = alle, 'none' = ohne
  const [status, setStatus] = useState<StatusFilter>('open')

  const load = () => {
    setLoading(true)
    setError(null)
    supabase
      .from('card_todos')
      .select('*, board_cards(title, column_id)')
      .order('is_done')
      .order('due_date', { nullsFirst: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setTodos((data as TodoWithCard[]) ?? [])
        setLoading(false)
      })
  }
  useEffect(load, [])

  const toggle = async (t: TodoWithCard) => {
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_done: !x.is_done } : x)))
    const { error } = await supabase
      .from('card_todos')
      .update({ is_done: !t.is_done })
      .eq('id', t.id)
    if (error) toast(error.message, 'error')
  }

  const filtered = useMemo(() => {
    return todos.filter((t) => {
      if (status === 'open' && t.is_done) return false
      if (status === 'done' && !t.is_done) return false
      if (person === 'none' && t.assignee_id) return false
      if (person && person !== 'none' && t.assignee_id !== person) return false
      return true
    })
  }, [todos, status, person])

  const openCount = todos.filter((t) => !t.is_done).length
  // Offene eigene To-dos (für den Zähler am Schnellfilter).
  const myOpenCount = todos.filter((t) => t.assignee_id === meId && !t.is_done).length
  const mineActive = Boolean(meId) && person === meId

  return (
    <div>
      <PageHeader
        title="To-dos"
        description={`Aufgaben aus allen Board-Karten. ${openCount} offen.`}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Schnellfilter: meine To-dos */}
        <button
          onClick={() => setPerson(mineActive ? '' : (meId ?? ''))}
          aria-pressed={mineActive}
          className={cn(
            'flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors',
            mineActive
              ? 'border-sage-300 bg-sage-100 text-sage-700'
              : 'border-line-strong bg-surface text-ink-soft hover:bg-sand-50',
          )}
        >
          {profile && <Avatar name={profile.name} size="xs" />}
          Meine To-dos
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-2xs',
              mineActive ? 'bg-sage-200 text-sage-700' : 'bg-sand-200 text-ink-muted',
            )}
          >
            {myOpenCount}
          </span>
        </button>

        <Select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          className="sm:w-56"
          aria-label="Nach Person filtern"
        >
          <option value="">Alle Personen</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="none">Ohne Verantwortlichen</option>
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="sm:w-44"
          aria-label="Nach Status filtern"
        >
          <option value="open">Offen</option>
          <option value="done">Erledigt</option>
          <option value="all">Alle</option>
        </Select>
      </div>

      {loading ? (
        <Spinner label="To-dos werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Keine To-dos"
          description="Lege To-dos direkt auf den Karten im Board an."
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {filtered.map((t) => {
            const mine = Boolean(meId) && t.assignee_id === meId
            return (
              <li
                key={t.id}
                className={cn(
                  'flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 transition-colors',
                  mine
                    ? 'border-l-2 border-l-sage-400 bg-sage-50/50 hover:bg-sage-50'
                    : 'hover:bg-sand-50/60',
                )}
              >
                <input
                  type="checkbox"
                  checked={t.is_done}
                  onChange={() => toggle(t)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-sage-500"
                  aria-label="Erledigt"
                />

                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', t.is_done ? 'text-ink-faint line-through' : 'text-ink')}>
                    {t.text}
                  </p>
                  {t.board_cards && (
                    <Link
                      to={`/board?card=${t.card_id}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-sage-600"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t.board_cards.title}
                    </Link>
                  )}
                </div>

                {t.due_date && (
                  <span
                    className={cn(
                      'hidden shrink-0 items-center gap-1 text-xs sm:inline-flex',
                      isOverdue(t.due_date) && !t.is_done ? 'text-terracotta-600' : 'text-ink-muted',
                    )}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {formatShortDate(t.due_date)}
                  </span>
                )}

                {/* Verantwortlich: Avatar + Name (oder „Niemand") */}
                {t.assignee_id ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2',
                      mine ? 'bg-sage-100 text-sage-700' : 'text-ink-soft',
                    )}
                  >
                    <Avatar name={nameOf(t.assignee_id)} size="xs" />
                    <span className="text-xs font-medium">{nameOf(t.assignee_id)}</span>
                    {mine && (
                      <span className="text-2xs font-semibold uppercase text-sage-600">Du</span>
                    )}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs italic text-ink-faint">Niemand</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
