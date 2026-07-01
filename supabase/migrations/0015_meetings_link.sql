-- ============================================================================
-- Hills of Hems Hub – 0015  Meetings: Meeting-Link (z. B. Google Meet)
-- ----------------------------------------------------------------------------
-- Optionaler Link zum Online-Meeting (meist Google Meet). Wird im Frontend
-- als „Meeting öffnen"-Button in einem neuen Tab geöffnet.
-- Bestehende Meetings behalten einen leeren Link.
-- ============================================================================

alter table public.meetings
  add column if not exists meeting_link text not null default '';

comment on column public.meetings.meeting_link is 'Optionaler Link zum Online-Meeting (z. B. Google Meet).';
