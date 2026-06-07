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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Meeting, Profile } from '@/lib/types'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { RichTextEditor, RichTextView } from '@/components/ui/RichText'
import { AvailabilityCalendar } from '@/components/meetings/AvailabilityCalendar'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { cn, formatDateTime, toDateTimeLocal } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

type MeetingWithParticipants = Meeting & { participantIds: string[] }

/**
 * Meetings: gegliedert in „Anstehend" (mit Agenda) und „Vergangen" (mit
 * Protokoll). Jeder Eintrag ist ausklappbar und zeigt Agenda + Protokoll.
 */
export function MeetingsPage() {
  const { toast } = useToast()
  const { profiles } = useProfiles()
  const [meetings, setMeetings] = useState<MeetingWithParticipants[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<MeetingWithParticipants | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Meeting | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'termine' | 'verfuegbarkeit'>('termine')

  const load = async () => {
    setLoading(true)
    setError(null)
    const [m, mp] = await Promise.all([
      supabase.from('meetings').select('*').order('meeting_date', { ascending: false }),
      supabase.from('meeting_participants').select('*'),
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
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  // Aufteilen in anstehend (Datum >= jetzt, nächster zuerst) und vergangen.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const up: MeetingWithParticipants[] = []
    const pa: MeetingWithParticipants[] = []
    meetings.forEach((m) => (new Date(m.meeting_date).getTime() >= now ? up : pa).push(m))
    up.sort((a, b) => +new Date(a.meeting_date) - +new Date(b.meeting_date))
    pa.sort((a, b) => +new Date(b.meeting_date) - +new Date(a.meeting_date))
    return { upcoming: up, past: pa }
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

  const renderMeeting = (m: MeetingWithParticipants, variant: 'upcoming' | 'past') => {
    const isOpen = expanded === m.id
    return (
      <div
        key={m.id}
        className={cn(
          'card overflow-hidden',
          variant === 'upcoming' && 'border-l-2 border-l-sage-400',
        )}
      >
        <button
          onClick={() => setExpanded(isOpen ? null : m.id)}
          className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sand-50/60"
        >
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              variant === 'upcoming' ? 'bg-sage-100 text-sage-700' : 'bg-sand-100 text-ink-muted',
            )}
          >
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">{m.title}</span>
              {variant === 'upcoming' && <Badge tone="sage">Anstehend</Badge>}
            </div>
            <div className="text-xs text-ink-muted">{formatDateTime(m.meeting_date)}</div>
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
        description="Termine mit Agenda & Protokoll – plus Team-Verfügbarkeit."
        actions={
          tab === 'termine' && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Meeting
            </Button>
          )
        }
      />

      {/* Tabs: Termine / Verfügbarkeit */}
      <div className="mb-6 inline-flex rounded-lg border border-line bg-surface p-1">
        <button
          onClick={() => setTab('termine')}
          className={cn(
            'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'termine' ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100',
          )}
        >
          Termine
        </button>
        <button
          onClick={() => setTab('verfuegbarkeit')}
          className={cn(
            'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'verfuegbarkeit' ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100',
          )}
        >
          Verfügbarkeit
        </button>
      </div>

      {tab === 'verfuegbarkeit' ? (
        <AvailabilityCalendar />
      ) : loading ? (
        <Spinner label="Meetings werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
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
        agenda,
        notes,
      }
      let meetingId = meeting?.id
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
