# Hills of Hems · Hub

Interne Team-Zentrale für **Hills of Hems** (Küchentextilien, DACH, 4-Personen-Team).
Eine schlanke, hochwertig gestaltete Mischung aus Notion (Klarheit, Whitespace)
und monday.com (farbige Status, klare Boards) – mit genau unseren Funktionen.

**Funktionen:** Startseite (persönliche Begrüßung, eigene überfällige & weitere
To-dos, anstehende Meetings, Team-Nachrichten als Gedankenblasen) · Auth &
Profile · Team & Rollen (mit Account-Verknüpfung & Hervorhebung eigener Rollen) ·
Admin-Bereich · **zwei Kanban-Boards** (Saisonplanung & Daily Business, je eigene
farbige Labels) · To-dos (mehrere Personen/Team, projekt- oder „Daily-Business"-
gebunden, eigene To-do-Seite gruppiert nach Board) · Meetings (Agenda vorab +
Protokoll, Anstehend/Vergangen) · **Creative Area** (Brainstorming-Bubbles) ·
**Finanzen** (GuV + Bilanz pro Jahr) · Info-Seiten (Text + Tabellen) · Datei-Links.

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
| `0001_init_schema.sql` | Basis-Tabellen |
| `0002_rls_policies.sql` | RLS, Helper-Funktionen (`is_admin`), Trigger |
| `0003_seed.sql` | Rollen, Kanban-Spalten, Beispiel-Seite, Beispiel-Links |
| `0004_seed_supply_chain_pages.sql` | Info-Seiten „Supply Chain Textil/Keramik" |
| `0005_meetings_agenda.sql` | Meetings: Feld `agenda` (Agenda vorab) |
| `0006_todos_optional_card.sql` | To-dos auch ohne Karte (Daily Business) |
| `0007_creative_area.sql` | Creative Area: `ideas` + `idea_reactions` |
| `0008_todo_multi_assignees.sql` | To-dos: mehrere Personen / Team |
| `0009_second_board.sql` | Zweites Board „Daily Business" (`board`-Schlüssel) |
| `0010_finance.sql` | Finanzen (`finance_entries`) + 2025-Seed |
| `0011_team_message.sql` | Nachricht ans Team (`team_messages`) |

> Tipp: Alle Dateien einfach **in numerischer Reihenfolge** (0001 → 0011)
> nacheinander im SQL Editor ausführen. Jede ist idempotent bzw. nutzt
> `if not exists`, ein erneutes Ausführen schadet also nicht.

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

**Basis:** `profiles` · `roles` · `user_roles` · `board_columns` · `board_cards` ·
`card_todos` · `meetings` · `meeting_participants` · `pages` · `page_blocks` ·
`file_links`

**Erweiterungen:** `card_todo_assignees` (Mehrfach-Zuweisung) · `ideas` +
`idea_reactions` (Creative Area) · `finance_entries` (Finanzen) · `team_messages`
(Team-Nachrichten)

**Wichtige Felder:**
- `board_columns.board` – `'season'` (Saisonplanung) | `'daily'` (Daily Business)
- `card_todos.card_id` – optional (NULL = „Daily Business" / ohne Projekt)
- `card_todos.is_team` – `true` = dem ganzen Team zugewiesen
- `meetings.agenda` – Tagesordnung vorab; `meetings.notes` – Protokoll
- `finance_entries.section` – `income | expense` (GuV) bzw. `asset | liability` (Bilanz)
- `file_links.source` – `'manual' | 'gdrive'`: vorbereitet für eine spätere
  **echte Google-Drive-Integration**; aktuell nur manuell (keine Google-OAuth).

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
- **Creative Area / Team-Nachrichten:** schreiben nur als man selbst
  (`author_id = auth.uid()`); löschen eigene Beiträge oder als Admin.
- **Finanzen:** lesen + schreiben für eingeloggte Team-Mitglieder (bei Bedarf
  leicht auf Admins einschränkbar).
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
