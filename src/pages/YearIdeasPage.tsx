import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Lightbulb, Pencil, Trash2, Plus, Tags, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { LabelColor, Profile, YearIdea, YearIdeaArea } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { CreativeTabs, IDEAS_YEAR } from '@/components/creative/CreativeTabs'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn, LABEL_COLORS, LABEL_COLOR_KEYS } from '@/lib/utils'

/**
 * Ideen <Jahr> – private Ideenliste je Person (Reiter in der Creative Area).
 * Jede:r sieht und sortiert nur die eigenen Ideen; Admins sehen zusätzlich
 * alle Ideen des Teams (nur lesend). Die Sichtbarkeit wird per RLS erzwungen
 * (siehe migrations/0018_year_ideas.sql), die Seite blendet nur passend ein.
 */
export function YearIdeasPage() {
  const { year: yearParam } = useParams()
  const year = Number(yearParam)
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return <Navigate to={`/creative/${IDEAS_YEAR}`} replace />
  }
  return <YearIdeas key={year} year={year} />
}

type View = 'mine' | 'all'

function YearIdeas({ year }: { year: number }) {
  const { toast } = useToast()
  const { profile } = useAuth()
  const { profiles } = useProfiles()
  const meId = profile?.id ?? ''
  const isAdmin = Boolean(profile?.is_admin)

  const [ideas, setIdeas] = useState<YearIdea[]>([])
  const [areas, setAreas] = useState<YearIdeaArea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('mine')
  const [editing, setEditing] = useState<YearIdea | null>(null)
  const [deleting, setDeleting] = useState<YearIdea | null>(null)
  const [areasOpen, setAreasOpen] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      supabase
        .from('year_ideas')
        .select('*')
        .eq('year', year)
        .order('position')
        .order('created_at'),
      supabase.from('year_idea_areas').select('*').order('position').order('label'),
    ]).then(([i, a]) => {
      if (i.error) setError(i.error.message)
      else if (a.error) setError(a.error.message)
      setIdeas((i.data as YearIdea[]) ?? [])
      setAreas((a.data as YearIdeaArea[]) ?? [])
      setLoading(false)
    })
  }
  useEffect(load, [year])

  const mine = useMemo(() => ideas.filter((i) => i.author_id === meId), [ideas, meId])

  // Wer sieht die eigenen Ideen außer mir? Alle anderen Admins (namentlich).
  const otherAdmins = profiles.filter((p) => p.is_admin && p.id !== meId).map((p) => p.name)
  const privacyLine =
    otherAdmins.length === 0
      ? 'Sichtbar nur für dich.'
      : `Sichtbar nur für dich und ${joinNames(otherAdmins)}.`

  // -------- Aktionen (eigene Ideen) --------
  const addIdea = async (title: string, areaId: string | null) => {
    const text = title.trim()
    if (!text || !meId) return false
    const position = mine.reduce((m, i) => Math.max(m, i.position), -1) + 1
    const { data, error } = await supabase
      .from('year_ideas')
      .insert({ year, author_id: meId, area_id: areaId, title: text, position })
      .select()
      .single()
    if (error) {
      toast(error.message, 'error')
      return false
    }
    setIdeas((prev) => [...prev, data as YearIdea])
    return true
  }

  const saveIdea = async (id: string, patch: Pick<YearIdea, 'title' | 'content' | 'area_id'>) => {
    const { data, error } = await supabase
      .from('year_ideas')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      toast(error.message, 'error')
      return false
    }
    setIdeas((prev) => prev.map((i) => (i.id === id ? (data as YearIdea) : i)))
    return true
  }

  const deleteIdea = async () => {
    if (!deleting) return
    const id = deleting.id
    const { error } = await supabase.from('year_ideas').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    setIdeas((prev) => prev.filter((i) => i.id !== id))
    setDeleting(null)
    toast('Idee gelöscht.')
  }

  const reorder = async (ordered: YearIdea[]) => {
    const changed = ordered
      .map((idea, idx) => ({ idea, idx }))
      .filter(({ idea, idx }) => idea.position !== idx)
    const next = ordered.map((idea, idx) => ({ ...idea, position: idx }))
    setIdeas((prev) => prev.map((i) => next.find((n) => n.id === i.id) ?? i))
    const results = await Promise.all(
      changed.map(({ idea, idx }) =>
        supabase.from('year_ideas').update({ position: idx }).eq('id', idea.id),
      ),
    )
    if (results.some((r) => r.error)) toast('Reihenfolge konnte nicht gespeichert werden.', 'error')
  }

  const showAll = isAdmin && view === 'all'

  return (
    <div>
      <PageHeader
        title={`Ideen ${year}`}
        description={showAll ? 'Alle Ideen des Teams, nach Person. Nur lesend.' : privacyLine}
        actions={
          isAdmin ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setAreasOpen(true)}>
                <Tags className="h-4 w-4" /> Bereiche
              </Button>
              <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
                <ViewButton active={view === 'mine'} onClick={() => setView('mine')}>
                  Meine Ideen
                </ViewButton>
                <ViewButton active={view === 'all'} onClick={() => setView('all')}>
                  Alle Ideen
                </ViewButton>
              </div>
            </>
          ) : undefined
        }
      />
      <CreativeTabs />

      {loading ? (
        <Spinner label="Ideen werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : showAll ? (
        <AllIdeas ideas={ideas} areas={areas} profiles={profiles} meId={meId} />
      ) : (
        <MyIdeas
          ideas={mine}
          areas={areas}
          onAdd={addIdea}
          onEdit={setEditing}
          onDelete={setDeleting}
          onReorder={reorder}
        />
      )}

      <IdeaDialog
        idea={editing}
        areas={areas}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return
          const ok = await saveIdea(editing.id, patch)
          if (ok) setEditing(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Idee löschen?"
        message={deleting ? `„${deleting.title}" wird endgültig gelöscht.` : ''}
        onConfirm={deleteIdea}
        onClose={() => setDeleting(null)}
      />

      {isAdmin && (
        <AreasDialog
          open={areasOpen}
          areas={areas}
          onClose={() => setAreasOpen(false)}
          onChange={setAreas}
          ideaCountOf={(areaId) => ideas.filter((i) => i.area_id === areaId).length}
        />
      )}
    </div>
  )
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors',
        active ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100',
      )}
    >
      {children}
    </button>
  )
}

