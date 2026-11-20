-- Offers portal: "Worth to Keapr" (added 20 Nov 2026). Run once in the Supabase SQL Editor.
-- Safe to run again.

-- What each booking is worth to Keapr, typed in by staff (blank until they do). Only counts when won.
alter table public.offers add column if not exists worth_to_keapr numeric(12, 2) check (worth_to_keapr >= 0);
-- A second monthly target, in worth to Keapr.
alter table public.portal_members add column if not exists worth_target numeric(12, 2) not null default 0 check (worth_target >= 0);

-- Totals now include worth to Keapr won (the return type changes, so drop and recreate).
drop function if exists public.portal_offer_totals(timestamptz, timestamptz);
create function public.portal_offer_totals(p_from timestamptz, p_to timestamptz)
returns table (
  user_id uuid,
  sent bigint,
  won bigint,
  lost bigint,
  pending bigint,
  sent_value numeric,
  won_value numeric,
  won_commission numeric,
  won_worth numeric
)
language sql stable security definer set search_path = public
as $$
  select o.user_id,
         count(*),
         count(*) filter (where o.outcome = 'won'),
         count(*) filter (where o.outcome = 'lost'),
         count(*) filter (where o.outcome = 'pending'),
         coalesce(sum(o.booking_value), 0),
         coalesce(sum(o.booking_value) filter (where o.outcome = 'won'), 0),
         coalesce(sum(o.commission_value) filter (where o.outcome = 'won'), 0),
         coalesce(sum(o.worth_to_keapr) filter (where o.outcome = 'won'), 0)
  from public.offers o
  where (p_from is null or o.sent_at >= p_from)
    and (p_to is null or o.sent_at < p_to)
  group by o.user_id;
$$;

revoke all on function public.portal_offer_totals(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.portal_offer_totals(timestamptz, timestamptz) to service_role;
