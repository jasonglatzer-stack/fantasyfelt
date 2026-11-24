-- FantasyFelt beta: WSOP Paradise 2026
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then run seed_players.sql the same way.
--
-- Security model: the public (anon/publishable) key can only call the
-- functions below. It cannot read the entries table, so entrants' emails
-- are never exposed. Row Level Security is on with no public policies.

create extension if not exists citext;

-- Contest settings ---------------------------------------------------------
create table if not exists public.contests (
  slug        text primary key,
  name        text not null,
  lock_at     timestamptz not null,
  cap         int not null default 2500,
  roster_size int not null default 8
);
alter table public.contests enable row level security;

insert into public.contests (slug, name, lock_at)
values ('wsop-paradise-2026', 'WSOP Paradise 2026', '2026-12-02 16:00:00+00') -- 11:00 AM Nassau (ET)
on conflict (slug) do update set lock_at = excluded.lock_at;

-- Player pool with frozen prices (GPI Nov 18 + wsop.com Nov 23) ------------
create table if not exists public.players (
  id    int primary key,          -- FantasyFelt rank 1..1000
  name  text not null,
  price int not null check (price between 1 and 1000)
);
alter table public.players enable row level security;

-- Entries (private) --------------------------------------------------------
create table if not exists public.entries (
  id               uuid primary key default gen_random_uuid(),
  contest          text not null references public.contests(slug),
  email            citext not null,
  team_name        text not null,
  picks            int[] not null,
  total            int not null,
  marketing_opt_in boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (contest, email),
  unique (contest, team_name)
);
alter table public.entries enable row level security;
-- no policies: nobody outside the service role can read or write directly

-- Submit an entry: every rule is checked here, not just in the browser -----
create or replace function public.submit_entry(
  p_contest text, p_email text, p_team text, p_picks int[], p_opt_in boolean
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.contests%rowtype;
  v_total int;
  v_found int;
  v_team text := btrim(p_team);
  v_id uuid;
begin
  select * into c from public.contests where slug = p_contest;
  if not found then raise exception 'Unknown contest'; end if;
  if now() >= c.lock_at then raise exception 'Lineups are locked'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if char_length(v_team) < 2 or char_length(v_team) > 30 then raise exception 'Team name must be 2-30 characters'; end if;
  if v_team ~* '(https?://|www\.)' then raise exception 'Team name cannot contain a link'; end if;
  if coalesce(array_length(p_picks, 1), 0) < 1 or array_length(p_picks, 1) > c.roster_size then raise exception 'Pick between 1 and % players', c.roster_size; end if;
  if (select count(distinct x) from unnest(p_picks) x) <> array_length(p_picks, 1) then raise exception 'Each player can only be picked once'; end if;
  select count(*), coalesce(sum(price), 0) into v_found, v_total from public.players where id = any(p_picks);
  if v_found <> array_length(p_picks, 1) then raise exception 'Unknown player in lineup'; end if;
  if v_total > c.cap then raise exception 'Lineup is over the % cap', c.cap; end if;
  if exists (select 1 from public.entries where contest = p_contest and email = p_email::citext) then
    raise exception 'This email already has a team';
  end if;
  if exists (select 1 from public.entries where contest = p_contest and lower(team_name) = lower(v_team)) then
    raise exception 'That team name is taken';
  end if;
  insert into public.entries (contest, email, team_name, picks, total, marketing_opt_in)
  values (p_contest, lower(p_email), v_team, p_picks, v_total, coalesce(p_opt_in, false))
  returning id into v_id;
  return json_build_object('ok', true, 'total', v_total);
end $$;

-- Public counters ----------------------------------------------------------
create or replace function public.entry_count(p_contest text) returns int
language sql security definer set search_path = public stable as $$
  select count(*)::int from public.entries where contest = p_contest;
$$;

-- Ownership %: only revealed once lineups lock ------------------------------
create or replace function public.ownership(p_contest text)
returns table (player_id int, teams int, pct numeric)
language sql security definer set search_path = public stable as $$
  with c as (select lock_at from public.contests where slug = p_contest),
       n as (select count(*)::numeric t from public.entries where contest = p_contest)
  select x as player_id, count(*)::int as teams, round(100 * count(*) / nullif((select t from n), 0), 1) as pct
  from public.entries, unnest(picks) x
  where contest = p_contest and now() >= (select lock_at from c)
  group by x order by teams desc;
$$;

-- Public team list after lock (team names + picks, never emails) -----------
create or replace function public.teams_after_lock(p_contest text)
returns table (team_name text, picks int[], total int, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select e.team_name, e.picks, e.total, e.created_at from public.entries e
  join public.contests c on c.slug = e.contest
  where e.contest = p_contest and now() >= c.lock_at
  order by e.created_at;
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public;
grant execute on function public.submit_entry(text, text, text, int[], boolean) to anon;
grant execute on function public.entry_count(text) to anon;
grant execute on function public.ownership(text) to anon;
grant execute on function public.teams_after_lock(text) to anon;
