// ============================================================================
// Hills of Hems Hub – /api/calendar  (Vercel Serverless Function)
// ----------------------------------------------------------------------------
// Liefert Meetings + Termine als iCalendar-Feed (.ics) zum ABONNIEREN in
// Google / Apple / Outlook-Kalender. Read-only.
//
// Aufruf (aus dem Kalender-Client, per webcal://…/api/calendar?token=…):
//   GET /api/calendar?token=<calendar_token des Profils>
//
// Sicherheit: kein anonymer Zugriff. Der token muss zu einem Profil gehören
// (profiles.calendar_token). Der Feed-Inhalt ist für alle Team-Mitglieder
// identisch – der Token ist das persönliche Zugangsgeheimnis (regenerierbar).
//
// Benötigte Environment-Variablen (im Vercel-Dashboard, NICHT mit VITE_-Prefix):
//   SUPABASE_URL                 = https://DEIN-PROJEKT-REF.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    = <service_role Key aus Supabase>
// ============================================================================
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const PRODID = '-//Hills of Hems//Hub//DE'
const CAL_NAME = 'Hills of Hems'
const TZ = 'Europe/Berlin'

interface MeetingRow {
  id: string
  title: string
  meeting_date: string
  meeting_link: string
  agenda: string
  created_at: string
}
interface EventRow {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string
  category: string
  description: string
  created_at: string
}

/** iCal-Textescape: Backslash, Semikolon, Komma und Zeilenumbrüche. */
function esc(s: string): string {
  return (s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** HTML grob zu Klartext (für Agenda/Beschreibung im Kalender). */
function plain(html: string): string {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Date -> UTC-Basisformat "YYYYMMDDTHHMMSSZ" (unmissverständlich für Clients). */
function toUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Date -> Kalender-Datum "YYYYMMDD" in Europe/Berlin (für ganztägige Termine). */
function toLocalDate(d: Date): string {
  // en-CA liefert "YYYY-MM-DD"
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .replace(/-/g, '')
}

/** "YYYYMMDD" + n Tage (für DTEND, das bei all-day exklusiv ist). */
function addDays(yyyymmdd: string, n: number): string {
  const y = Number(yyyymmdd.slice(0, 4))
  const m = Number(yyyymmdd.slice(4, 6))
  const d = Number(yyyymmdd.slice(6, 8))
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`
}

/** Faltet lange Zeilen nach RFC 5545 (max. 75 Oktetts, Fortsetzung mit Space). */
function fold(line: string): string {
  if (line.length <= 74) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 74))
  rest = rest.slice(74)
  while (rest.length > 73) {
    parts.push(' ' + rest.slice(0, 73))
    rest = rest.slice(73)
  }
  if (rest.length) parts.push(' ' + rest)
  return parts.join('\r\n')
}

function buildVevent(opts: {
  uid: string
  stamp: string
  start: string // bereits formatierte DTSTART-Zeile (inkl. Property-Name)
  end: string // bereits formatierte DTEND-Zeile
  summary: string
  description?: string
  location?: string
  url?: string
}): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${opts.stamp}`,
    opts.start,
    opts.end,
    `SUMMARY:${esc(opts.summary)}`,
  ]
  if (opts.description) lines.push(`DESCRIPTION:${esc(opts.description)}`)
  if (opts.location) lines.push(`LOCATION:${esc(opts.location)}`)
  if (opts.url) lines.push(`URL:${esc(opts.url)}`)
  lines.push('END:VEVENT')
  return lines
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Server nicht konfiguriert (ENV-Variablen fehlen).' })
  }

  const token = String(req.query.token ?? '').trim()
  if (!token) return res.status(400).send('token fehlt')

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // Token -> Profil. Nur ein gültiger Token darf den Feed lesen.
  const { data: prof } = await admin
    .from('profiles')
    .select('id')
    .eq('calendar_token', token)
    .maybeSingle()
  if (!prof) return res.status(403).send('Ungültiger Token')

  const [meetingsRes, eventsRes] = await Promise.all([
    admin.from('meetings').select('id,title,meeting_date,meeting_link,agenda,created_at'),
    admin
      .from('events')
      .select('id,title,starts_at,ends_at,all_day,location,category,description,created_at'),
  ])

  const stamp = toUtc(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${PRODID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(CAL_NAME)}`,
    `X-WR-TIMEZONE:${TZ}`,
    // Update-Hinweis für Clients (Google/Apple ignorieren das teils, schadet aber nicht).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  // --- Meetings: immer mit Uhrzeit; ohne Ende => 1 Stunde ---------------------
  for (const m of (meetingsRes.data as MeetingRow[]) ?? []) {
    const start = new Date(m.meeting_date)
    if (Number.isNaN(start.getTime())) continue
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const descParts = [plain(m.agenda), m.meeting_link ? `Meeting-Link: ${m.meeting_link}` : '']
      .filter(Boolean)
      .join('\n\n')
    lines.push(
      ...buildVevent({
        uid: `meeting-${m.id}@hillsofhems`,
        stamp,
        start: `DTSTART:${toUtc(start)}`,
        end: `DTEND:${toUtc(end)}`,
        summary: `📅 ${m.title}`,
        description: descParts || undefined,
        url: m.meeting_link || undefined,
      }),
    )
  }

  // --- Termine (events): ganztägig ODER mit Uhrzeit --------------------------
  for (const e of (eventsRes.data as EventRow[]) ?? []) {
    const start = new Date(e.starts_at)
    if (Number.isNaN(start.getTime())) continue
    const summary = e.category ? `${e.title} · ${e.category}` : e.title
    const description = plain(e.description) || undefined

    let startLine: string
    let endLine: string
    if (e.all_day) {
      const sd = toLocalDate(start)
      // DTEND ist bei ganztägigen Terminen exklusiv -> +1 Tag (bzw. Endtag +1).
      const endBase = e.ends_at ? toLocalDate(new Date(e.ends_at)) : sd
      startLine = `DTSTART;VALUE=DATE:${sd}`
      endLine = `DTEND;VALUE=DATE:${addDays(endBase, 1)}`
    } else {
      const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 60 * 60 * 1000)
      startLine = `DTSTART:${toUtc(start)}`
      endLine = `DTEND:${toUtc(end)}`
    }

    lines.push(
      ...buildVevent({
        uid: `event-${e.id}@hillsofhems`,
        stamp,
        start: startLine,
        end: endLine,
        summary,
        description,
        location: e.location || undefined,
      }),
    )
  }

  lines.push('END:VCALENDAR')

  const body = lines.map(fold).join('\r\n') + '\r\n'

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="hills-of-hems.ics"')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return res.status(200).send(body)
}
