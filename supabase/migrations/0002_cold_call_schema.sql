-- 0002_cold_call_schema.sql
-- Cold-call automation schema. 10 tables, all RLS-locked (service-role only).
-- Pipeline: campaigns → businesses → site_ratings → contacts → call_scripts
--                                                         → call_attempts → call_logs → meetings
-- Side tables: dnc_phone_numbers, webhook_events.

create extension if not exists "pgcrypto";

-- =============================================================================
-- enums
-- =============================================================================

do $$ begin
  create type public.region_t as enum ('boston', 'westchester');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_source_t as enum ('apify_gmaps', 'manual', 'ma_sos', 'bbb');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contact_source_t as enum ('apollo', 'apify', 'manual', 'website_scrape');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.call_status_t as enum (
    'queued','dialing','no_answer','busy','voicemail','connected','failed','blocked_by_compliance'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.meeting_status_t as enum ('booked','cancelled','completed','no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dnc_source_t as enum ('user_request','ftc_dnc','opt_out_during_call','do_not_record');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.disqualified_reason_t as enum (
    'no_website','rating_too_high','parked_domain','franchise_or_chain',
    'no_phone','duplicate','out_of_target_geo','manual'
  );
exception when duplicate_object then null; end $$;

-- =============================================================================
-- helper: updated_at trigger
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =============================================================================
-- campaigns
-- =============================================================================

create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  region          public.region_t not null,
  category        text not null,
  query_template  text not null,             -- e.g. "{category} in {city}"
  daily_cap       int  not null default 50,
  is_active       boolean not null default true,
  started_at      timestamptz default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_campaigns_active on public.campaigns (is_active) where is_active;
create trigger trg_campaigns_updated before update on public.campaigns
  for each row execute function public.set_updated_at();

-- =============================================================================
-- businesses (master record per discovered business)
-- =============================================================================

create table if not exists public.businesses (
  id                    uuid primary key default gen_random_uuid(),
  campaign_id           uuid references public.campaigns(id) on delete set null,
  name                  text not null,
  phone_e164            text unique,
  website_url           text,
  address               text,
  city                  text,
  state                 text,
  zip                   text,
  google_place_id       text unique,
  google_rating         numeric(2,1),
  google_review_count   int,
  category              text,
  source                public.lead_source_t not null default 'apify_gmaps',
  discovered_at         timestamptz not null default now(),
  dnc_until             timestamptz,                         -- per-business cooldown / DNC
  disqualified_reason   public.disqualified_reason_t,
  last_called_at        timestamptz,
  metadata              jsonb default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_businesses_disqualified on public.businesses (disqualified_reason)
  where disqualified_reason is not null;
create index if not exists idx_businesses_state_city on public.businesses (state, city);
create index if not exists idx_businesses_last_called on public.businesses (last_called_at);
create trigger trg_businesses_updated before update on public.businesses
  for each row execute function public.set_updated_at();

-- =============================================================================
-- site_ratings (Claude+Lighthouse output, one per business)
-- =============================================================================

create table if not exists public.site_ratings (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  rating_1_to_10      int not null check (rating_1_to_10 between 1 and 10),
  issues              jsonb not null default '[]'::jsonb,    -- ["mobile broken","no SSL",...]
  selling_points      jsonb not null default '[]'::jsonb,    -- talk-track bullets
  screenshot_url      text,                                  -- supabase storage path
  lighthouse_perf     int,
  lighthouse_seo      int,
  lighthouse_a11y     int,
  rater_model         text,
  prompt_cache_hit    boolean default false,
  rated_at            timestamptz not null default now(),
  unique (business_id)                                       -- one current rating per business
);
create index if not exists idx_site_ratings_rating on public.site_ratings (rating_1_to_10);

-- =============================================================================
-- contacts (decision-maker rows from Apollo / scrape; one business → many)
-- =============================================================================

create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  full_name           text,
  first_name          text,
  last_name           text,
  title               text,
  direct_phone_e164   text,
  mobile_phone_e164   text,
  email               text,
  source              public.contact_source_t not null default 'apollo',
  confidence          numeric(3,2),                          -- 0.00–1.00
  enriched_at         timestamptz not null default now(),
  metadata            jsonb default '{}'::jsonb
);
create index if not exists idx_contacts_business on public.contacts (business_id);

-- =============================================================================
-- call_scripts (Claude-generated personalized brief)
-- =============================================================================

create table if not exists public.call_scripts (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  contact_id          uuid references public.contacts(id) on delete set null,
  opener              text not null,                          -- includes mandatory AI + recording disclosure
  talking_points      jsonb not null default '[]'::jsonb,
  objection_handlers  jsonb not null default '[]'::jsonb,
  closer              text,
  model_version       text,
  generated_at        timestamptz not null default now()
);
create index if not exists idx_call_scripts_business on public.call_scripts (business_id);

-- =============================================================================
-- call_attempts (every dial; captures both connected and unsuccessful)
-- =============================================================================

create table if not exists public.call_attempts (
  id                          uuid primary key default gen_random_uuid(),
  business_id                 uuid not null references public.businesses(id) on delete cascade,
  contact_id                  uuid references public.contacts(id) on delete set null,
  script_id                   uuid references public.call_scripts(id) on delete set null,
  scheduled_for               timestamptz,
  initiated_at                timestamptz,
  twilio_call_sid             text unique,
  elevenlabs_conversation_id  text unique,
  status                      public.call_status_t not null default 'queued',
  end_reason                  text,
  duration_seconds            int,
  cost_usd                    numeric(8,4),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists idx_call_attempts_business on public.call_attempts (business_id);
create index if not exists idx_call_attempts_status on public.call_attempts (status);
create index if not exists idx_call_attempts_initiated on public.call_attempts (initiated_at);
create trigger trg_call_attempts_updated before update on public.call_attempts
  for each row execute function public.set_updated_at();

-- =============================================================================
-- call_logs (only for status=connected; transcript + audio + outcome)
-- =============================================================================

create table if not exists public.call_logs (
  id                          uuid primary key default gen_random_uuid(),
  call_attempt_id             uuid not null unique references public.call_attempts(id) on delete cascade,
  transcript                  text,
  transcript_jsonb            jsonb,                            -- turn-by-turn
  audio_url                   text,                             -- supabase storage path
  summary                     text,
  sentiment                   text,
  disclosure_given            boolean default false,
  recording_consent_given     boolean default false,
  meeting_booked              boolean default false,
  created_at                  timestamptz not null default now()
);

-- =============================================================================
-- meetings (Cal.com bookings tied back to the call that produced them)
-- =============================================================================

create table if not exists public.meetings (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  contact_id            uuid references public.contacts(id) on delete set null,
  call_log_id           uuid references public.call_logs(id) on delete set null,
  cal_com_booking_id    text unique,
  zoom_join_url         text,
  scheduled_for         timestamptz,
  status                public.meeting_status_t not null default 'booked',
  google_sheet_row_id   text,                                  -- for Mockup Pipeline tab
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_meetings_scheduled on public.meetings (scheduled_for);
create index if not exists idx_meetings_status on public.meetings (status);
create trigger trg_meetings_updated before update on public.meetings
  for each row execute function public.set_updated_at();

-- =============================================================================
-- dnc_phone_numbers (global do-not-call list, separate from per-business cooldown)
-- =============================================================================

create table if not exists public.dnc_phone_numbers (
  phone_e164    text primary key,
  source        public.dnc_source_t not null,
  notes         text,
  added_at      timestamptz not null default now()
);

-- =============================================================================
-- webhook_events (raw payload retention for debugging + replay)
-- =============================================================================

create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,                                 -- elevenlabs | cal_com | twilio
  event_type    text not null,
  payload       jsonb not null,
  processed     boolean not null default false,
  processed_at  timestamptz,
  error         text,
  received_at   timestamptz not null default now()
);
create index if not exists idx_webhook_events_unprocessed on public.webhook_events (received_at)
  where processed = false;

-- =============================================================================
-- RLS: lock everything; service-role bypasses, no other role gets access.
-- =============================================================================

alter table public.campaigns          enable row level security;
alter table public.businesses         enable row level security;
alter table public.site_ratings       enable row level security;
alter table public.contacts           enable row level security;
alter table public.call_scripts       enable row level security;
alter table public.call_attempts      enable row level security;
alter table public.call_logs          enable row level security;
alter table public.meetings           enable row level security;
alter table public.dnc_phone_numbers  enable row level security;
alter table public.webhook_events     enable row level security;
