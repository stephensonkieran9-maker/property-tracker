-- Dashboard targets (added 24 Nov 2026). Run once in the Supabase SQL Editor (the training project),
-- after portal_offers.sql and portal_worth.sql. Safe to run again.
--
-- Targets are now added, removed and set on the dashboard itself (not the Google Sheet).
-- People linked to the offers portal take their actual from the offers they've won;
-- everyone else is a manual number typed in on the dashboard.

create extension if not exists pgcrypto;

create table if not exists public.board_targets (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('person', 'company')),
  label           text not null check (length(label) between 1 and 120),
  team            text,
  unit            text not null default 'gbp' check (unit in ('gbp', 'int', 'pct')),
  -- Where the actual comes from:
  --   manual        typed in on the dashboard (one number per month, in `actuals`)
  --   offers_value  booking value won on the offers page (needs user_id)
  --   offers_worth  worth to Keapr won on the offers page (needs user_id)
  --   unitsOnboarded / bookedRevenue / bookings / occupancy / unanswered / combinedRevenue  live from Hostaway
  source          text not null default 'manual'
                   check (source in ('manual', 'offers_value', 'offers_worth', 'unitsOnboarded', 'bookedRevenue', 'bookings', 'occupancy', 'unanswered', 'combinedRevenue')),
  user_id         uuid references public.profiles (id) on delete set null,
  target          numeric(14, 2) not null default 0 check (target >= 0),
  -- Manual actuals by month: {"2026-11": 4200}
  actuals         jsonb not null default '{}'::jsonb,
  lower_is_better boolean not null default false,
  sort            integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists board_targets_kind_sort_idx on public.board_targets (kind, sort, created_at);

alter table public.board_targets enable row level security;
revoke all on public.board_targets from anon, authenticated;

-- First run only: copy across the targets the board used before.
do $$
declare
  n text;
  amt numeric;
  uid uuid;
  i integer := 0;
begin
  if exists (select 1 from public.board_targets) then
    return;
  end if;

  -- Company targets (were hard-coded in lib/targets.ts).
  insert into public.board_targets (kind, team, label, source, unit, target, lower_is_better, sort) values
    ('company', 'Growth',           'New units onboarded',        'unitsOnboarded',  'int', 8,      false, 0),
    ('company', 'Revenue',          'Booked revenue',             'bookedRevenue',   'gbp', 150000, false, 1),
    ('company', 'Revenue',          'Bookings made',              'bookings',        'int', 380,    false, 2),
    ('company', 'Operations',       'Month occupancy',            'occupancy',       'pct', 80,     false, 3),
    ('company', 'Guest experience', 'Unanswered messages (max)',  'unanswered',      'int', 10,     true,  4);

  -- People. Anyone on the offers portal is linked to their offers; the rest are manual.
  foreach n in array array['Gelo', 'Darwin', 'Christine'] loop
    amt := case n when 'Gelo' then 20000 when 'Darwin' then 5000 else 10000 end;
    uid := null;
    select m.user_id into uid
      from public.portal_members m join public.profiles p on p.id = m.user_id
     where m.is_active and p.full_name ilike n || '%'
     order by m.created_at limit 1;
    if uid is not null then
      insert into public.board_targets (kind, label, source, user_id, unit, target, sort)
      values ('person', n, 'offers_value', uid, 'gbp', amt, i);
      update public.portal_members set monthly_target = amt where user_id = uid and monthly_target = 0;
    else
      insert into public.board_targets (kind, label, source, unit, target, sort)
      values ('person', n, 'manual', 'gbp', amt, i);
    end if;
    i := i + 1;
  end loop;

  -- Every other active staff member on the offers portal.
  insert into public.board_targets (kind, label, source, user_id, unit, target, sort)
  select 'person', split_part(p.full_name, ' ', 1), 'offers_value', m.user_id, 'gbp', m.monthly_target, 10
    from public.portal_members m join public.profiles p on p.id = m.user_id
   where m.is_active and m.role = 'staff'
     and not exists (select 1 from public.board_targets t where t.user_id = m.user_id);
end $$;
