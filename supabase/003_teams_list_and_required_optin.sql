-- Run once in Supabase SQL Editor.
-- 1) Both boxes (rules and FantasyFelt emails) are required to enter.
-- 2) Public team list for the leaderboard: team names show right away,
--    lineups stay hidden until lock. Emails are never returned.

create or replace function public.submit_entry(
  p_contest text, p_email text, p_team text, p_picks int[], p_opt_in boolean
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.contests%rowtype;
  v_total int;
  v_found int;
  v_team text := btrim(p_team);
begin
  select * into c from public.contests where slug = p_contest;
  if not found then raise exception 'Unknown contest'; end if;
  if now() >= c.lock_at then raise exception 'Lineups are locked'; end if;
  if p_opt_in is distinct from true then raise exception 'Please tick both boxes to enter'; end if;
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
  values (p_contest, lower(p_email), v_team, p_picks, v_total, true);
  return json_build_object('ok', true, 'total', v_total);
end $$;

create or replace function public.team_list(p_contest text)
returns table (team_name text, entered_at timestamptz, picks int[], total int)
language sql security definer set search_path = public stable as $$
  select e.team_name, e.created_at,
         case when now() >= c.lock_at then e.picks end,
         case when now() >= c.lock_at then e.total end
  from public.entries e join public.contests c on c.slug = e.contest
  where e.contest = p_contest
  order by e.created_at;
$$;

revoke execute on function public.team_list(text) from public;
grant execute on function public.team_list(text) to anon;
