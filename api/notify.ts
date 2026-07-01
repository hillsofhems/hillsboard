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

/** Baut ein simples HTML-Mail-Layout. */
function template(title: string, bodyHtml: string): string {
  const link = APP_URL
    ? `<p style="margin-top:24px"><a href="${APP_URL}" style="color:#5b7a5b">Zum Hills of Hems Hub &rarr;</a></p>`
    : ''
  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#1f2937;max-width:560px">
    <h2 style="color:#5b7a5b;margin-bottom:8px">${title}</h2>
    ${bodyHtml}
    ${link}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
    <p style="font-size:12px;color:#9ca3af">Automatische Nachricht vom Hills of Hems Hub.</p>
  </div>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
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
      const linkLine = meeting.meeting_link
        ? `<p><strong>Link:</strong> <a href="${escapeHtml(meeting.meeting_link)}">${escapeHtml(meeting.meeting_link)}</a></p>`
        : ''
      html = template(
        'Neues Meeting angelegt',
        `<p><strong>${escapeHtml(meeting.title)}</strong></p>
         <p><strong>Wann:</strong> ${escapeHtml(when)} Uhr</p>
         ${linkLine}`,
      )
    } else if (type === 'todo') {
      const { data: todo } = await admin
        .from('card_todos')
        .select('text,is_team,due_date')
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

      subject = `Neue Aufgabe: ${todo.text}`
      const due = todo.due_date
        ? `<p><strong>Fällig:</strong> ${escapeHtml(
            new Date(todo.due_date).toLocaleDateString('de-DE', { dateStyle: 'long' }),
          )}</p>`
        : ''
      html = template(
        'Neue Aufgabe für dich',
        `<p>${escapeHtml(todo.text)}</p>${due}`,
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
