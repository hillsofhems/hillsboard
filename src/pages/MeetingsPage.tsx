import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  CalendarDays,
  ChevronDown,
  Pencil,
  Trash2,
  Users,
  ListChecks,
  FileText,
  Clock,
  Video,
  MapPin,
  Tag,
  CalendarPlus,
  Copy,
  Check,
  History,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Meeting, Profile, TeamEvent } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { CollapsibleRichText, RichTextEditor, RichTextView } from '@/components/ui/RichText'
import { AvailabilityCalendar } from '@/components/meetings/AvailabilityCalendar'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { cn, formatDate, formatDateTime, toDateTimeLocal } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { notify } from '@/lib/notify'

type Tab = 'meetings' | 'termine' | 'verfuegbarkeit'

type MeetingWithParticipants = Meeting & { participantIds: string[] }

/**
 * Meetings: gegliedert in „Anstehend" (mit Agenda) und „Vergangen" (mit
 * Protokoll). Jeder Eintrag ist ausklappbar und zeigt Agenda + Protokoll.
 */
export function MeetingsPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { profiles } = useProfiles()
  const [meetings, setMeetings] = useState<MeetingWithParticipants[]>([])
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<MeetingWithParticipants | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Meeting | null>(null)
  const [editingEvent, setEditingEvent] = useState<TeamEvent | 'new' | null>(null)
  const [deletingEvent, setDeletingEvent] = useState<TeamEvent | null>(null)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('meetings')

  const load = async () => {
    setLoading(true)
    setError(null)
    const [m, mp, ev] = await Promise.all([
      supabase.from('meetings').select('*').order('meeting_date', { ascending: false }),
      supabase.from('meeting_participants').select('*'),
      supabase.from('events').select('*').order('starts_at', { ascending: false }),
    ])
    if (m.error) {
      setError(m.error.message)
      setLoading(false)
      return
    }
    const parts = (mp.data as { meeting_id: string; user_id: string }[]) ?? []
    const list = ((m.data as Meeting[]) ?? []).map((meeting) => ({
      ...meeting,
      participantIds: parts.filter((p) => p.meeting_id === meeting.id).map((p) => p.user_id),
    }))
    setMeetings(list)
    setEvents((ev.data as TeamEvent[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  // Aufteilen in anstehend (Datum >= jetzt, nächster zuerst), letztes Meeting
  // (jüngstes vergangenes, hervorgehoben) und die übrigen vergangenen.
  const { upcoming, lastMeeting, past } = useMemo(() => {
    const now = Date.now()
    const up: MeetingWithParticipants[] = []
    const pa: MeetingWithParticipants[] = []
    meetings.forEach((m) => (new Date(m.meeting_date).getTime() >= now ? up : pa).push(m))
    up.sort((a, b) => +new Date(a.meeting_date) - +new Date(b.meeting_date))
    pa.sort((a, b) => +new Date(b.meeting_date) - +new Date(a.meeting_date))
    return { upcoming: up, lastMeeting: pa[0] ?? null, past: pa.slice(1) }
  }, [meetings])

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    const { error } = await supabase.from('meetings').delete().eq('id', deleting.id)
    if (error) toast(error.message, 'error')
    else {
      toast('Meeting gelöscht.')
      setMeetings((prev) => prev.filter((m) => m.id !== deleting.id))
    }
    setDeleting(null)
    setBusy(false)
  }

  const removeEvent = async () => {
    if (!deletingEvent) return
    setBusy(true)
    const { error } = await supabase.from('events').delete().eq('id', deletingEvent.id)
    if (error) toast(error.message, 'error')
    else {
      toast('Termin gelöscht.')
      setEvents((prev) => prev.filter((e) => e.id !== deletingEvent.id))
    }
    setDeletingEvent(null)
    setBusy(false)
  }

  const renderMeeting = (m: MeetingWithParticipants, variant: 'upcoming' | 'last' | 'past') => {
    const isOpen = expanded === m.id
    return (
      <div
        key={m.id}
        className={cn(
          'card overflow-hidden',
          variant === 'upcoming' && 'border-l-2 border-l-sage-400',
          variant === 'last' && 'border-l-2 border-l-amber-400',
        )}
      >
        <button
          onClick={() => setExpanded(isOpen ? null : m.id)}
          className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sand-50/60"
        >
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              variant === 'upcoming' && 'bg-sage-100 text-sage-700',
              variant === 'last' && 'bg-amber-100 text-amber-700',
              variant === 'past' && 'bg-sand-100 text-ink-muted',
            )}
          >
            {variant === 'last' ? (
              <History className="h-5 w-5" />
            ) : (
              <CalendarDays className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">{m.title}</span>
              {variant === 'upcoming' && <Badge tone="sage">Anstehend</Badge>}
              {variant === 'last' && <Badge tone="sand">Letztes Meeting</Badge>}
            </div>
            <div className="text-xs text-ink-muted">
              {formatDateTime(m.meeting_date)}
              {variant === 'last' && !isOpen && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                  <FileText className="h-3 w-3" />
                  {m.notes?.trim()
                    ? 'Protokoll & Agenda ansehen'
                    : 'Noch kein Protokoll – jetzt nachtragen'}
                </span>
              )}
            </div>
          </div>
          {/* Teilnehmer-Avatare */}
          <div className="hidden items-center -space-x-1.5 sm:flex">
            {m.participantIds.slice(0, 4).map((id) => {
              const p = profiles.find((x) => x.id === id)
              return p ? (
                <Avatar key={id} name={p.name} size="xs" className="ring-2 ring-surface" />
              ) : null
            })}
            {m.participantIds.length > 4 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sand-200 text-2xs text-ink-muted ring-2 ring-surface">
                +{m.participantIds.length - 4}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-ink-muted transition-transform',
              isOpen && 'rotate-180',
            )}
          />
        </button>

        {isOpen && (
          <div className="border-t border-line px-4 py-4 animate-fade-in">
            {m.meeting_link?.trim() && (
              <a
                href={m.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-sage-100 px-3 py-2 text-sm font-medium text-sage-700 transition-colors hover:bg-sage-200"
              >
                <Video className="h-4 w-4" /> Meeting öffnen
              </a>
            )}

            {m.participantIds.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-ink-faint" />
                {m.participantIds.map((id) => {
                  const p = profiles.find((x) => x.id === id)
                  return p ? (
                    <span
                      key={id}
                      className="rounded-full bg-sand-100 px-2 py-0.5 text-xs text-ink-soft"
                    >
                      {p.name}
                    </span>
                  ) : null
                })}
              </div>
            )}

            {/* Agenda */}
            <Section icon={ListChecks} label="Agenda">
              <RichTextView html={m.agenda} />
            </Section>

            {/* Protokoll / Minutes */}
            <Section icon={FileText} label="Protokoll" className="mt-4">
              {m.notes?.trim() ? (
                <RichTextView html={m.notes} />
              ) : (
                <p className="text-sm italic text-ink-faint">
                  Noch kein Protokoll – nach dem Meeting hier festhalten.
                </p>
              )}
            </Section>

            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                <Pencil className="h-3.5 w-3.5" />{' '}
                {variant === 'upcoming' ? 'Agenda / Details' : 'Protokoll bearbeiten'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-terracotta-600 hover:bg-terracotta-50"
                onClick={() => setDeleting(m)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Löschen
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Meetings mit Agenda & Protokoll, wichtige Termine und Team-Verfügbarkeit."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setSubscribeOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> Kalender abonnieren
            </Button>
            {tab === 'meetings' && (
              <Button onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" /> Meeting
              </Button>
            )}
            {tab === 'termine' && (
              <Button onClick={() => setEditingEvent('new')}>
                <Plus className="h-4 w-4" /> Termin
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs: Meetings / Termine / Verfügbarkeit */}
      <div className="mb-6 inline-flex rounded-lg border border-line bg-surface p-1">
        {(
          [
            ['meetings', 'Meetings'],
            ['termine', 'Termine'],
            ['verfuegbarkeit', 'Verfügbarkeit'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === key ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'verfuegbarkeit' ? (
        <AvailabilityCalendar />
      ) : loading ? (
        <Spinner label="Wird geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'termine' ? (
        <EventsSection
          events={events}
          onNew={() => setEditingEvent('new')}
          onEdit={setEditingEvent}
          onDelete={setDeletingEvent}
        />
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Noch keine Meetings"
          description="Plane das erste Meeting und lege die Agenda fest."
          action={<Button onClick={() => setEditing('new')}>Meeting anlegen</Button>}
        />
      ) : (
        <div className="space-y-8">
          {/* Anstehend */}
          <section>
            <SectionHeader icon={Clock} title="Anstehend" count={upcoming.length} />
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong bg-sand-50/50 px-4 py-6 text-center text-sm text-ink-muted">
                Keine anstehenden Meetings.
              </p>
            ) : (
              <div className="space-y-3">{upcoming.map((m) => renderMeeting(m, 'upcoming'))}</div>
            )}
          </section>

          {/* Letztes Meeting: jüngstes vergangenes, mit Verweis auf das Protokoll */}
          {lastMeeting && (
            <section>
              <SectionHeader icon={History} title="Letztes Meeting" count={1} />
              {renderMeeting(lastMeeting, 'last')}
            </section>
          )}

          {/* Vergangen */}
          {past.length > 0 && (
            <section>
              <SectionHeader icon={FileText} title="Vergangen" count={past.length} />
              <div className="space-y-3">{past.map((m) => renderMeeting(m, 'past'))}</div>
            </section>
          )}
        </div>
      )}

      {editing && (
        <MeetingEditor
          meeting={editing === 'new' ? null : editing}
          profiles={profiles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        message={`Meeting „${deleting?.title}" inkl. Agenda und Protokoll löschen?`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
        loading={busy}
      />

      {editingEvent && (
        <EventEditor
          event={editingEvent === 'new' ? null : editingEvent}
          createdBy={profile?.id ?? null}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null)
            load()
          }}
        />
      )}

      <ConfirmDialog
        open={deletingEvent !== null}
        message={`Termin „${deletingEvent?.title}" löschen?`}
        onConfirm={removeEvent}
        onClose={() => setDeletingEvent(null)}
        loading={busy}
      />

      {subscribeOpen && (
        <SubscribeModal token={profile?.calendar_token ?? ''} onClose={() => setSubscribeOpen(false)} />
      )}
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  count: number
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-ink-muted" />
      <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
      <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs text-ink-muted">{count}</span>
    </div>
  )
}

function Section({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Meeting anlegen / bearbeiten
// ---------------------------------------------------------------------------
function MeetingEditor({
  meeting,
  profiles,
  onClose,
  onSaved,
}: {
  meeting: MeetingWithParticipants | null
  profiles: Profile[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState(meeting?.title ?? '')
  const [date, setDate] = useState(
    meeting ? toDateTimeLocal(meeting.meeting_date) : toDateTimeLocal(new Date().toISOString()),
  )
  const [meetingLink, setMeetingLink] = useState(meeting?.meeting_link ?? '')
  const [agenda, setAgenda] = useState(meeting?.agenda ?? '')
  const [notes, setNotes] = useState(meeting?.notes ?? '')
  const [participants, setParticipants] = useState<string[]>(meeting?.participantIds ?? [])
  const [saving, setSaving] = useState(false)

  const toggleParticipant = (id: string) =>
    setParticipants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = async () => {
    if (!title.trim()) {
      toast('Bitte einen Titel angeben.', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        meeting_date: new Date(date).toISOString(),
        meeting_link: meetingLink.trim(),
        agenda,
        notes,
      }
      let meetingId = meeting?.id
      const isNew = !meeting
      if (meeting) {
        const { error } = await supabase.from('meetings').update(payload).eq('id', meeting.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('meetings').insert(payload).select().single()
        if (error) throw error
        meetingId = (data as Meeting).id
      }

      // Teilnehmer neu setzen (einfach: alte löschen, neue einfügen).
      if (meetingId) {
        await supabase.from('meeting_participants').delete().eq('meeting_id', meetingId)
        if (participants.length) {
          const { error } = await supabase
            .from('meeting_participants')
            .insert(participants.map((user_id) => ({ meeting_id: meetingId!, user_id })))
          if (error) throw error
        }
      }
      // Bei neuem Meeting: alle Team-Mitglieder per E-Mail benachrichtigen.
      if (isNew && meetingId) void notify({ type: 'meeting', id: meetingId })
      toast(meeting ? 'Meeting gespeichert.' : 'Meeting angelegt.')
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={meeting ? 'Meeting bearbeiten' : 'Neues Meeting'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Titel">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Wochen-Sync"
              autoFocus
            />
          </Field>
          <Field label="Datum & Uhrzeit">
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Meeting-Link (z. B. Google Meet)">
          <Input
            type="url"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://meet.google.com/…"
          />
        </Field>

        <Field label="Teilnehmer">
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => {
              const active = participants.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleParticipant(p.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors',
                    active
                      ? 'border-sage-300 bg-sage-100 text-sage-700'
                      : 'border-line text-ink-muted hover:bg-sand-50',
                  )}
                >
                  <Avatar name={p.name} size="xs" />
                  {p.name}
                </button>
              )
            })}
            {profiles.length === 0 && (
              <span className="text-sm text-ink-faint">Noch keine Team-Mitglieder.</span>
            )}
          </div>
        </Field>

        <Field label="Agenda (vorab)">
          <RichTextEditor
            value={agenda}
            onChange={setAgenda}
            placeholder="Themen / Tagesordnung für das Meeting …"
          />
        </Field>

        <Field label="Protokoll / Minutes (im Nachhinein)">
          <RichTextEditor
            value={notes}
            onChange={setNotes}
            placeholder="Beschlüsse, Ergebnisse, nächste Schritte …"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Termine (events): Liste + Karten
// ---------------------------------------------------------------------------
function EventsSection({
  events,
  onNew,
  onEdit,
  onDelete,
}: {
  events: TeamEvent[]
  onNew: () => void
  onEdit: (e: TeamEvent) => void
  onDelete: (e: TeamEvent) => void
}) {
  // In „anstehend" (Enddatum bzw. Start >= heute) und „vergangen" aufteilen.
  const { upcoming, past } = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const now = startOfToday.getTime()
    const up: TeamEvent[] = []
    const pa: TeamEvent[] = []
    events.forEach((e) => {
      const ref = new Date(e.ends_at ?? e.starts_at).getTime()
      ;(ref >= now ? up : pa).push(e)
    })
    up.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    pa.sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))
    return { upcoming: up, past: pa }
  }, [events])

  if (events.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Noch keine Termine"
        description="Trage wichtige Termine ein – z. B. Märkte, Messen oder Deadlines."
        action={<Button onClick={onNew}>Termin anlegen</Button>}
      />
    )
  }

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader icon={Clock} title="Anstehend" count={upcoming.length} />
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-sand-50/50 px-4 py-6 text-center text-sm text-ink-muted">
            Keine anstehenden Termine.
          </p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} upcoming onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <SectionHeader icon={FileText} title="Vergangen" count={past.length} />
          <div className="space-y-3">
            {past.map((e) => (
              <EventCard key={e.id} event={e} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function EventCard({
  event: e,
  upcoming,
  onEdit,
  onDelete,
}: {
  event: TeamEvent
  upcoming?: boolean
  onEdit: (e: TeamEvent) => void
  onDelete: (e: TeamEvent) => void
}) {
  const when = e.all_day ? formatDate(e.starts_at) : formatDateTime(e.starts_at)
  return (
    <div className={cn('card px-4 py-3.5', upcoming && 'border-l-2 border-l-sage-400')}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            upcoming ? 'bg-sage-100 text-sage-700' : 'bg-sand-100 text-ink-muted',
          )}
        >
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{e.title}</span>
            {e.category && (
              <Badge tone="sand">
                <Tag className="mr-1 h-3 w-3" />
                {e.category}
              </Badge>
            )}
            {upcoming && <Badge tone="sage">Anstehend</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            <span>{when}</span>
            {e.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {e.location}
              </span>
            )}
          </div>
          {e.description?.trim() && (
            <CollapsibleRichText html={e.description} className="mt-2" />
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(e)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-terracotta-600 hover:bg-terracotta-50"
            onClick={() => onDelete(e)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Termin anlegen / bearbeiten
// ---------------------------------------------------------------------------
function EventEditor({
  event,
  createdBy,
  onClose,
  onSaved,
}: {
  event: TeamEvent | null
  createdBy: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? true)
  const [start, setStart] = useState(
    event ? toDateTimeLocal(event.starts_at) : toDateTimeLocal(new Date().toISOString()),
  )
  const [end, setEnd] = useState(event?.ends_at ? toDateTimeLocal(event.ends_at) : '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [category, setCategory] = useState(event?.category ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) {
      toast('Bitte einen Titel angeben.', 'error')
      return
    }
    if (!start) {
      toast('Bitte ein Datum angeben.', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        starts_at: new Date(start).toISOString(),
        ends_at: end ? new Date(end).toISOString() : null,
        all_day: allDay,
        location: location.trim(),
        category: category.trim(),
        description,
      }
      if (event) {
        const { error } = await supabase.from('events').update(payload).eq('id', event.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('events').insert({ ...payload, created_by: createdBy })
        if (error) throw error
      }
      toast(event ? 'Termin gespeichert.' : 'Termin angelegt.')
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={event ? 'Termin bearbeiten' : 'Neuer Termin'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Titel">
            <Input
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              placeholder="z. B. Wochenmarkt Hamburg"
              autoFocus
            />
          </Field>
          <Field label="Kategorie (optional)">
            <Input
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
              placeholder="z. B. Markt, Messe, Deadline"
              list="event-categories"
            />
            <datalist id="event-categories">
              <option value="Markt" />
              <option value="Messe" />
              <option value="Deadline" />
              <option value="Event" />
            </datalist>
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(ev) => setAllDay(ev.target.checked)}
            className="h-4 w-4 rounded border-line-strong text-sage-500 focus:ring-sage-300"
          />
          Ganztägig (ohne Uhrzeit)
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={allDay ? 'Datum' : 'Beginn'}>
            <Input
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? start.slice(0, 10) : start}
              onChange={(ev) =>
                setStart(allDay ? `${ev.target.value}T00:00` : ev.target.value)
              }
            />
          </Field>
          <Field label={allDay ? 'Enddatum (optional)' : 'Ende (optional)'}>
            <Input
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? end.slice(0, 10) : end}
              onChange={(ev) =>
                setEnd(ev.target.value ? (allDay ? `${ev.target.value}T00:00` : ev.target.value) : '')
              }
            />
          </Field>
        </div>

        <Field label="Ort (optional)">
          <Input
            value={location}
            onChange={(ev) => setLocation(ev.target.value)}
            placeholder="z. B. Marktplatz, Messehalle 3 …"
          />
        </Field>

        <Field label="Beschreibung (optional)">
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Details zum Termin …"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Kalender abonnieren: webcal-Link + Google-Calendar-Shortcut + Kopieren
// ---------------------------------------------------------------------------
function SubscribeModal({ token, onClose }: { token: string; onClose: () => void }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const host = typeof window !== 'undefined' ? window.location.host : ''
  const path = `/api/calendar?token=${token}`
  const httpsUrl = `https://${host}${path}`
  const webcalUrl = `webcal://${host}${path}`
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Kopieren nicht möglich – Link bitte manuell markieren.', 'error')
    }
  }

  return (
    <Modal open onClose={onClose} size="md" title="Kalender abonnieren">
      <div className="flex flex-col gap-4 text-sm text-ink-soft">
        <p>
          Abonniere alle <strong>Meetings</strong> und <strong>Termine</strong> in deinem eigenen
          Kalender. Neue oder geänderte Einträge erscheinen dann automatisch – du musst nichts
          manuell importieren.
        </p>

        {!token ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
            Dein Abo-Link ist noch nicht verfügbar. Lade die Seite neu und öffne diesen Dialog erneut.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={webcalUrl}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-sage-500 px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-sage-600"
              >
                <CalendarPlus className="h-4 w-4" /> Zu Apple / Outlook hinzufügen
              </a>
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-sand-50"
              >
                <CalendarPlus className="h-4 w-4" /> Zu Google Kalender
              </a>
            </div>

            <Field label="Oder Link manuell abonnieren">
              <div className="flex gap-2">
                <Input readOnly value={httpsUrl} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </Field>

            <p className="text-xs text-ink-muted">
              Der Link ist persönlich – bitte nicht weitergeben. In Google Kalender: „Andere
              Kalender" → „Per URL". In Apple Kalender: „Ablage" → „Neues Kalenderabonnement".
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
