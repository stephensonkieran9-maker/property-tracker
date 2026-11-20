-- Keapr offers portal: run once in the Supabase SQL Editor (the training project).
-- Adds two new tables and one function. It does not change any training table or data.
-- Safe to run again: everything is "if not exists" / "or replace".

create extension if not exists pgcrypto;

-- Who can use the offers portal, and how.
-- role: 'staff' = upload and see own offers + leaderboard; 'admin' = also the /admin area.
create table if not exists public.portal_members (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  role           text not null default 'staff' check (role in ('staff', 'admin')),
  monthly_target numeric(12, 2) not null default 0 check (monthly_target >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One row per offer sent.
create table if not exists public.offers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete restrict,
  property_name     text not null,
  address           text,
  apartment_type    text,
  location          text,
  check_in          date,
  check_out         date,
  nights            integer not null check (nights > 0 and nights <= 1000),
  adults            integer check (adults >= 0),
  children          integer check (children >= 0),
  nightly_rate      numeric(10, 2) not null check (nightly_rate >= 0),
  commission_pct    numeric(5, 2) -- the booking platform's commission, deducted from what Keapr receives
                     check (commission_pct >= 0 and commission_pct <= 100),
  credit_terms_days integer check (credit_terms_days >= 0),
  company_contact   text,
  booking_value     numeric(12, 2) generated always as (round(nightly_rate * nights, 2)) stored,
  commission_value  numeric(12, 2) generated always as (round(nightly_rate * nights * coalesce(commission_pct, 0) / 100, 2)) stored,
  model             text not null check (model in ('managed', 'arbitraged')),
  outcome           text not null default 'pending' check (outcome in ('pending', 'won', 'lost')),
  outcome_at        timestamptz,
  notes             text,
  sent_at           timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Managed offers link to the Hostaway property (added 19 Nov 2026).
alter table public.offers add column if not exists hostaway_listing_id bigint;
-- Booking platform the offer went through, if the screenshot shows it (added 19 Nov 2026).
alter table public.offers add column if not exists platform text;
-- Worth to Keapr, monthly worth target and the totals function: run portal_worth.sql after this file.

create index if not exists offers_sent_at_idx on public.offers (sent_at desc);
create index if not exists offers_user_sent_idx on public.offers (user_id, sent_at desc);

-- Locked down: only the app's server (service role) reads or writes these.
-- Signed-in users never query them directly, so no policies are needed.
alter table public.portal_members enable row level security;
alter table public.offers enable row level security;
revoke all on public.portal_members from anon, authenticated;
revoke all on public.offers from anon, authenticated;

-- Per-person totals for a period (null bounds = all time), used for the leaderboard
-- and the countdown. Created in portal_worth.sql (includes worth to Keapr).

-- Training admins become portal admins, so you can sign straight in.
insert into public.portal_members (user_id, role)
select id, 'admin' from public.profiles where role = 'admin'
on conflict (user_id) do nothing;
