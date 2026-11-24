// FantasyFelt: email each entrant their team, and add them to the Brevo list.
// Triggered by a Supabase Database Webhook on INSERT into public.entries.
//
// Secrets to set in Supabase (Edge Functions -> Secrets), never in code:
//   BREVO_API_KEY    Brevo -> SMTP & API -> API keys
//   BREVO_LIST_ID    the numeric id of the "FantasyFelt" contact list
//   WEBHOOK_SECRET   any long random string; the webhook sends it as a header
//   SENDER_EMAIL     e.g. hello@fantasyfelt.com (must be a verified Brevo sender)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const { type, table, record } = await req.json();
  if (type !== "INSERT" || table !== "entries" || !record) return new Response("ignored");

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ids = (record.picks as number[]).join(",");
  const pr = await fetch(`${url}/rest/v1/players?select=id,name,price&id=in.(${ids})`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const players: { id: number; name: string; price: number }[] = await pr.json();
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = (record.picks as number[]).map((id) => byId.get(id)).filter(Boolean)
    .map((p) => `<tr><td style="padding:8px 0;border-bottom:1px solid #26332C">${esc(p!.name)}</td><td style="padding:8px 0;border-bottom:1px solid #26332C;text-align:right;font-family:monospace">${p!.price}</td></tr>`)
    .join("");

  const html = `<div style="background:#0B0F0D;color:#FFFFFF;font-family:Arial,sans-serif;padding:32px">
  <div style="max-width:520px;margin:0 auto">
  <p style="color:#2BFF88;font-weight:bold;letter-spacing:1px;text-transform:uppercase;font-size:12px">FantasyFelt (beta) · WSOP Paradise 2026</p>
  <h1 style="font-size:28px;margin:8px 0">You're in, ${esc(record.team_name)}!</h1>
  <p style="color:#9AA8A0">Here is your lineup. It's locked in and can't be changed. Scoring starts with Event #1 on December 2.</p>
  <table style="width:100%;border-collapse:collapse;color:#FFFFFF;margin:16px 0">${rows}
  <tr><td style="padding:10px 0;font-weight:bold">Cap used</td><td style="padding:10px 0;text-align:right;font-family:monospace;color:#2BFF88">${record.total} / 2,500</td></tr></table>
  <p style="color:#9AA8A0">Your team name is on the <a style="color:#2BFF88" href="https://fantasyfelt.com/wsop-paradise-2026/leaderboard">leaderboard</a> now. Everyone's lineups are revealed when the contest locks.</p>
  <p style="color:#9AA8A0;font-size:12px">Free to play, for pride only: no entry fees, no prizes. You're receiving this because you entered FantasyFelt and agreed to FantasyFelt emails. Not affiliated with the WSOP.</p>
  </div></div>`;

  const brevo = Deno.env.get("BREVO_API_KEY")!;
  const send = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "FantasyFelt", email: Deno.env.get("SENDER_EMAIL") },
      to: [{ email: record.email }],
      subject: `Your FantasyFelt team: ${record.team_name}`,
      htmlContent: html,
    }),
  });

  const listId = Number(Deno.env.get("BREVO_LIST_ID"));
  if (listId) {
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: record.email, listIds: [listId], updateEnabled: true, attributes: { FF_TEAM: record.team_name } }),
    });
  }
  return new Response(send.ok ? "sent" : `brevo error ${send.status}`, { status: send.ok ? 200 : 502 });
});
