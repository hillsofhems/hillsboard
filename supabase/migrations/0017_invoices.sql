-- ============================================================================
-- Hills of Hems Hub – 0017  Rechnungsmodul
-- ----------------------------------------------------------------------------
-- Rechnungen zu bezahlten Shopify-Bestellungen (nur interne Buchhaltung,
-- kein Versand an Kunden). Vier Bausteine:
--
--   1) invoice_settings            – Ausstellerdaten & Layout (genau EINE Zeile)
--   2) invoice_customer_overrides  – Firma / USt-IdNr. / Reverse Charge je
--                                    Kunden-E-Mail (Shopify liefert das nicht)
--   3) invoices                    – unveränderlicher Snapshot je Rechnung /
--                                    Stornorechnung, fortlaufende Nummer
--   4) Storage-Bucket "invoices"   – private PDFs, Zugriff nur via signierte URL
--
-- SICHERHEIT (GoBD):
--   * invoices hat KEINE insert/update/delete-Policy. Schreiben geht nur über
--     die SECURITY-DEFINER-RPC create_invoice(); pdf_path wird EINMALIG über
--     set_invoice_pdf_path() von NULL auf einen Wert gesetzt. Ein Trigger
--     verbietet jede andere Änderung und jedes Löschen – auch für service_role.
--   * Einstellungen & Overrides: lesen alle eingeloggten Team-Mitglieder,
--     schreiben nur Admins (is_admin()).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: updated_at automatisch pflegen
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1) invoice_settings – Aussteller- und Layoutdaten, genau eine Zeile (id = 1)
--    Rechtsform, Steuernummer, USt-IdNr. und Bankdaten trägt der Nutzer selbst
--    in /rechnungen/einstellungen ein – hier wird NICHTS davon vorbelegt.
-- ----------------------------------------------------------------------------
create table if not exists public.invoice_settings (
  id                 int primary key default 1 check (id = 1),
  issuer_name        text not null default '',        -- z. B. "Hills of Hems <Rechtsform>"
  issuer_address     text not null default '',        -- mehrzeilig (Straße, PLZ Ort)
  issuer_tax_number  text,                            -- Steuernummer
  issuer_vat_id      text,                            -- USt-IdNr. (Pflicht bei Reverse Charge)
  issuer_email       text,
  issuer_phone       text,
  issuer_web         text,
  bank_details       text,                            -- IBAN/BIC, optional, mehrzeilig
  number_prefix      text not null default 'HOH-',
  logo_path          text,                            -- Pfad im Bucket "invoices" (assets/logo.png)
  footer_text        text,
  updated_at         timestamptz not null default now()
);

comment on table public.invoice_settings is 'Ausstellerdaten & Layout für Rechnungen. Genau eine Zeile (id = 1).';

drop trigger if exists invoice_settings_updated_at on public.invoice_settings;
create trigger invoice_settings_updated_at
  before update on public.invoice_settings
  for each row execute function public.set_updated_at();

