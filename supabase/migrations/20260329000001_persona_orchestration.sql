-- Add agent orchestration fields to personas table
-- Supports heartbeat scheduling, budget enforcement, org hierarchy, and trigger-based activation

alter table public.personas
  add column if not exists heartbeat_minutes integer not null default 60,
  add column if not exists monthly_budget_usd numeric not null default 50,
  add column if not exists reports_to uuid references public.personas(id) on delete set null,
  add column if not exists triggers text[] not null default '{}';

-- Index for org hierarchy lookups
create index if not exists idx_personas_reports_to on public.personas (reports_to);
