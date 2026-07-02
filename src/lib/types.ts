// Zentrale TypeScript-Typen – spiegeln das Supabase-Schema (siehe migrations/).

export interface Profile {
  id: string
  name: string
  email: string
  is_admin: boolean
  calendar_token: string // geheimer Token für die persönliche Kalender-Abo-URL
  created_at: string
}

export interface Role {
  id: string
  funktionsbereich: string
  rolle: string
  beschreibung: string
  verantwortlicher: string
  weitere_personen: string
  position: number
  created_at: string
}

export interface UserRole {
  user_id: string
  role_id: string
  created_at: string
}

export type BoardKey = 'season' | 'daily'

export interface BoardColumn {
  id: string
  label: string
  position: number
  board: BoardKey
  created_at: string
}

/** Erlaubte Label-Farben für Karten (Schlüssel -> Tailwind-Klassen in utils). */
export type LabelColor = 'sage' | 'terracotta' | 'sand' | 'blue' | 'rose' | 'amber'

export interface BoardCard {
  id: string
  column_id: string
  title: string
  description: string
  assignee_id: string | null
  label_color: LabelColor | null
  position: number
  created_at: string
}

export interface CardTodo {
  id: string
  card_id: string | null // NULL = "Daily Business" (kein Projekt verknüpft)
  text: string
  assignee_id: string | null // Legacy (Einzel-Zuweisung); UI nutzt assignees + is_team
  is_team: boolean // true = ganzes Team
  due_date: string | null
  is_done: boolean
  done_comment: string | null // Optionale Notiz beim Abhaken
  done_at: string | null // Zeitpunkt des Abhakens
  done_by: string | null // Wer abgehakt hat
  position: number
  created_at: string
}

export interface CardTodoAssignee {
  todo_id: string
  user_id: string
}

export interface Meeting {
  id: string
  title: string
  meeting_date: string
  meeting_link: string // optionaler Link zum Online-Meeting (z. B. Google Meet)
  agenda: string // Tagesordnung (vorab)
  notes: string // Protokoll / Minutes (im Nachhinein)
  created_at: string
}

export interface MeetingParticipant {
  meeting_id: string
  user_id: string
}

/** Wichtiger Termin (Markt, Messe, Deadline …) – erscheint im Kalender-Abo. */
export interface TeamEvent {
  id: string
  title: string
  starts_at: string
  ends_at: string | null // optional; NULL = 1 Std. bzw. ganztägig
  all_day: boolean // true = Datum ohne Uhrzeit
  location: string
  category: string // freie Kategorie, z. B. „Markt"
  description: string // Freitext (Rich-Text-HTML)
  created_at: string
  created_by: string | null
}

export interface Page {
  id: string
  title: string
  position: number
  created_at: string
}

export type BlockType = 'text' | 'table'

export interface TextBlockContent {
  html: string
}

export interface TableBlockContent {
  columns: string[]
  rows: string[][]
}

export interface PageBlock {
  id: string
  page_id: string
  type: BlockType
  content: TextBlockContent | TableBlockContent
  position: number
  created_at: string
}

export interface Idea {
  id: string
  parent_id: string | null // NULL = Bubble (Top-Level), sonst Idee zur Bubble
  content: string
  author_id: string | null
  created_at: string
}

export interface IdeaReaction {
  idea_id: string
  user_id: string
}

export interface TeamMessage {
  id: string
  content: string
  author_id: string | null
  created_at: string
}

export type AvailabilityStatus = 'available' | 'unavailable'

export interface Availability {
  user_id: string
  day: string // YYYY-MM-DD
  status: AvailabilityStatus
}

export type FileSource = 'manual' | 'gdrive'

export type FinanceSection = 'income' | 'expense' | 'asset' | 'liability'

export interface FinanceEntry {
  id: string
  year: number
  entry_date: string | null
  section: FinanceSection
  category: string
  description: string
  amount: number
  created_at: string
  created_by: string | null
}

export interface FileLink {
  id: string
  name: string
  url: string
  category: string
  description: string
  source: FileSource
  created_at: string
}
