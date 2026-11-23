(() => {
  const C = window.FF_CONFIG;
  const $ = s => document.querySelector(s);
  const fmt = n => Number(n).toLocaleString('en-US');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const LOCK = Date.parse(C.lockAt);
  const locked = () => Date.now() >= LOCK;
  const KEY = 'ff-' + C.contest + '-lineup';

  let P = [], byId = new Map(), picked = [], filter = 'all', q = '', open = null, own = null, limit = 100;
  try { picked = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { picked = []; }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(picked)); } catch (e) {} };
  const spent = () => picked.reduce((s, id) => s + (byId.get(id)?.p || 0), 0);

  async function rpc(fn, body) {
    if (!C.supabaseUrl || C.supabaseUrl.includes('YOUR-PROJECT')) throw new Error('Entries open soon.');
    const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: C.supabaseKey, Authorization: `Bearer ${C.supabaseKey}` },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && (data.message || data.hint)) || 'Something went wrong. Try again.');
    return data;
  }

  function matches(p) {
    const rem = C.cap - spent();
    if (q && !(p.n.toLowerCase().includes(q) || (p.c || '').toLowerCase().includes(q))) return false;
    if (filter === 'star') return p.p >= 800;
    if (filter === 'mid') return p.p >= 200 && p.p < 800;
    if (filter === 'value') return p.p < 200;
    if (filter === 'paradise') return p.pc > 0;
    if (filter === 'fits') return picked.includes(p.id) || (p.p <= rem && picked.length < C.rosterSize);
    return true;
  }

  function detail(p) {
    const rec = (p.r || []).map(x => `<div>${esc(x)}</div>`).join('') || '<div class="muted">No live wsop.com results on record.</div>';
    return `<div class="detail">
      <div class="kv"><span>GPI <b class="m">#${p.g}</b></span><span>WSOP bracelets <b class="m">${p.b}</b></span><span>WSOP cashes <b class="m">${fmt(p.wc)}</b></span><span>WSOP final tables <b class="m">${p.wf}</b></span><span>Form pts 2024–26 <b class="m">${p.fp}</b></span></div>
      <div class="kv"><span>Paradise 2023–25: <b class="m">${p.pc}</b> cashes, <b class="m">${p.pf}</b> final tables, <b class="m">${p.pw}</b> wins, <b class="m">$${fmt(p.pe)}</b></span></div>
      <div class="lbl" style="margin-top:4px">Recent live results (wsop.com)</div>${rec}</div>`;
  }

  function renderRows() {
    const list = P.filter(matches);
    const rem = C.cap - spent(), full = picked.length >= C.rosterSize;
    const ownMap = own ? new Map(own.map(o => [o.player_id, o.pct])) : null;
    const cls = ownMap ? 'row own' : 'row';
    document.querySelector('.row.head').className = 'row head lbl' + (ownMap ? ' own' : '');
    document.querySelector('.own-col').classList.toggle('hide', !ownMap);
    $('#rows').innerHTML = list.slice(0, limit).map(p => {
      const on = picked.includes(p.id);
      const fits = !full && p.p <= rem;
      const btn = locked() ? '' : on
        ? `<button class="add rm" data-id="${p.id}" aria-label="Remove ${esc(p.n)}">Remove</button>`
        : `<button class="add" data-id="${p.id}" ${fits ? '' : 'disabled'} aria-label="Add ${esc(p.n)}">${full ? 'Full' : fits ? 'Add' : 'Over cap'}</button>`;
      return `<div class="${cls}${on ? ' on' : ''}">
        <span class="m muted small">#${p.id}</span>
        <span style="min-width:0"><button class="pname" data-open="${p.id}" aria-expanded="${open === p.id}">${esc(p.n)}</button><span class="ctry">${esc(p.c)}</span></span>
        <span class="hide-s small">${p.pc ? `${p.pc} cash${p.pc > 1 ? 'es' : ''}${p.pf ? ` · ${p.pf} FT` : ''}` : '<span class="muted">—</span>'}</span>
        <span class="m r">${fmt(p.p)}</span>
        ${ownMap ? `<span class="r"><span class="m pill">${ownMap.get(p.id) ?? 0}%</span></span>` : ''}
        ${btn || '<span></span>'}
        ${open === p.id ? detail(p) : ''}
      </div>`;
    }).join('') || '<p class="pad muted">No players match.</p>';
    $('#more').innerHTML = list.length > limit ? `Showing ${limit} of ${fmt(list.length)}. <a href="#" id="showmore">Show more</a>` : `${fmt(list.length)} players`;
  }

  function renderRoster() {
    const s = spent(), rem = C.cap - s, n = picked.length, over = rem < 0;
    $('#count').textContent = n;
    $('#spent').textContent = fmt(s);
    $('#spent').style.color = over ? 'var(--live)' : '';
    $('#remaining').textContent = fmt(rem);
    $('#avg').textContent = n < C.rosterSize ? fmt(Math.floor(Math.max(rem, 0) / (C.rosterSize - n))) : '—';
    $('#bar').style.width = Math.min(100, s / C.cap * 100) + '%';
    $('#bar').parentElement.classList.toggle('over', over);
    let html = '';
    for (let i = 0; i < C.rosterSize; i++) {
      const p = byId.get(picked[i]);
      html += p
        ? `<li><span class="m n">${String(i + 1).padStart(2, '0')}</span><span class="nm">${esc(p.n)}</span><span class="m">${fmt(p.p)}</span>${locked() ? '' : `<button data-rm="${p.id}" aria-label="Remove ${esc(p.n)}">×</button>`}</li>`
        : `<li class="open"><span class="m n">${String(i + 1).padStart(2, '0')}</span><span class="nm">Open slot</span><span class="m">—</span></li>`;
    }
    $('#slots').innerHTML = html;
    const b = $('#submit');
    if (locked()) { b.disabled = true; b.textContent = 'Lineups are locked'; }
    else if (over) { b.disabled = true; b.textContent = `Over the cap by ${fmt(-rem)}`; }
    else if (n < C.rosterSize) { b.disabled = true; b.textContent = `Pick ${C.rosterSize - n} more to lock`; }
    else { b.disabled = false; b.textContent = 'Lock my lineup'; }
  }

  const render = () => { renderRows(); renderRoster(); };

  function toggle(id) {
    if (locked()) return;
    if (picked.includes(id)) picked = picked.filter(x => x !== id);
    else if (picked.length < C.rosterSize && spent() + byId.get(id).p <= C.cap) picked = picked.concat(id);
    save(); render();
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-id]'); if (a) { toggle(+a.dataset.id); return; }
    const r = e.target.closest('[data-rm]'); if (r) { toggle(+r.dataset.rm); return; }
    const o = e.target.closest('[data-open]'); if (o) { const id = +o.dataset.open; open = open === id ? null : id; renderRows(); return; }
    const c = e.target.closest('.chip'); if (c) { document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); filter = c.dataset.f; limit = 100; renderRows(); return; }
    if (e.target.id === 'showmore') { e.preventDefault(); limit += 200; renderRows(); }
  });
  let t; $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim().toLowerCase(); limit = 100; renderRows(); }, 150); });

  $('#form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#msg'); msg.className = ''; msg.textContent = '';
    const email = $('#email').value.trim(), team = $('#team').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.className = 'err'; msg.textContent = 'Enter a valid email.'; return; }
    if (team.length < 2) { msg.className = 'err'; msg.textContent = 'Give your team a name (2–30 characters).'; return; }
    if (!$('#rules').checked) { msg.className = 'err'; msg.textContent = 'Please confirm you are 18+ and agree to the rules.'; return; }
    const b = $('#submit'); b.disabled = true; b.textContent = 'Locking…';
    try {
      await rpc('submit_entry', { p_contest: C.contest, p_email: email, p_team: team, p_picks: picked, p_opt_in: $('#optin').checked });
      msg.className = 'ok'; msg.textContent = `You're in, ${team}! ${fmt(spent())} of 2,500 spent. Good luck, and enjoy the sweat. Remember: this one is for pride only.`;
      b.textContent = 'Lineup locked in ✓';
    } catch (err) {
      msg.className = 'err'; msg.textContent = err.message; renderRoster();
    }
  });

  function countdown() {
    const ms = LOCK - Date.now(), el = $('#countdown');
    if (ms <= 0) { el.textContent = 'Lineups are locked. Follow the sweat on the leaderboard.'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    el.textContent = `Lineups lock in ${d}d ${h}h ${m}m (Dec 2, 11:00 AM Nassau).`;
  }

  async function schedule() {
    const ev = await fetch('/data/paradise-2026/events.json').then(r => r.json());
    $('#sched').innerHTML = ev.map(e => {
      const d = e.start.slice(0, 6).replace(/ 0/, ' ');
      const b = e.buy >= 10000 ? `$${fmt(e.buy / 1000)}K` : `$${fmt(e.buy)}`;
      const main = /Super Main/.test(e.name);
      return `<div class="${main ? 'main' : ''}"><span class="lbl"${main ? ' style="color:var(--felt)"' : ''}>${esc(d)} · #${e.no}</span><br>${main ? '<b>' : ''}${esc(e.name.replace(/^\$[\d,]+ /, ''))}${main ? '</b>' : ''} <span class="m">${b} · ${e.mult}×</span></div>`;
    }).join('');
  }

  async function init() {
    countdown(); setInterval(countdown, 30000);
    schedule().catch(() => {});
    const data = await fetch('/data/paradise-2026/players.json').then(r => r.json());
    P = data.players; byId = new Map(P.map(p => [p.id, p]));
    picked = picked.filter(id => byId.has(id)).slice(0, C.rosterSize);
    if (locked()) { try { own = await rpc('ownership', { p_contest: C.contest }); } catch (e) { own = null; } }
    render();
  }
  init().catch(() => { $('#rows').innerHTML = '<p class="pad muted">Could not load players. Refresh to try again.</p>'; });
})();