/** „Anna und Ben" bzw. „Anna, Ben und Clara". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`
}

// ---------------------------------------------------------------------------
// Eigene Ideen: Schnell-Eingabe + sortierbare Liste
// ---------------------------------------------------------------------------
function MyIdeas({
  ideas,
  areas,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
}: {
  ideas: YearIdea[]
  areas: YearIdeaArea[]
  onAdd: (title: string, areaId: string | null) => Promise<boolean>
  onEdit: (idea: YearIdea) => void
  onDelete: (idea: YearIdea) => void
  onReorder: (ordered: YearIdea[]) => void
}) {
  const [title, setTitle] = useState('')
  const [areaId, setAreaId] = useState('')
  const [adding, setAdding] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setAdding(true)
    const ok = await onAdd(title, areaId || null)
    if (ok) setTitle('')
    setAdding(false)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = ideas.findIndex((i) => i.id === active.id)
    const newIndex = ideas.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(ideas, oldIndex, newIndex))
  }

  return (
    <div>
      {/* Schnell-Eingabe */}
      <form
        onSubmit={submit}
        className="mb-6 rounded-2xl border border-sage-200 bg-gradient-to-br from-sage-50 to-sand-50 p-4 sm:p-5"
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft">
          <Lightbulb className="h-4 w-4 text-sage-600" />
          Neue Idee
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Was soll 2027 passieren?"
            maxLength={200}
          />
          <Select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="sm:w-48"
            aria-label="Bereich"
          >
            <option value="">Ohne Bereich</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={adding} disabled={!title.trim()} className="sm:shrink-0">
            <Plus className="h-4 w-4" /> Eintragen
          </Button>
        </div>
      </form>

      {ideas.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Noch keine Ideen"
          description="Trag ein, was dir für das Jahr vorschwebt. Die Reihenfolge ist deine Priorität: oben steht das Wichtigste."
        />
      ) : (
        <>
          <p className="mb-2 px-1 text-2xs uppercase tracking-wider text-ink-faint">
            Oben = wichtigste Idee · per Griff verschieben
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ideas.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {ideas.map((idea, idx) => (
                  <SortableIdeaRow
                    key={idea.id}
                    idea={idea}
                    index={idx}
                    area={areas.find((a) => a.id === idea.area_id) ?? null}
                    onEdit={() => onEdit(idea)}
                    onDelete={() => onDelete(idea)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}

function SortableIdeaRow({
  idea,
  index,
  area,
  onEdit,
  onDelete,
}: {
  idea: YearIdea
  index: number
  area: YearIdeaArea | null
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: idea.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-card transition-shadow hover:border-line-strong hover:shadow-pop',
        isDragging && 'opacity-60',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab touch-none rounded p-1 text-ink-faint hover:bg-sand-100 hover:text-ink active:cursor-grabbing"
        aria-label="Idee verschieben"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="mt-1 w-5 shrink-0 text-right font-serif text-sm text-ink-faint">{index + 1}.</span>

      <IdeaBody idea={idea} area={area} />

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded p-1.5 text-ink-faint hover:bg-sand-100 hover:text-ink"
          aria-label="Idee bearbeiten"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="cursor-pointer rounded p-1.5 text-ink-faint hover:bg-terracotta-50 hover:text-terracotta-600"
          aria-label="Idee löschen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}

/** Titel + Bereichs-Chip + optionaler Text einer Idee. */
function IdeaBody({ idea, area }: { idea: YearIdea; area: YearIdeaArea | null }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium leading-snug text-ink">{idea.title}</p>
        {area && <AreaChip area={area} />}
      </div>
      {idea.content && (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{idea.content}</p>
      )}
    </div>
  )
}

function AreaChip({ area }: { area: YearIdeaArea }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium',
        LABEL_COLORS[area.color].chip,
      )}
    >
      {area.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Admin: alle Ideen, gruppiert nach Person (nur lesend)
// ---------------------------------------------------------------------------
function AllIdeas({
  ideas,
  areas,
  profiles,
  meId,
}: {
  ideas: YearIdea[]
  areas: YearIdeaArea[]
  profiles: Profile[]
  meId: string
}) {
  const [areaFilter, setAreaFilter] = useState('')

  const filtered = areaFilter ? ideas.filter((i) => i.area_id === areaFilter) : ideas
  const byAuthor = (id: string) =>
    filtered
      .filter((i) => i.author_id === id)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))

  if (ideas.length === 0) {
    return (
      <EmptyState
        icon={Lock}
        title="Noch keine Ideen im Team"
        description="Sobald jemand eine Idee einträgt, erscheint sie hier – nach Person gruppiert."
      />
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {ideas.length} {ideas.length === 1 ? 'Idee' : 'Ideen'} von{' '}
          {new Set(ideas.map((i) => i.author_id)).size} Personen
        </p>
        <Select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="sm:w-52"
          aria-label="Nach Bereich filtern"
        >
          <option value="">Alle Bereiche</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-8">
        {profiles.map((p) => {
          const list = byAuthor(p.id)
          return (
            <section key={p.id}>
              <div className="mb-2 flex items-center gap-2.5">
                <Avatar name={p.name} size="sm" />
                <h2 className="font-serif text-lg font-semibold text-ink">
                  {p.name}
                  {p.id === meId && <span className="ml-1.5 text-sm font-normal text-ink-faint">(du)</span>}
                </h2>
                <span className="text-sm text-ink-faint">
                  {list.length} {list.length === 1 ? 'Idee' : 'Ideen'}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-faint">
                  {areaFilter ? 'Keine Idee in diesem Bereich.' : 'Noch nichts eingetragen.'}
                </p>
              ) : (
                <ol className="space-y-2">
                  {list.map((idea, idx) => (
                    <li
                      key={idea.id}
                      className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-card"
                    >
                      <span className="mt-1 w-5 shrink-0 text-right font-serif text-sm text-ink-faint">
                        {idx + 1}.
                      </span>
                      <IdeaBody idea={idea} area={areas.find((a) => a.id === idea.area_id) ?? null} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog: Idee bearbeiten (Titel, Bereich, Text)
// ---------------------------------------------------------------------------
function IdeaDialog({
  idea,
  areas,
  onClose,
  onSave,
}: {
  idea: YearIdea | null
  areas: YearIdeaArea[]
  onClose: () => void
  onSave: (patch: Pick<YearIdea, 'title' | 'content' | 'area_id'>) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [areaId, setAreaId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!idea) return
    setTitle(idea.title)
    setContent(idea.content)
    setAreaId(idea.area_id ?? '')
  }, [idea])

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ title: title.trim(), content: content.trim(), area_id: areaId || null })
    setSaving(false)
  }

  return (
    <Modal
      open={Boolean(idea)}
      onClose={onClose}
      title="Idee bearbeiten"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} loading={saving} disabled={!title.trim()}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Titel" htmlFor="idea-title">
          <Input
            id="idea-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </Field>
        <Field label="Bereich" htmlFor="idea-area">
          <Select id="idea-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Ohne Bereich</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Text" htmlFor="idea-content">
          <Textarea
            id="idea-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="Worum geht es, was bräuchte es dafür?"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Dialog (Admin): Bereiche pflegen – Name, Farbe, Reihenfolge, löschen
// ---------------------------------------------------------------------------
function AreasDialog({
  open,
  areas,
  onClose,
  onChange,
  ideaCountOf,
}: {
  open: boolean
  areas: YearIdeaArea[]
  onClose: () => void
  onChange: (areas: YearIdeaArea[]) => void
  ideaCountOf: (areaId: string) => number
}) {
  const { toast } = useToast()
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState<LabelColor>('sage')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<YearIdeaArea | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    setAdding(true)
    const position = areas.reduce((m, a) => Math.max(m, a.position), -1) + 1
    const { data, error } = await supabase
      .from('year_idea_areas')
      .insert({ label, color: newColor, position })
      .select()
      .single()
    setAdding(false)
    if (error) return toast(error.message, 'error')
    onChange([...areas, data as YearIdeaArea])
    setNewLabel('')
  }

  const update = async (id: string, patch: Partial<Pick<YearIdeaArea, 'label' | 'color'>>) => {
    onChange(areas.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    const { error } = await supabase.from('year_idea_areas').update(patch).eq('id', id)
    if (error) toast(error.message, 'error')
  }

  const remove = async () => {
    if (!removing) return
    const id = removing.id
    const { error } = await supabase.from('year_idea_areas').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    onChange(areas.filter((a) => a.id !== id))
    setRemoving(null)
    toast('Bereich gelöscht.')
  }

  return (
    <Modal open={open} onClose={onClose} title="Bereiche">
      <ul className="space-y-2">
        {areas.length === 0 && <li className="text-sm text-ink-faint">Noch keine Bereiche.</li>}
        {areas.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line p-2">
            <ColorPicker value={a.color} onChange={(color) => update(a.id, { color })} />
            <AreaLabelInput value={a.label} onCommit={(label) => update(a.id, { label })} />
            <button
              type="button"
              onClick={() => setRemoving(a)}
              className="cursor-pointer rounded p-1.5 text-ink-faint hover:bg-terracotta-50 hover:text-terracotta-600"
              aria-label={`Bereich ${a.label} löschen`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        <ColorPicker value={newColor} onChange={setNewColor} />
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Neuer Bereich"
          maxLength={40}
          className="h-9"
        />
        <Button type="submit" size="sm" loading={adding} disabled={!newLabel.trim()}>
          <Plus className="h-4 w-4" /> Anlegen
        </Button>
      </form>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Bereich löschen?"
        message={
          removing
            ? `„${removing.label}" wird gelöscht. ${
                ideaCountOf(removing.id) > 0
                  ? `${ideaCountOf(removing.id)} ${ideaCountOf(removing.id) === 1 ? 'Idee bleibt' : 'Ideen bleiben'} erhalten, nur ohne Bereich.`
                  : 'Es hängen keine Ideen daran.'
              }`
            : ''
        }
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </Modal>
  )
}

/** Textfeld, das erst beim Verlassen bzw. mit Enter speichert. */
function AreaLabelInput({ value, onCommit }: { value: string; onCommit: (label: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const label = draft.trim()
    if (!label) return setDraft(value)
    if (label !== value) onCommit(label)
  }
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      maxLength={40}
      className="h-9"
      aria-label="Name des Bereichs"
    />
  )
}

/** Sechs Farbpunkte (Label-Farben der Boards), eine aktiv. */
function ColorPicker({ value, onChange }: { value: LabelColor; onChange: (c: LabelColor) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="radiogroup" aria-label="Farbe">
      {LABEL_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          title={LABEL_COLORS[key].name}
          onClick={() => onChange(key)}
          className={cn(
            'h-5 w-5 cursor-pointer rounded-full border-2 transition-transform',
            LABEL_COLORS[key].dot,
            value === key ? 'scale-110 border-ink' : 'border-transparent hover:scale-110',
          )}
        />
      ))}
    </div>
  )
}
