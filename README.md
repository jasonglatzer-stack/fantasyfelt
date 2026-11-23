# FantasyFelt (beta)

Free fantasy poker for live tournament series, played for pride only. No entry fees, no prizes.

First event: WSOP Paradise 2026, at fantasyfelt.com/wsop-paradise-2026.

Hosted on Cloudflare Pages. Entries are stored in Supabase (EU, Frankfurt).

## One-time database setup

In Supabase, open **SQL Editor → New query**, paste `supabase/schema.sql` and click **Run**. Then do the same with `supabase/seed_players.sql`.

## Layout

- `/` home page with all events
- `/wsop-paradise-2026/` event page, team builder and sign-up
- `/wsop-paradise-2026/leaderboard` leaderboard (reads `data/paradise-2026/leaderboard.json`)
- `/rules`, `/privacy`
- `data/paradise-2026/players.json` frozen prices and stats (GPI Nov 18 and wsop.com Nov 23, 2026)
