import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { BoardCard, BoardKey, LabelColor, Profile } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, Select } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardTodos } from '@/components/todos/CardTodos'
import { LABEL_COLORS, boardLabels, cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

/**
 * Detail-Panel einer Karte (rechtes Slide-over): Titel, Beschreibung,
 * Verantwortlicher, farbiges Label – plus verknüpfte To-dos.
 */
export function CardDetail({
  card,
  board,
  columnLabel,
  profiles,
  onClose,
  onSaved,
  onDeleted,
  onTodosChanged,
}: {
  card: BoardCard
  board: BoardKey
  columnLabel: string
  profiles: Profile[]
  onClose: () => void
  onSaved: (card: BoardCard) => void
  onDeleted: (id: string) => void
  onTodosChanged?: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [assignee, setAssignee] = useState(card.assignee_id ?? '')
  const [label, setLabel] = useState<LabelColor | ''>(card.label_color ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setTitle(card.title)
    setDescription(card.description)
    setAssignee(card.assignee_id ?? '')
    setLabel(card.label_color ?? '')
  }, [card])

  const save = async () => {
    if (!title.trim()) {
      toast('Titel darf nicht leer sein.', 'error')
      return
    }
    setSaving(true)
    const changes = {
      title: title.trim(),
      description: description.trim(),
      assignee_id: assignee || null,
      label_color: label || null,
    }
    const { error } = await supabase.from('board_cards').update(changes).eq('id', card.id)
    if (error) toast(error.message, 'error')
    else {
      toast('Karte gespeichert.')
      onSaved({ ...card, ...changes })
      onClose()
    }
    setSaving(false)
  }

  const remove = async () => {
    setSaving(true)
    const { error } = await supabase.from('board_cards').delete().eq('id', card.id)
    if (error) toast(error.message, 'error')
    else {
      toast('Karte gelöscht.')
      onDeleted(card.id)
    }
    setSaving(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="panel"
      title={<span className="text-sm font-normal text-ink-muted">In „{columnLabel}“</span>}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            className="mr-auto text-terracotta-600 hover:bg-terracotta-50"
          >
            <Trash2 className="h-4 w-4" /> Löschen
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Titel">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-base font-medium" />
        </Field>

        <Field label="Beschreibung">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Worum geht es bei dieser Karte?"
            rows={6}
            className="min-h-[160px]"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Verantwortlich">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">— Niemand —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Label">
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setLabel('')}
                className={cn(
                  'inline-flex items-center rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                  label === ''
                    ? 'border-ink-soft bg-sand-100 text-ink'
                    : 'border-line text-ink-muted hover:bg-sand-50',
                )}
              >
                Kein Label
              </button>
              {boardLabels(board).map(({ key, name }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLabel(key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                    label === key
                      ? 'border-sage-400 bg-sage-50 text-ink ring-1 ring-sage-300'
                      : 'border-line text-ink-soft hover:bg-sand-50',
                  )}
                >
                  <span className={cn('h-3 w-3 shrink-0 rounded-full', LABEL_COLORS[key].dot)} />
                  {name}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="border-t border-line pt-4">
          <CardTodos cardId={card.id} profiles={profiles} onChange={onTodosChanged} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={`Karte „${card.title}“ inkl. aller verknüpften To-dos löschen?`}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
        loading={saving}
      />
    </Modal>
  )
}
