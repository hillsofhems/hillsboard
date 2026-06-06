import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ExternalLink,
  Briefcase,
  PartyPopper,
  ListChecks,
  Heart,
  Pencil,
  Send,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CardTodo, CardTodoAssignee, BoardKey, TeamMessage } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { AssigneeDisplay } from '@/components/todos/AssigneePicker'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Spinner, ErrorState } from '@/components/ui/States'
import { cn, formatShortDate, timeAgo } from '@/lib/utils'
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

/** Startseite: Begrüßung, eigene überfällige + weitere To-dos, Team-Blasen. */
export function Welcome() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { nameOf } = useProfiles()
  const meId = profile?.id
  const firstName = (profile?.name || '').trim().split(/\s+/)[0] || 'zusammen'
  const today = todayISO()

  const [todos, setTodos] = useState<TodoWithCard[]>([])
  const [assignees, setAssignees] = useState<Record<string, Set<string>>>({})
  const [colBoard, setColBoard] = useState<Record<string, BoardKey>>({})
  const [teamMsgs, setTeamMsgs] = useState<TeamMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      supabase
        .from('card_todos')
        .select('*, board_cards(title, column_id)')
        .eq('is_done', false)
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('card_todo_assignees').select('*'),
      supabase.from('board_columns').select('id, board'),
      supabase.from('team_messages').select('*').order('created_at', { ascending: false }),
    ]).then(([tRes, aRes, cRes, mRes]) => {
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
      setTeamMsgs((mRes.data as TeamMessage[]) ?? [])
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
  const isOverdue = (t: TodoWithCard) => Boolean(t.due_date && t.due_date < today)

  // Nur die To-dos der eingeloggten Person, aufgeteilt in überfällig / weitere.
  const { overdue, others } = useMemo(() => {
    const mine = todos.filter(isMine)
    return {
      overdue: mine.filter(isOverdue),
      others: mine.filter((t) => !isOverdue(t)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, assignees, meId, today])

  const markDone = async (t: TodoWithCard) => {
    setTodos((prev) => prev.filter((x) => x.id !== t.id))
    const { error } = await supabase.from('card_todos').update({ is_done: true }).eq('id', t.id)
    if (error) toast(error.message, 'error')
  }

  // Eigene Team-Nachricht posten/ändern (neue Zeile -> wird zur aktuellen).
  const postTeamMessage = async (content: string): Promise<boolean> => {
    if (!content.trim() || !meId) return false
    const { data, error } = await supabase
      .from('team_messages')
      .insert({ content: content.trim(), author_id: meId })
      .select()
      .single()
    if (error) {
      toast(error.message, 'error')
      return false
    }
    setTeamMsgs((prev) => [data as TeamMessage, ...prev])
    toast('Nachricht gespeichert.')
    return true
  }

  // Eine To-do-Zeile rendern.
  const renderRow = (t: TodoWithCard, overdueRow: boolean) => {
    const names = [...assigneesOf(t.id)].map((id) => nameOf(id)).filter(Boolean)
    const b = boardOf(t)
    return (
      <li
        key={t.id}
        className={cn(
          'flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 transition-colors hover:bg-sand-50/60',
          overdueRow && 'border-l-2 border-l-terracotta-400 bg-terracotta-50/30',
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
        {t.due_date && (
          <span
            className={cn(
              'hidden shrink-0 items-center gap-1 text-xs sm:inline-flex',
              overdueRow ? 'font-medium text-terracotta-600' : 'text-ink-muted',
            )}
          >
            fällig {formatShortDate(t.due_date)}
          </span>
        )}
        <AssigneeDisplay isTeam={t.is_team} names={names} />
      </li>
    )
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Links: meine Aufgaben */}
        <div className="space-y-6 lg:col-span-2">
          {loading ? (
            <Spinner label="Aufgaben werden geladen …" />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              {/* Meine überfälligen */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-terracotta-500" />
                  <h2 className="font-serif text-lg font-semibold text-ink">Überfällig</h2>
                  <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-xs font-medium text-terracotta-600">
                    {overdue.length}
                  </span>
                </div>
                {overdue.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-sage-200 bg-sage-50/40 px-4 py-4 text-sm text-ink-muted">
                    <PartyPopper className="h-4 w-4 text-sage-500" />
                    Nichts überfällig – stark! 🌿
                  </div>
                ) : (
                  <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                    {overdue.map((t) => renderRow(t, true))}
                  </ul>
                )}
              </section>

              {/* Meine weiteren To-dos */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-ink-muted" />
                  <h2 className="font-serif text-lg font-semibold text-ink">Meine weiteren To-dos</h2>
                  <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs text-ink-muted">
                    {others.length}
                  </span>
                </div>
                {others.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line-strong bg-sand-50/50 px-4 py-4 text-sm text-ink-muted">
                    Keine weiteren offenen To-dos.
                  </p>
                ) : (
                  <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                    {others.map((t) => renderRow(t, false))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        {/* Rechts: Gedankenblasen – eine eigene Nachricht pro Person */}
        <TeamMessages messages={teamMsgs} meId={meId} nameOf={nameOf} onPost={postTeamMessage} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team-Nachrichten: pro Person die neueste, als Gedankenblasen.
// Die eigene ist editierbar (jederzeit änderbar), die anderen read-only.
// ---------------------------------------------------------------------------
const TINTS = [
  'bg-sage-50 border-sage-200',
  'bg-terracotta-50 border-terracotta-200',
  'bg-amber-50 border-amber-200',
  'bg-blue-50 border-blue-200',
  'bg-rose-50 border-rose-200',
]
function tint(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

function TeamMessages({
  messages,
  meId,
  nameOf,
  onPost,
}: {
  messages: TeamMessage[]
  meId?: string
  nameOf: (id: string | null | undefined) => string
  onPost: (content: string) => Promise<boolean>
}) {
  // Neueste Nachricht je Autor.
  const latest = useMemo(() => {
    const m = new Map<string, TeamMessage>()
    messages.forEach((msg) => {
      if (msg.author_id && !m.has(msg.author_id)) m.set(msg.author_id, msg)
    })
    return m
  }, [messages])

  const myMsg = meId ? latest.get(meId) ?? null : null
  const others = [...latest.values()].filter((m) => m.author_id !== meId)

  return (
    <div>
      <h2 className="mb-4 font-serif text-lg font-semibold text-ink">Nachrichten ans Team</h2>

      {/* Locker überlappender Cluster: leicht schräg, eng gestapelt,
          beim Hovern richtet sich die Blase auf & hebt sich nach vorne. */}
      <div className="relative">
        {/* Eigene Blase – oben, voll sichtbar */}
        <div className="group relative z-30">
          <OwnBubble message={myMsg} name={nameOf(meId)} onPost={onPost} />
        </div>

        {/* Blasen der anderen – überlappend darunter gefächert */}
        {others.map((m, i) => (
          <div
            key={m.id}
            style={{ zIndex: 20 - i }}
            className={cn(
              'group relative -mt-3 transition-all duration-200',
              'hover:z-40 hover:-translate-y-1 hover:rotate-0 hover:scale-[1.02]',
              i % 2 === 0 ? 'rotate-2' : '-rotate-2',
            )}
          >
            <Bubble
              authorId={m.author_id ?? 'x'}
              name={nameOf(m.author_id) || 'Team'}
              content={m.content}
              createdAt={m.created_at}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Gedankenblase-Hülle (Schatten hebt sich beim Hovern der Gruppe). */
function BubbleShell({
  colorClass,
  children,
}: {
  colorClass: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 shadow-card transition-shadow group-hover:shadow-pop',
        colorClass,
      )}
    >
      {children}
    </div>
  )
}

function Bubble({
  authorId,
  name,
  content,
  createdAt,
}: {
  authorId: string
  name: string
  content: string
  createdAt: string
}) {
  return (
    <BubbleShell colorClass={tint(authorId)}>
      <blockquote className="font-serif text-base italic leading-snug text-ink">
        „{content}"
      </blockquote>
      <div className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-muted">
        <Avatar name={name} size="xs" className="h-5 w-5 text-[10px]" />
        <span className="font-medium text-ink">{name}</span>
        <span>· {timeAgo(createdAt)}</span>
      </div>
    </BubbleShell>
  )
}

function OwnBubble({
  message,
  name,
  onPost,
}: {
  message: TeamMessage | null
  name: string
  onPost: (content: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const submit = async () => {
    if (!draft.trim()) return
    setPosting(true)
    const ok = await onPost(draft)
    setPosting(false)
    if (ok) {
      setDraft('')
      setEditing(false)
    }
  }

  return (
    <BubbleShell colorClass="bg-gradient-to-br from-sage-50 to-sand-50 border-sage-300 ring-1 ring-sage-200">
      <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-sage-700">
        <Heart className="h-3.5 w-3.5 fill-sage-300 text-sage-500" />
        Deine Nachricht
      </div>

      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={3}
            placeholder="Schreib dem Team etwas Schönes …"
            className="w-full resize-none rounded-xl border border-line-strong bg-surface/80 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setDraft('')
              }}
            >
              Abbrechen
            </Button>
            <Button size="sm" onClick={submit} loading={posting} disabled={!draft.trim()}>
              <Send className="h-3.5 w-3.5" /> Posten
            </Button>
          </div>
        </div>
      ) : message ? (
        <>
          <blockquote className="font-serif text-base italic leading-snug text-ink">
            „{message.content}"
          </blockquote>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Avatar name={name || 'Du'} size="xs" className="h-5 w-5 text-[10px]" />
              <span className="font-medium text-ink">{name || 'Du'}</span>
              <span>· {timeAgo(message.created_at)}</span>
            </span>
            <button
              onClick={() => {
                setDraft(message.content)
                setEditing(true)
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-muted transition-colors hover:bg-sage-100 hover:text-ink"
            >
              <Pencil className="h-3 w-3" /> Ändern
            </button>
          </div>
        </>
      ) : (
        <div>
          <p className="mb-3 text-sm text-ink-muted">
            Du hast noch keine Nachricht. Schreib dem Team etwas Schönes. 💚
          </p>
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Nachricht schreiben
          </Button>
        </div>
      )}
    </BubbleShell>
  )
}