-- Startzeile: nur der Markenname. Adresse/Rechtsform/Steuernummer bleiben leer,
-- bis sie in den Einstellungen gepflegt sind (die UI blockiert bis dahin).
insert into public.invoice_settings (id, issuer_name)
values (1, 'Hills of Hems')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2) invoice_customer_overrides – Kunden-Overrides (Firma / USt-IdNr. / RC)
--    match_email wird klein geschrieben verglichen (Kunden-E-Mail oder
--    Bestell-E-Mail der Shopify-Bestellung).
-- ----------------------------------------------------------------------------
create table if not exists public.invoice_customer_overrides (
  id                        uuid primary key default gen_random_uuid(),
  match_email               text unique,             -- z. B. service+nl@orderchamp.com
  company_name              text,
  vat_id                    text,                    -- z. B. NL… für Orderchamp B.V.
  billing_address_override  text,                    -- mehrzeilig, optional
  reverse_charge            boolean not null default false,
  note                      text,                    -- interne Notiz
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.invoice_customer_overrides is 'Overrides je Kunden-E-Mail, weil Shopify weder USt-IdNr. noch Firmenfeld liefert.';

drop trigger if exists invoice_customer_overrides_updated_at on public.invoice_customer_overrides;
create trigger invoice_customer_overrides_updated_at
  before update on public.invoice_customer_overrides
  for each row execute function public.set_updated_at();

-- match_email immer klein & getrimmt speichern
create or replace function public.normalize_override_email()
returns trigger
language plpgsql
as $$
begin
  new.match_email = nullif(lower(trim(new.match_email)), '');
  return new;
end;
$$;

drop trigger if exists invoice_customer_overrides_normalize on public.invoice_customer_overrides;
create trigger invoice_customer_overrides_normalize
  before insert or update on public.invoice_customer_overrides
  for each row execute function public.normalize_override_email();

-- Orderchamp B.V. als ersten Eintrag anlegen. Die USt-IdNr. ist bewusst LEER –
-- sie steht nicht in Shopify und muss in den Einstellungen nachgetragen werden.
-- Solange sie fehlt, blockiert die Rechnungserstellung für Orderchamp.
insert into public.invoice_customer_overrides (match_email, company_name, reverse_charge, note)
values (
  'service+nl@orderchamp.com',
  'Orderchamp B.V.',
  true,
  'Marktplatz Orderchamp (NL). Rechnungsempfänger ist Orderchamp B.V., nicht der Händler an der Lieferadresse. USt-IdNr. bitte ergänzen.'
)
on conflict (match_email) do nothing;

-- ----------------------------------------------------------------------------
-- 3) invoices – fortlaufende, unveränderliche Rechnungen
-- ----------------------------------------------------------------------------
create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  number              text not null unique,           -- HOH-2026-00001 (aus Sequence)
  type                text not null check (type in ('invoice', 'cancellation')),
  shopify_order_id    text not null,                  -- gid://shopify/Order/…
  shopify_order_name  text not null,                  -- #1131 bzw. OC1108099
  cancels_invoice_id  uuid references public.invoices (id),
  issue_date          date not null,                  -- Tag der Erstellung (Europe/Berlin)
  delivery_date       date,                           -- Fulfillment-Datum, sonst = issue_date
  recipient           jsonb not null,                 -- eingefrorene Empfängerdaten
  lines               jsonb not null,                 -- eingefrorene Positionen inkl. Steuersatz
  tax_summary         jsonb not null,                 -- [{rate, net, tax, gross}]
  totals              jsonb not null,                 -- {net, tax, gross, currency, discount}
  reverse_charge      boolean not null default false,
  meta                jsonb not null default '{}'::jsonb, -- Kanal, Zahlungsart, Rabatt-Info, Refunds, Storno-Bezug
  pdf_path            text,                           -- Storage-Pfad (YYYY/<number>.pdf), nach Erzeugung gesetzt
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now()
);

comment on table public.invoices is 'Rechnungen/Stornorechnungen zu Shopify-Bestellungen. Unveränderlich (GoBD); schreiben nur via create_invoice().';
comment on column public.invoices.meta is 'Zusatz-Snapshot: channel, payment_method, discount_note, refunds, delivery_date_source, cancels_number, warnings …';

-- Pro Bestellung maximal eine Rechnung und eine Stornorechnung
create unique index if not exists invoices_one_per_order on public.invoices (shopify_order_id, type);
create index if not exists invoices_issue_date_idx on public.invoices (issue_date);

