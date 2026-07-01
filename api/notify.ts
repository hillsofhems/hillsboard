// ============================================================================
// Hills of Hems Hub – /api/notify  (Vercel Serverless Function)
// ----------------------------------------------------------------------------
// Verschickt E-Mail-Benachrichtigungen über Resend. Läuft NUR server-seitig,
// damit die geheimen Keys (RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY) niemals
// ins Frontend gelangen.
//
// Auslöser (vom Client aufgerufen nach erfolgreichem Speichern):
//   { type: 'meeting', id }            -> Mail an ALLE Team-Mitglieder
//   { type: 'todo',    id }            -> Mail an alle Zuständigen des To-dos
//                                         (bzw. an das ganze Team, wenn is_team)
//   { type: 'todo',    id, userIds }   -> Mail nur an die genannten Personen
//                                         (z. B. bei nachträglicher Zuweisung)
//
// Absender der Aktion wird nicht benachrichtigt (kennt seine eigene Aktion).
//
// Benötigte Environment-Variablen (im Vercel-Dashboard, NICHT mit VITE_-Prefix):
//   SUPABASE_URL                 = https://DEIN-PROJEKT-REF.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    = <service_role Key aus Supabase>
//   RESEND_API_KEY               = <API Key aus Resend>
//   RESEND_FROM                  = "Hills of Hems Hub <hub@deine-domain.de>"
//   APP_URL                      = https://deine-app.vercel.app   (optional, für Links)
// ============================================================================
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const FROM = process.env.RESEND_FROM ?? 'Hills of Hems Hub <onboarding@resend.dev>'
const APP_URL = (process.env.APP_URL ?? '').replace(/\/$/, '')

interface Recipient {
  email: string
  name: string
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** Entfernt HTML-Tags und kürzt Freitext (z. B. Agenda) für die Vorschau. */
function plainSnippet(html: string, max = 400): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const escaped = escapeHtml(text.length > max ? `${text.slice(0, max)}…` : text)
  return escaped.replace(/\n/g, '<br />')
}

