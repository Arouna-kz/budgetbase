-- =============================================================================
--  BUDGET BASE — SCRIPT D'INSTALLATION D'UNE BASE SUPABASE VIERGE
--  À coller dans : Supabase → SQL Editor → New query → Run
--  Idempotent (IF NOT EXISTS / ON CONFLICT) : ré-exécutable sans risque.
--
--  Ce script crée TOUTES les tables, ouvre les accès à l'API (RLS désactivé)
--  et insère les RÔLES par défaut (dont ADMIN, requis pour le 1er utilisateur).
--
--  ⚠️ SÉCURITÉ : ce script DÉSACTIVE la sécurité au niveau des lignes (RLS) pour
--  que l'application fonctionne telle quelle. C'est acceptable pour un usage
--  interne/contrôlé, mais pour une exposition publique il faut ajouter des
--  policies RLS (voir la section 8 du guide).
-- =============================================================================

-- Extension pour gen_random_uuid() (présente par défaut sur Supabase)
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) RÔLES & UTILISATEURS
-- -----------------------------------------------------------------------------
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  color       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  first_name  text,
  last_name   text,
  profession  text,
  employee_id text,
  role_id     uuid references public.user_roles(id),
  is_active   boolean not null default true,
  last_login  timestamptz,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2) SUBVENTIONS / LIGNES / SOUS-LIGNES
-- -----------------------------------------------------------------------------
create table if not exists public.grants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  reference             text,
  granting_organization text,
  year                  integer,
  currency              text,
  planned_amount        numeric default 0,
  total_amount          numeric default 0,
  start_date            text,
  end_date              text,
  status                text,
  description           text,
  bank_account          jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.budget_lines (
  id               uuid primary key default gen_random_uuid(),
  grant_id         uuid references public.grants(id) on delete cascade,
  code             text,
  name             text,
  planned_amount   numeric default 0,
  notified_amount  numeric default 0,
  engaged_amount   numeric default 0,
  available_amount numeric default 0,
  description      text,
  color            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.sub_budget_lines (
  id               uuid primary key default gen_random_uuid(),
  grant_id         uuid references public.grants(id) on delete cascade,
  budget_line_id   uuid references public.budget_lines(id) on delete cascade,
  code             text,
  name             text,
  planned_amount   numeric default 0,
  notified_amount  numeric default 0,
  engaged_amount   numeric default 0,
  available_amount numeric default 0,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3) ENGAGEMENTS
-- -----------------------------------------------------------------------------
create table if not exists public.engagements (
  id                 uuid primary key default gen_random_uuid(),
  grant_id           uuid references public.grants(id) on delete cascade,
  budget_line_id     uuid references public.budget_lines(id),
  sub_budget_line_id uuid references public.sub_budget_lines(id),
  engagement_number  text,
  amount             numeric default 0,
  description        text,
  supplier           text,
  quote_reference    text,
  invoice_number     text,
  date               text,
  status             text,
  is_mission         boolean not null default false,
  approvals          jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4) PAIEMENTS
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  payment_number       text,
  grant_id             uuid references public.grants(id) on delete cascade,
  budget_line_id       uuid references public.budget_lines(id),
  sub_budget_line_id   uuid references public.sub_budget_lines(id),
  engagement_id        uuid references public.engagements(id),
  amount               numeric default 0,
  date                 text,
  supplier             text,
  description          text,
  payment_method       text,
  check_number         text,
  bank_reference       text,
  invoice_number       text,
  invoice_amount       numeric,
  quote_reference      text,
  delivery_note        text,
  purchase_order_number text,
  service_acceptance   boolean default false,
  control_notes        text,
  status               text,
  cashed_date          text,
  approvals            jsonb,
  partial_payments     jsonb default '[]'::jsonb,
  remaining_amount     numeric default 0,
  is_scheduled         boolean not null default false,
  needs_reconciliation boolean not null default false,
  reconciled           boolean not null default false,
  reconciled_date      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5) TRÉSORERIE