-- Unveränderlichkeit: nur pdf_path darf einmalig von NULL gesetzt werden.
create or replace function public.guard_invoice_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Rechnungen dürfen nicht gelöscht werden (GoBD). Bitte stornieren.';
  end if;

  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'pdf_path der Rechnung % ist bereits gesetzt und darf nicht geändert werden.', old.number;
  end if;

  if new.id                 is distinct from old.id
  or new.number             is distinct from old.number
  or new.type               is distinct from old.type
  or new.shopify_order_id   is distinct from old.shopify_order_id
  or new.shopify_order_name is distinct from old.shopify_order_name
  or new.cancels_invoice_id is distinct from old.cancels_invoice_id
  or new.issue_date         is distinct from old.issue_date
  or new.delivery_date      is distinct from old.delivery_date
  or new.recipient          is distinct from old.recipient
  or new.lines              is distinct from old.lines
  or new.tax_summary        is distinct from old.tax_summary
  or new.totals             is distinct from old.totals
  or new.reverse_charge     is distinct from old.reverse_charge
  or new.meta               is distinct from old.meta
  or new.created_by         is distinct from old.created_by
  or new.created_at         is distinct from old.created_at
  then
    raise exception 'Rechnung % ist unveränderlich (GoBD). Nur pdf_path darf einmalig gesetzt werden.', old.number;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_immutable_update on public.invoices;
create trigger invoices_immutable_update
  before update on public.invoices
  for each row execute function public.guard_invoice_immutable();

drop trigger if exists invoices_immutable_delete on public.invoices;
create trigger invoices_immutable_delete
  before delete on public.invoices
  for each row execute function public.guard_invoice_immutable();

