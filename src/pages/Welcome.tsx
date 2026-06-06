import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ExternalLink, Briefcase, PartyPopper } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CardTodo, CardTodoAssignee, BoardKey } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { AssigneeDisplay } from '@/components/todos/AssigneePicker'
import { Spinner, ErrorState } from '@/components/ui/States'
import { cn, formatShortDate } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

type TodoWithCard = CardTodo & {
  board_cards: { title: string; column_id: string } | null
}

// Heutiges Datum als YYYY-MM-DD (lokal) – Grenze für "überfällig".
function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Startseite: persönliche Begrüßung + überfällige Aufgaben (DUE). */
export function Welcome() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { nameOf } = useProfiles()
  const meId = profile?.id
  const firstName = (profile?.name || '').trim().split(/\s+/)[0] || 'zusammen'

  const [todos, setTodos] = useState<TodoWithCard[]>([])
  const [assignees, setAssignees] = useState<Record<string, Set<string>>>({})
  const [colBoard, setColBoard] = useState<Record<string, BoardKey>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    const today = todayISO()
    Promise.all([
      supabase
        .from('card_todos')
        .select('*, board_cards(title, column_id)')
        .eq('is_done', false)
        .lt('due_date', today)
        .order('due_date', { ascending: true }),
      supabase.from('card_todo_assignees').select('*'),
      supabase.from('board_columns').select('id, board'),
    ]).then(([tRes, aRes, cRes]) => {
      if (tRes.error) setError(tRes.error.message)
      setTodos((tRes.data as TodoWithCard[]) ?? [])
      const amap: Record<string, Set<string>> = {}
      ;((aRes.data as CardTodoAssignee[]) ?? []).forEach((a) => {
        ;(amap[a.todo_id] ??= new Set()).add(a.user_id)
      })
      setAssignees(amap)
      const cmap: Record<string, BoardKey> = {}
      ;((cRes.data as { id: string; board: BoardKey }[]) ?? []).forEach((c) => {
        cmap[c.id] = c.board
      })
      setColBoard(cmap)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const assigneesOf = (id: string) => assignees[id] ?? new Set<string>()
  const isMine = (t: TodoWithCard) =>
    Boolean(meId) && (t.is_team || assigneesOf(t.id).has(meId as string))
  const boardOf = (t: TodoWithCard): BoardKey | null => {
    if (!t.card_id || !t.board_cards) return null
    return colBoard[t.board_cards.column_id] ?? null
  }

  const visible = useMemo(
    () => (onlyMine ? todos.filter(isMine) : todos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, onlyMine, assignees, meId],
  )
  const mineCount = todos.filter(isMine).length

  const markDone = async (t: TodoWithCard) => {
    setTodos((prev) => prev.filter((x) => x.id !== t.id))
    const { error } = await supabase.from('card_todos').update({ is_done: true }).eq('id', t.id)
    if (error) toast(error.message, 'error')
  }

  return (
    <div>
      {/* Begrüßung */}
      <div className="mb-7 overflow-hidden rounded-2xl border border-sage-200 bg-gradient-to-br from-sage-50 via-sand-50 to-paper p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">
          Hallo {firstName} 👋
        </h1>
        <p className="mt-1.5 text-ink-muted">Ich hoffe, dir geht es gut heute.</p>
      </div>

      {/* DUE / überfällige Aufgaben */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-terracotta-500" />
          <h2 className="font-serif text-lg font-semibold text-ink">Überfällige Aufgaben</h2>
          <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-xs font-medium text-terracotta-600">
            {todos.length}
          </span>
        </div>
        {mineCount > 0 && (
          <button
            onClick={() => setOnlyMine((v) => !v)}
            aria-pressed={onlyMine}
            className={cn(
              'cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              onlyMine
                ? 'border-sage-300 bg-sage-100 text-sage-700'
                : 'border-line-strong bg-surface text-ink-soft hover:bg-sand-50',
            )}
          >
            Nur meine ({mineCount})
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Aufgaben werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-sage-200 bg-sage-50/40 px-6 py-14 text-center">
          <PartyPopper className="mb-3 h-8 w-8 text-sage-500" />
          <h3 className="font-serif text-lg text-ink">Alles im grünen Bereich</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {onlyMine ? 'Du hast keine überfälligen Aufgaben.' : 'Keine überfälligen Aufgaben. 🌿'}
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {visible.map((t) => {
            const mine = isMine(t)
            const names = [...assigneesOf(t.id)].map((id) => nameOf(id)).filter(Boolean)
            const b = boardOf(t)
            return (
              <li
                key={t.id}
                className={cn(
                  'flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 transition-colors',
                  mine ? 'border-l-2 border-l-terracotta-400 bg-terracotta-50/40' : 'hover:bg-sand-50/60',
                )}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => markDone(t)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-sage-500"
                  aria-label="Als erledigt markieren"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{t.text}</p>
                  {t.board_cards ? (
                    <Link
                      to={`/${b === 'daily' ? 'daily' : 'board'}?card=${t.card_id}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-sage-600"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t.board_cards.title}
                    </Link>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-faint">
                      <Briefcase className="h-3 w-3" />
                      Ohne Projekt
                    </span>
                  )}
                </div>

                {/* Fällig-Datum (überfällig -> terrakotta) */}
                <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-terracotta-600 sm:inline-flex">
                  fällig {formatShortDate(t.due_date)}
                </span>

                <AssigneeDisplay isTeam={t.is_team} names={names} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