-- -----------------------------------------------------------------------------
create table if not exists public.bank_transactions (
  id          uuid primary key default gen_random_uuid(),
  grant_id    uuid references public.grants(id) on delete cascade,
  date        text,
  description text,
  amount      numeric default 0,
  type        text,               -- 'credit' | 'debit'
  reference   text,
  payment_id  uuid references public.payments(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6) PRÉFINANCEMENTS & PRÊTS EMPLOYÉS
-- -----------------------------------------------------------------------------
create table if not exists public.prefinancings (
  id                      uuid primary key default gen_random_uuid(),
  prefinancing_number     text,
  grant_id                uuid references public.grants(id) on delete cascade,
  budget_line_id          uuid references public.budget_lines(id),
  sub_budget_line_id      uuid references public.sub_budget_lines(id),
  amount                  numeric default 0,
  date                    text,
  expected_repayment_date text,
  purpose                 text,
  target_bank_account     text,
  target_grant            text,
  expenses                jsonb default '[]'::jsonb,
  status                  text,
  repayments              jsonb default '[]'::jsonb,
  description             text,
  approvals               jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.employee_loans (
  id                      uuid primary key default gen_random_uuid(),
  loan_number             text,
  grant_id                uuid references public.grants(id) on delete cascade,
  budget_line_id          uuid references public.budget_lines(id),
  sub_budget_line_id      uuid references public.sub_budget_lines(id),
  employee                jsonb,
  amount                  numeric default 0,
  date                    text,
  expected_repayment_date text,
  description             text,
  repayment_schedule      jsonb,
  repayments              jsonb default '[]'::jsonb,
  status                  text,
  approvals               jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7) PARAMÈTRES DE L'APPLICATION (subvention active partagée, etc.)
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  value      jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
--  ACCÈS À L'API (RLS DÉSACTIVÉ + PRIVILÈGES)
--  L'application fait ses lectures/écritures directement avec la clé anon.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'user_roles','users','grants','budget_lines','sub_budget_lines',
    'engagements','payments','bank_transactions','prefinancings',
    'employee_loans','app_settings'
  ] loop
    execute format('alter table public.%I disable row level security;', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- =============================================================================
--  RÔLES PAR DÉFAUT (le rôle ADMIN est OBLIGATOIRE pour le 1er utilisateur)
--  permissions = tableau JSON [{ "module": "...", "actions": [...] }, ...]
-- =============================================================================

-- ADMIN : accès complet à tous les modules
insert into public.user_roles (name, code, description, permissions, color, is_active)
values (
  'Administrateur', 'ADMIN', 'Accès complet à toutes les fonctionnalités',
  '[
    {"module":"dashboard","actions":["view","export"]},
    {"module":"grants","actions":["view","create","edit","delete","export"]},
    {"module":"budget_planning","actions":["view","create","edit","delete","export"]},
    {"module":"tracking","actions":["view","create","edit","delete","export"]},
    {"module":"engagements","actions":["view","create","edit","delete","sign","export"]},
    {"module":"payments","actions":["view","create","edit","delete","sign","export"]},
    {"module":"treasury","actions":["view","create","edit","delete","export"]},
    {"module":"reconciliation","actions":["view","edit","export"]},
    {"module":"prefinancing","actions":["view","create","edit","delete","sign"]},
    {"module":"employee_loans","actions":["view","create","edit","delete","sign"]},
    {"module":"reports","actions":["view","create","export"]},
    {"module":"users","actions":["view","create","edit","delete"]},
    {"module":"globalConfig","actions":["view","create","edit","delete"]},
    {"module":"profile","actions":["view","edit"]},
    {"module":"bank_accounts","actions":["view","create","edit","delete"]},
    {"module":"bank_transactions","actions":["view","create","edit","delete","export"]}
  ]'::jsonb,
  'bg-red-100 text-red-700', true
)
on conflict (code) do update
  set permissions = excluded.permissions, name = excluded.name,
      description = excluded.description, updated_at = now();

-- COMPTABLE (signataire) : suivi, engagements, paiements, trésorerie, rapprochement, rapports, profil
insert into public.user_roles (name, code, description, permissions, color, is_active)
values (
  'Comptable', 'COMPTABLE', 'Suivi financier, paiements, trésorerie et rapprochement',
  '[
    {"module":"dashboard","actions":["view","export"]},
    {"module":"tracking","actions":["view","export"]},
    {"module":"grants","actions":["view"]},
    {"module":"budget_planning","actions":["view"]},
    {"module":"engagements","actions":["view","create","edit","sign","export"]},
    {"module":"payments","actions":["view","create","edit","sign","export"]},
    {"module":"treasury","actions":["view","create","edit","export"]},
    {"module":"reconciliation","actions":["view","edit","export"]},
    {"module":"reports","actions":["view","create","export"]},
    {"module":"profile","actions":["view","edit"]}
  ]'::jsonb,
  'bg-blue-100 text-blue-700', true
)
on conflict (code) do nothing;

-- COORDINATEUR DE LA SUBVENTION (signataire)
insert into public.user_roles (name, code, description, permissions, color, is_active)
values (
  'Coordinateur de la Subvention', 'COORD_SUBVENTION', 'Pilotage et validation de la subvention',
  '[
    {"module":"dashboard","actions":["view","export"]},
    {"module":"tracking","actions":["view","export"]},
    {"module":"grants","actions":["view","edit"]},
    {"module":"budget_planning","actions":["view","create","edit"]},
    {"module":"engagements","actions":["view","create","edit","sign","export"]},
    {"module":"payments","actions":["view","sign","export"]},
    {"module":"reports","actions":["view","create","export"]},
    {"module":"profile","actions":["view","edit"]}
  ]'::jsonb,
  'bg-green-100 text-green-700', true
)
on conflict (code) do nothing;

-- COORDONNATEUR NATIONAL (signataire final)
insert into public.user_roles (name, code, description, permissions, color, is_active)
values (
  'Coordonnateur National', 'COORD_NATIONAL', 'Validation finale (signature après création)',
  '[
    {"module":"dashboard","actions":["view","export"]},
    {"module":"tracking","actions":["view","export"]},
    {"module":"grants","actions":["view"]},
    {"module":"engagements","actions":["view","sign","export"]},
    {"module":"payments","actions":["view","sign","export"]},
    {"module":"reports","actions":["view","export"]},
    {"module":"profile","actions":["view","edit"]}
  ]'::jsonb,
  'bg-purple-100 text-purple-700', true
)
on conflict (code) do nothing;

-- =============================================================================
--  FIN. Étape suivante : créer le 1er utilisateur via l'inscription de l'app
--  (il sera automatiquement rattaché au rôle ADMIN).  Voir le guide.
-- =============================================================================