/** Rendert eine Liste von "Label: Wert"-Zeilen (Werte sind bereits HTML-sicher). */
function detailRows(rows: Array<[string, string]>): string {
  return rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${label}</td>
          <td style="padding:4px 0;color:#1f2937">${value}</td>
        </tr>`,
    )
    .join('')
}

/** Baut ein simples HTML-Mail-Layout. path = optionaler Deep-Link (z. B. "/todos"). */
function template(title: string, bodyHtml: string, path = ''): string {
  const href = APP_URL ? APP_URL + path : ''
  const link = href
    ? `<p style="margin-top:24px"><a href="${href}" style="display:inline-block;background:#5b7a5b;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px">Im Hills of Hems Hub öffnen &rarr;</a></p>`
    : ''
  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#1f2937;max-width:560px">
    <h2 style="color:#5b7a5b;margin-bottom:12px">${title}</h2>
    ${bodyHtml}
    ${link}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
    <p style="font-size:12px;color:#9ca3af">Automatische Nachricht vom Hills of Hems Hub.</p>
  </div>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE || !RESEND_API_KEY) {
    return res.status(500).json({ error: 'Server nicht konfiguriert (ENV-Variablen fehlen).' })
  }

  // --- 1) Aufrufer verifizieren: muss ein eingeloggtes Team-Mitglied sein -----
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Kein Token.' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Ungültiges Token.' })
  const callerId = userData.user.id

  // --- 2) Payload lesen -------------------------------------------------------
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) ?? {}
  const { type, id, userIds } = body as {
    type?: 'meeting' | 'todo'
    id?: string
    userIds?: string[]
  }
  if (!type || !id) return res.status(400).json({ error: 'type und id erforderlich.' })

  const resend = new Resend(RESEND_API_KEY)

  // Name des Auslösers (Ersteller) für "von wem" in der Mail.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('name')
    .eq('id', callerId)
    .single()
  const fromName = escapeHtml((callerProfile as { name?: string } | null)?.name || 'einem Teammitglied')

  // Hilfsfunktion: Profile (Empfänger) zu einer Menge von User-IDs laden.
  const profilesByIds = async (ids: string[]): Promise<Recipient[]> => {
    const unique = [...new Set(ids)].filter((x) => x && x !== callerId)
    if (!unique.length) return []
    const { data } = await admin
      .from('profiles')
      .select('email,name')
      .in('id', unique)
    return ((data as Recipient[]) ?? []).filter((p) => p.email)
  }
  const allProfiles = async (): Promise<Recipient[]> => {
    const { data } = await admin.from('profiles').select('id,email,name')
    return ((data as (Recipient & { id: string })[]) ?? [])
      .filter((p) => p.email && p.id !== callerId)
      .map(({ email, name }) => ({ email, name }))
  }

  try {
    let subject = ''
    let html = ''
    let recipients: Recipient[] = []

    if (type === 'meeting') {
      const { data: meeting } = await admin
        .from('meetings')
        .select('title,meeting_date,meeting_link,agenda')
        .eq('id', id)
        .single()
      if (!meeting) return res.status(404).json({ error: 'Meeting nicht gefunden.' })

      recipients = await allProfiles()
      const when = new Date(meeting.meeting_date).toLocaleString('de-DE', {
        dateStyle: 'full',
        timeStyle: 'short',
      })
      subject = `Neues Meeting: ${meeting.title}`
      const meetingLink = meeting.meeting_link
        ? `<a href="${escapeHtml(meeting.meeting_link)}" style="color:#5b7a5b">${escapeHtml(meeting.meeting_link)}</a>`
        : ''
      const agenda = meeting.agenda ? plainSnippet(meeting.agenda) : ''
      const rows = detailRows([
        ['Titel', `<strong>${escapeHtml(meeting.title)}</strong>`],
        ['Wann', `${escapeHtml(when)} Uhr`],
        ['Angelegt von', fromName],
        ['Link', meetingLink],
      ])
      const agendaBlock = agenda
        ? `<p style="margin-top:16px;color:#6b7280">Agenda</p><p style="margin-top:0">${agenda}</p>`
        : ''
      html = template(
        'Neues Meeting angelegt',
        `<table style="border-collapse:collapse;font-size:15px">${rows}</table>${agendaBlock}`,
        '/meetings',
      )
    } else if (type === 'todo') {
      const { data: todo } = await admin
        .from('card_todos')
        .select('text,is_team,due_date,card_id')
        .eq('id', id)
        .single()
      if (!todo) return res.status(404).json({ error: 'To-do nicht gefunden.' })

      if (userIds && userIds.length) {
        recipients = await profilesByIds(userIds)
      } else if (todo.is_team) {
        recipients = await allProfiles()
      } else {
        const { data: assignees } = await admin
          .from('card_todo_assignees')
          .select('user_id')
          .eq('todo_id', id)
        recipients = await profilesByIds(
          ((assignees as { user_id: string }[]) ?? []).map((a) => a.user_id),
        )
      }

      // Ort der Aufgabe: entweder ein Projekt (Karte auf einem Board) oder Daily Business.
      let ort = 'Daily Business'
      if (todo.card_id) {
        const { data: card } = await admin
          .from('board_cards')
          .select('title, board_columns(board)')
          .eq('id', todo.card_id)
          .single()
        const rawBoard = (card as { board_columns?: { board?: string } | { board?: string }[] } | null)
          ?.board_columns
        const board = Array.isArray(rawBoard) ? rawBoard[0]?.board : rawBoard?.board
        const boardName = board === 'daily' ? 'Daily Business' : 'Projekte'
        const cardTitle = (card as { title?: string } | null)?.title
        ort = cardTitle ? `${escapeHtml(cardTitle)} (${boardName})` : boardName
      }

      subject = `Neue Aufgabe: ${todo.text}`
      const due = todo.due_date
        ? escapeHtml(new Date(todo.due_date).toLocaleDateString('de-DE', { dateStyle: 'long' }))
        : ''
      const rows = detailRows([
        ['Aufgabe', `<strong>${escapeHtml(todo.text)}</strong>`],
        ['Bereich', ort],
        ['Zugewiesen an', todo.is_team ? 'Ganzes Team' : ''],
        ['Fällig', due],
        ['Angelegt von', fromName],
      ])
      html = template(
        'Neue Aufgabe für dich',
        `<table style="border-collapse:collapse;font-size:15px">${rows}</table>`,
        '/todos',
      )
    } else {
      return res.status(400).json({ error: 'Unbekannter type.' })
    }

    if (!recipients.length) {
      return res.status(200).json({ ok: true, sent: 0 })
    }

    // Batch-Versand: eine persönliche Mail pro Empfänger (max. 100 pro Batch).
    const { error } = await resend.batch.send(
      recipients.map((r) => ({ from: FROM, to: r.email, subject, html })),
    )
    if (error) return res.status(502).json({ error: error.message })

    return res.status(200).json({ ok: true, sent: recipients.length })
  } catch (err) {
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler.' })
  }
}
