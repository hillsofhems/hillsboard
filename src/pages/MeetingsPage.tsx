import { useEffect, useState } from 'react'
import { Plus, CalendarDays, ChevronDown, Pencil, Trash2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Meeting, Profile } from '@/lib/types'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { RichTextEditor, RichTextView } from '@/components/ui/RichText'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { cn, formatDateTime, toDateTimeLocal } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

type MeetingWithParticipants = Meeting & { participantIds: string[] }

/** Meetings: chronologische Liste, ausklappbare Notizen, Teilnehmer-Auswahl. */
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

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Termine mit Protokoll. Klicke ein Meeting an, um die Notizen zu sehen."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Meeting
          </Button>
        }
      />

      {loading ? (
        <Spinner label="Meetings werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Noch keine Meetings"
          description="Lege das erste Meeting an und halte das Protokoll fest."
          action={<Button onClick={() => setEditing('new')}>Meeting anlegen</Button>}
        />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => {
            const isOpen = expanded === m.id
            return (
              <div key={m.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sand-50/60"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-sage-100 text-sage-700">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{m.title}</div>
                    <div className="text-xs text-ink-muted">{formatDateTime(m.meeting_date)}</div>
                  </div>
                  {/* Teilnehmer-Avatare */}
                  <div className="hidden items-center -space-x-1.5 sm:flex">
                    {m.participantIds.slice(0, 4).map((id) => {
                      const p = profiles.find((x) => x.id === id)
                      return p ? (
                        <Avatar
                          key={id}
                          name={p.name}
                          size="xs"
                          className="ring-2 ring-surface"
                        />
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
                      <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
                    <RichTextView html={m.notes} />
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                        <Pencil className="h-3.5 w-3.5" /> Bearbeiten
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
          })}
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
        message={`Meeting „${deleting?.title}“ inkl. Protokoll löschen?`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
        loading={busy}
      />
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

        <Field label="Notizen / Protokoll">
          <RichTextEditor
            value={notes}
            onChange={setNotes}
            placeholder="Agenda, Beschlüsse, nächste Schritte …"
          />
        </Field>
      </div>
    </Modal>
  )
}
