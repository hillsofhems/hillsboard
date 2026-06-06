# Hills of Hems · Hub

Interne Team-Zentrale für **Hills of Hems** (Küchentextilien, DACH, 4-Personen-Team).
Eine schlanke, hochwertig gestaltete Mischung aus Notion (Klarheit, Whitespace)
und monday.com (farbige Status, klare Boards) – mit genau unseren Funktionen.

**Funktionen:** Auth & Profile · Team & Rollen · Admin-Bereich · Kanban-Board ·
verknüpfte To-dos · Meetings mit Protokoll · Info-Seiten (Text + Tabellen) ·
Datei-Links.

---

## Tech-Stack

- **Frontend:** React (Vite) + TypeScript + Tailwind CSS
- **Routing:** React Router
- **Drag & Drop:** dnd-kit
- **Backend / Auth / DB:** Supabase (Auth, Postgres, Row Level Security)
- **Icons:** lucide-react · **Fonts:** Lora + Inter (Google Fonts)
- **Deployment-ready** für Vercel / Netlify

---

## Schritt-für-Schritt-Setup

### 1. Supabase-Projekt anlegen
1. Auf <https://supabase.com> einloggen → **New project**.
2. Name z. B. `hills-of-hems-hub`, Region (EU/Frankfurt empfohlen), DB-Passwort setzen.
3. Warten, bis das Projekt bereit ist.

### 2. Migrationen einspielen
Die SQL-Dateien liegen in [`supabase/migrations`](supabase/migrations) und müssen
**in dieser Reihenfolge** ausgeführt werden:

| Datei | Inhalt |
|-------|--------|
| `0001_init_schema.sql` | Alle Tabellen |
| `0002_rls_policies.sql` | RLS, Helper-Funktionen, Trigger |
| `0003_seed.sql` | Rollen, Spalten, Beispiel-Seite, Beispiel-Links |

**Variante A – Dashboard (am einfachsten):**
Supabase-Dashboard → **SQL Editor** → Inhalt jeder Datei nacheinander einfügen
und ausführen (0001 → 0002 → 0003).

**Variante B – Supabase CLI:**
```bash
npm i -g supabase
supabase login
supabase link --project-ref DEIN-PROJEKT-REF
supabase db push
```

### 3. ENV setzen
1. Supabase-Dashboard → **Project Settings → API**.
2. Kopiere **Project URL** und den **anon public** Key.
3. Im Projektordner:
   ```bash
   cp .env.example .env
   ```
4. `.env` ausfüllen:
   ```env
   VITE_SUPABASE_URL=https://DEIN-PROJEKT-REF.supabase.co
   VITE_SUPABASE_ANON_KEY=dein-oeffentlicher-anon-key
   ```

> ⚠️ **Nur der `anon`-Key** gehört ins Frontend. Der `service_role`-Key darf
> **niemals** in `.env`, ins Frontend oder ins Git. `.env` ist über `.gitignore`
> ausgeschlossen.

### 4. Installieren & starten
```bash
npm install
npm run dev
```
App läuft auf <http://localhost:5173>.

### 5. Ersten Admin manuell setzen
1. In der App **registrieren** (E-Mail + Passwort) und das Profil-Setup ausfüllen.
   > Hinweis: Ist in Supabase **Email Confirmation** aktiv (Auth → Providers →
   > Email), muss die Bestätigungs-Mail zuerst angeklickt werden. Für ein kleines
   > internes Team kann man die Bestätigung dort auch deaktivieren.
2. Im Supabase-**SQL Editor** den eigenen Account zum Admin machen:
   ```sql
   update public.profiles
   set is_admin = true
   where email = 'DEINE-EMAIL@beispiel.de';
   ```
   (Server-seitig erlaubt der Schutz-Trigger diese Änderung – siehe Sicherheit.)
3. In der App neu laden → der **Admin-Bereich** erscheint in der Sidebar.

---

## Datenmodell (Überblick)

`profiles` · `roles` · `user_roles` · `board_columns` · `board_cards` ·
`card_todos` · `meetings` · `meeting_participants` · `pages` · `page_blocks` ·
`file_links`

`file_links.source` ist bereits als `'manual' | 'gdrive'` angelegt, damit später
eine **echte Google-Drive-Integration** ergänzt werden kann. Aktuell wird nur die
manuelle Variante genutzt (keine Google-OAuth-Integration).

---

## Sicherheit / RLS