-- ----------------------------------------------------------------------------
-- RPC create_invoice(p_order jsonb, p_type text, p_cancels uuid)
--   Läuft in EINER Transaktion. Reihenfolge ist wichtig für lückenlose Nummern:
--   alle Prüfungen ZUERST, nextval() erst ganz am Ende. Ein Advisory-Lock
--   serialisiert parallele Aufrufe (kein Race auf "existiert schon?").
--
--   p_order (vom Client gemappter Snapshot):
--     { shopify_order_id, shopify_order_name, delivery_date|null,
--       recipient{…}, lines[…], tax_summary[…], totals{…},
--       reverse_charge, meta{…} }
-- ----------------------------------------------------------------------------
create or replace function public.create_invoice(
  p_order   jsonb,
  p_type    text,
  p_cancels uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_settings    public.invoice_settings%rowtype;
  v_original    public.invoices%rowtype;
  v_row         public.invoices%rowtype;
  v_order_id    text := nullif(trim(p_order->>'shopify_order_id'), '');
  v_order_name  text := nullif(trim(p_order->>'shopify_order_name'), '');
  v_rc          boolean := coalesce((p_order->>'reverse_charge')::boolean, false);
  v_issue_date  date := (now() at time zone 'Europe/Berlin')::date;
  v_delivery    date;
  v_seq         bigint;
  v_number      text;
  v_meta        jsonb := coalesce(p_order->'meta', '{}'::jsonb);
begin
  -- Nur eingeloggte Hub-User
  if v_uid is null then
    raise exception 'Nicht eingeloggt.';
  end if;

  if p_type not in ('invoice', 'cancellation') then
    raise exception 'Ungültiger Rechnungstyp "%": erlaubt sind invoice und cancellation.', p_type;
  end if;

  if v_order_id is null or v_order_name is null then
    raise exception 'shopify_order_id und shopify_order_name fehlen im Snapshot.';
  end if;

  if jsonb_typeof(p_order->'recipient') <> 'object'
     or jsonb_typeof(p_order->'lines') <> 'array'
     or jsonb_typeof(p_order->'tax_summary') <> 'array'
     or jsonb_typeof(p_order->'totals') <> 'object' then
    raise exception 'Snapshot unvollständig (recipient, lines, tax_summary, totals erforderlich).';
  end if;

  -- Serialisieren: verhindert doppelte Rechnungen und Nummern-Races
  perform pg_advisory_xact_lock(hashtext('public.invoice_number_seq'));

  -- Pro Bestellung maximal eine Rechnung dieses Typs
  if exists (
    select 1 from public.invoices i
    where i.shopify_order_id = v_order_id and i.type = p_type
  ) then
    raise exception 'Für Bestellung % existiert bereits eine % (Nr. %).',
      v_order_name,
      case when p_type = 'invoice' then 'Rechnung' else 'Stornorechnung' end,
      (select i.number from public.invoices i where i.shopify_order_id = v_order_id and i.type = p_type limit 1);
  end if;

  -- Storno: muss sich auf die Originalrechnung derselben Bestellung beziehen
  if p_type = 'cancellation' then
    if p_cancels is null then
      raise exception 'Stornorechnung braucht einen Bezug (p_cancels) auf die Originalrechnung.';
    end if;
    select * into v_original from public.invoices where id = p_cancels;
    if not found then
      raise exception 'Originalrechnung % nicht gefunden.', p_cancels;
    end if;
    if v_original.type <> 'invoice' then
      raise exception 'Nur Rechnungen (nicht Stornorechnungen) können storniert werden.';
    end if;
    if v_original.shopify_order_id <> v_order_id then
      raise exception 'Originalrechnung % gehört zu einer anderen Bestellung (%).',
        v_original.number, v_original.shopify_order_name;
    end if;
    -- Bezug im Snapshot festhalten
    v_meta := v_meta || jsonb_build_object(
      'cancels_number', v_original.number,
      'cancels_issue_date', to_char(v_original.issue_date, 'YYYY-MM-DD')
    );
  elsif p_cancels is not null then
    raise exception 'p_cancels ist nur für Stornorechnungen erlaubt.';
  end if;

  -- Ausstellerdaten müssen vollständig sein (§ 14 Abs. 4 UStG)
  select * into v_settings from public.invoice_settings where id = 1;
  if not found or trim(v_settings.issuer_name) = '' or trim(v_settings.issuer_address) = '' then
    raise exception 'Rechnungseinstellungen unvollständig: Ausstellername und -adresse fehlen (siehe /rechnungen/einstellungen).';
  end if;
  if nullif(trim(coalesce(v_settings.issuer_tax_number, '')), '') is null
     and nullif(trim(coalesce(v_settings.issuer_vat_id, '')), '') is null then
    raise exception 'Rechnungseinstellungen unvollständig: Steuernummer oder USt-IdNr. des Ausstellers fehlt.';
  end if;
  if v_rc then
    if nullif(trim(coalesce(v_settings.issuer_vat_id, '')), '') is null then
      raise exception 'Reverse Charge: USt-IdNr. des Ausstellers fehlt in den Einstellungen.';
    end if;
    if nullif(trim(coalesce(p_order->'recipient'->>'vat_id', '')), '') is null then
      raise exception 'Reverse Charge: USt-IdNr. des Empfängers fehlt (Kunden-Override in den Einstellungen pflegen).';
    end if;
  end if;

  -- Lieferdatum: Fulfillment-Datum, sonst Rechnungsdatum
  v_delivery := coalesce(nullif(p_order->>'delivery_date', '')::date, v_issue_date);

  -- Erst jetzt (alle Prüfungen bestanden) die Nummer ziehen
  v_seq    := nextval('public.invoice_number_seq');
  v_number := v_settings.number_prefix || to_char(v_issue_date, 'YYYY') || '-' || lpad(v_seq::text, 5, '0');

  insert into public.invoices (
    number, type, shopify_order_id, shopify_order_name, cancels_invoice_id,
    issue_date, delivery_date, recipient, lines, tax_summary, totals,
    reverse_charge, meta, created_by
  ) values (
    v_number, p_type, v_order_id, v_order_name, p_cancels,
    v_issue_date, v_delivery,
    p_order->'recipient', p_order->'lines', p_order->'tax_summary', p_order->'totals',
    v_rc, v_meta, v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_invoice(jsonb, text, uuid) is 'Legt Rechnung/Stornorechnung mit fortlaufender Nummer an. SECURITY DEFINER; einzige Schreibmöglichkeit auf invoices.';

revoke all on function public.create_invoice(jsonb, text, uuid) from public;
grant execute on function public.create_invoice(jsonb, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC set_invoice_pdf_path(p_invoice_id, p_pdf_path)
--   Setzt pdf_path genau einmal (NULL -> Wert). Pfad muss YYYY/<number>.pdf sein.
-- ----------------------------------------------------------------------------
create or replace function public.set_invoice_pdf_path(
  p_invoice_id uuid,
  p_pdf_path   text
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.invoices%rowtype;
  v_expected text;
begin
  if auth.uid() is null then
    raise exception 'Nicht eingeloggt.';
  end if;

  select * into v_row from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Rechnung % nicht gefunden.', p_invoice_id;
  end if;

  v_expected := to_char(v_row.issue_date, 'YYYY') || '/' || v_row.number || '.pdf';
  if p_pdf_path <> v_expected then
    raise exception 'Ungültiger PDF-Pfad "%": erwartet "%".', p_pdf_path, v_expected;
  end if;

  if v_row.pdf_path is not null then
    -- Idempotent: gleicher Pfad erneut gesetzt ist ok, alles andere blockt der Trigger
    if v_row.pdf_path = p_pdf_path then
      return v_row;
    end if;
    raise exception 'pdf_path der Rechnung % ist bereits gesetzt.', v_row.number;
  end if;

  update public.invoices set pdf_path = p_pdf_path where id = p_invoice_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_invoice_pdf_path(uuid, text) from public;
grant execute on function public.set_invoice_pdf_path(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.invoice_settings           enable row level security;
alter table public.invoice_customer_overrides enable row level security;
alter table public.invoices                   enable row level security;

-- invoice_settings: lesen alle, schreiben nur Admins (kein Löschen)
drop policy if exists invoice_settings_select on public.invoice_settings;
create policy invoice_settings_select on public.invoice_settings
  for select to authenticated using (auth.uid() is not null);
drop policy if exists invoice_settings_insert_admin on public.invoice_settings;
create policy invoice_settings_insert_admin on public.invoice_settings
  for insert to authenticated with check (public.is_admin(auth.uid()));
drop policy if exists invoice_settings_update_admin on public.invoice_settings;
create policy invoice_settings_update_admin on public.invoice_settings
  for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- invoice_customer_overrides: lesen alle, schreiben nur Admins
drop policy if exists invoice_overrides_select on public.invoice_customer_overrides;
create policy invoice_overrides_select on public.invoice_customer_overrides
  for select to authenticated using (auth.uid() is not null);
drop policy if exists invoice_overrides_insert_admin on public.invoice_customer_overrides;
create policy invoice_overrides_insert_admin on public.invoice_customer_overrides
  for insert to authenticated with check (public.is_admin(auth.uid()));
drop policy if exists invoice_overrides_update_admin on public.invoice_customer_overrides;
create policy invoice_overrides_update_admin on public.invoice_customer_overrides
  for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists invoice_overrides_delete_admin on public.invoice_customer_overrides;
create policy invoice_overrides_delete_admin on public.invoice_customer_overrides
  for delete to authenticated using (public.is_admin(auth.uid()));

-- invoices: NUR lesen. Kein insert/update/delete – ausschließlich über die RPCs.
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- 4) Storage-Bucket "invoices" (privat)
--    Pfade: YYYY/<number>.pdf (Rechnungs-PDFs) und assets/logo.* (Logo).
--    PDFs: lesen (signierte URL) + einmalig hochladen; kein Überschreiben,
--    kein Löschen. Nur unter assets/ dürfen Admins ersetzen/löschen (Logo).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists invoices_storage_select on storage.objects;
create policy invoices_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices');

drop policy if exists invoices_storage_insert on storage.objects;
create policy invoices_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'invoices');

drop policy if exists invoices_storage_update_assets_admin on storage.objects;
create policy invoices_storage_update_assets_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = 'assets' and public.is_admin(auth.uid()))
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = 'assets' and public.is_admin(auth.uid()));

drop policy if exists invoices_storage_delete_assets_admin on storage.objects;
create policy invoices_storage_delete_assets_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = 'assets' and public.is_admin(auth.uid()));
