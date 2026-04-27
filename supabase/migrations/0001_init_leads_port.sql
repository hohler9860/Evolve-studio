-- 0001_init_leads_port.sql
-- Ports the existing `leads` table from Neon to Supabase.
-- Mirrors scripts/setup-db.js exactly so the existing inquiry form keeps working.

create table if not exists public.leads (
  id            bigserial primary key,
  name          text not null,
  business      text not null,
  email         text not null,
  phone         text default '',
  link          text default '',
  created_at    timestamptz default now(),
  status        text default 'new',
  notes         text default ''
);

create index if not exists idx_leads_status     on public.leads (status);
create index if not exists idx_leads_created_at on public.leads (created_at);

-- All access is via service-role on the Vercel API routes (existing JWT cookie auth gates admin reads).
-- No anon/authenticated role access; lock down RLS.
alter table public.leads enable row level security;
-- Intentionally no policies: service-role bypasses RLS, all other roles get zero access.
