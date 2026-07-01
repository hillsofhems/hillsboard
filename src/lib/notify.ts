// Client-Helper für E-Mail-Benachrichtigungen.
// Ruft die serverseitige Function /api/notify auf (siehe api/notify.ts).
// "Fire and forget": Fehler werden bewusst geschluckt, damit ein fehlgeschlagener
// Mail-Versand die eigentliche Aktion (Meeting/To-do speichern) nicht stört.
import { supabase } from './supabase'

type NotifyPayload =
  | { type: 'meeting'; id: string }
  | { type: 'todo'; id: string; userIds?: string[] }

export async function notify(payload: NotifyPayload): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // absichtlich ignoriert – Benachrichtigung ist optional/best effort
  }
}
