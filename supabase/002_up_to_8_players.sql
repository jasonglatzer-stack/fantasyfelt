-- Run once in Supabase SQL Editor: allows lineups of 1 to 8 players.
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