Der `anon`-Key ist öffentlich – das ist by design. Die **gesamte Sicherheit hängt
an Row Level Security**. Umgesetzte Regeln:

- **RLS ist auf allen Tabellen aktiviert.**
- **`anon` (nicht eingeloggt) darf nichts schreiben.** Alle Schreib-Policies sind
  `to authenticated` und prüfen `auth.uid()`.
- **Kein `using(true)` / `with check(true)`** für Schreibzugriff.
- **profiles:** lesen für eingeloggte Team-Mitglieder; INSERT/UPDATE nur fürs
  eigene Profil (`auth.uid() = id`). Das **`is_admin`-Flag kann ein Nutzer nicht
  bei sich selbst ändern** (Trigger `guard_is_admin`).
- **roles / user_roles:** lesen für eingeloggte User; **schreiben nur für Admins**
  (`is_admin(auth.uid())`, `SECURITY DEFINER`-Funktion, liest `profiles.is_admin`).
- **Übrige Tabellen:** lesen + schreiben für eingeloggte Team-Mitglieder.
- **`service_role`-Key** wird nirgends im Frontend / in der Client-ENV verwendet.

### RLS testen

Ersetze `DEIN-PROJEKT-REF` und `DEIN-ANON-KEY`.

**a) Nicht eingeloggter Schreibzugriff wird abgelehnt**
Ein anonymer Request (nur anon-Key, kein User-Token) darf nichts schreiben:
```bash
curl -i -X POST \
  'https://DEIN-PROJEKT-REF.supabase.co/rest/v1/roles' \
  -H "apikey: DEIN-ANON-KEY" \
  -H "Authorization: Bearer DEIN-ANON-KEY" \
  -H "Content-Type: application/json" \
  -d '{"funktionsbereich":"hack","rolle":"hack"}'
```
**Erwartet:** `401`/`403` bzw. eine RLS-Fehlermeldung – **kein** `201`.
Gleiches gilt für `board_cards`, `meetings`, `file_links` usw.

**b) Nicht-Admin kann keine Rollen ändern**
1. Als normaler (Nicht-Admin-)Nutzer in der App einloggen.
2. In den **DevTools → Konsole** (App-Tab, Supabase-Client ist geladen):
   ```js
   const { error } = await window.supabase
     .from('roles')
     .insert({ funktionsbereich: 'x', rolle: 'y' })
   console.log(error)   // -> RLS-Fehler ("violates row-level security policy")
   ```
   > Für den Test wird der Client unter `window.supabase` bereitgestellt
   > (siehe `src/lib/supabase.ts`).

**c) Nutzer kann sein eigenes `is_admin` nicht setzen**
Als eingeloggter Nicht-Admin:
```js
const { data: { user } } = await window.supabase.auth.getUser()
const { error } = await window.supabase
  .from('profiles')
  .update({ is_admin: true })
  .eq('id', user.id)
console.log(error)   // -> Trigger-Fehler: "is_admin darf nicht am eigenen Profil geändert werden."
```

**d) Eingeloggte Lesezugriffe funktionieren**
Nach Login liefern `select`-Abfragen auf `roles`, `profiles`, `board_*` Daten –
ohne Login bleiben sie leer/abgelehnt.

---

## Projektstruktur

```
src/
  components/
    layout/   App-Shell: Sidebar, Topbar, AppLayout
    ui/       UI-Kit: Button, Input, Modal, Badge, Avatar, …
    board/    Kanban (Spalten, Karten, Detail-Panel)
    todos/    To-do-Listen & -Items
    meetings/ Meeting-Liste & Editor
    pages/    Info-Seiten (Text-/Tabellen-Blöcke)
    files/    Datei-Links
    team/     Team- & Rollen-Tabelle
    admin/    Admin: Rollen-CRUD, Rollen-Zuweisung
  context/    AuthContext (Session, Profil, Rollen)
  hooks/      Daten-Hooks
  lib/        supabase-Client, Typen, Utils
  pages/      Routen-Seiten
supabase/
  migrations/ SQL (Schema, RLS, Seed)
```

---

## Deployment (Vercel / Netlify)

1. Repo pushen, in Vercel/Netlify importieren.
2. Build-Command `npm run build`, Output `dist`.
3. Environment-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen
   (**nur anon-Key**).
4. Deploy.

---

## Scripts

| Script | Zweck |
|--------|-------|
| `npm run dev` | Dev-Server |
| `npm run build` | Production-Build (`dist/`) |
| `npm run preview` | Build lokal testen |
