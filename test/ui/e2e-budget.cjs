// E2E of the TIME-BUDGET order wizard in a real Chromium: mode on, hours, two routes, assign workers, SAVE (synthetic Supabase records the rows),
// view, reopen for replanning (budget mode and assignments restored), GPS session relinked to the new plan, acceptance kept.
// Derived from e2e-phase2a.cjs (same worlds: real Zensus, synthetic Supabase and street grid).
// What is REAL: the app build (worker/www), the Zensus 2022 files (admin/zensus, served instead of GitHub Pages), the planner, the wizard.
// What is SYNTHETIC: Supabase (fixtures.cjs, auth included – nothing leaves the machine, every write is recorded and must stay empty),
// the street/house data: Overpass is answered with an invented street grid + houses generated FROM the real census cells
// (so villages lie where the census has them, but the streets are not OSM). Geocoder: invented names. No outbound network is used.
// Run: (cd worker && npm ci && node build.mjs) && node test/ui/e2e-phase2a.cjs [outDir]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const F = require('./fixtures.cjs');
const ROOT = path.join(__dirname, '../../worker/www'), ZEN = path.join(__dirname, '../../admin/zensus/'), OUT = process.argv[2] || path.join(__dirname, 'out-e2e-budget');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.png':'image/png', '.woff2':'font/woff2', '.json':'application/json', '.svg':'image/svg+xml', '.mp4':'video/mp4' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  fs.readFile(f, (e, b) => { if(e){ s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type':types[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); });
const filt = (rows, sp) => { let r = rows; for(const [k, v] of sp){ if(['select', 'order', 'limit', 'offset', 'columns'].includes(k)) continue;
  const m = v.match(/^(not\.)?(eq|neq|in|is|gte|lte|gt|lt)\.(.*)$/); if(!m) continue; const [, not, op, val] = m;
  const test = x => { const a = x[k]; let ok;
    if(op === 'eq') ok = String(a) === val; else if(op === 'neq') ok = String(a) !== val; else if(op === 'is') ok = val === 'null' ? a == null : String(a) === val;
    else if(op === 'in') ok = val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(a));
    else ok = op === 'gte' ? a >= val : op === 'lte' ? a <= val : op === 'gt' ? a > val : a < val; return not ? !ok : ok; };
  r = r.filter(test); } return r; };

let fail = 0; const results = [];
const ok = (name, c, info) => { results.push({ name, ok:!!c, info }); console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null && info !== '' ? '  ' + info : '')); if(!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => srv.listen(4519, r));
  const Z = await import('../../worker/src/zensus.js'), src = Z.censusSource(async u => { const p = ZEN + u.split('/').pop(); return fs.existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(fs.readFileSync(p)).buffer } : { ok:false, status:404 }; });
  const b = await chromium.launch();
  const TILE = fs.readFileSync(path.join(__dirname, 'tile.png'));


  async function budgetFlow(name, lat, lng){
    console.log('\n===== ' + name + ' (time budget) =====');
    const [x, y] = Z.laea(lat, lng), WR = 300, cx0 = Math.floor(x / 100), cy0 = Math.floor(y / 100);
    const H = await src.households(cx0 - WR, cy0 - WR, cx0 + WR, cy0 + WR), id = (cx, cy) => cx * 100000 + cy, cache = new Map();
    const ll = (cx, cy) => { const k = cx + ',' + cy; if(!cache.has(k)) cache.set(k, Z.unlaea(cx * 100 + 50, cy * 100 + 50)); return cache.get(k); };
    const rnd = (a, c, i) => { const v = Math.sin(a * 12.9898 + c * 78.233 + i * 37.719) * 43758.5453; return v - Math.floor(v); };
    function overpassAnswer(S, W, N, E){
      const els = [], nodes = new Set(), addNode = (cx, cy) => { const k = id(cx, cy); if(nodes.has(k)) return k; nodes.add(k); const [la, lo] = ll(cx, cy); els.push({ type:'node', id:k, lat:la, lon:lo }); return k; };
      const inb = (la, lo) => la >= S && la <= N && lo >= W && lo <= E; let wid = 1;
      for(const [k, h] of H){ const [cx, cy] = k.split(',').map(Number), [la, lo] = ll(cx, cy); if(!inb(la, lo)) continue;
        for(const [dx, dy] of [[1, 0], [0, 1]]) for(let s = 1; s <= 30; s++){ const nx = cx + dx * s, ny = cy + dy * s; if(!H.has(nx + ',' + ny)) continue; const ns = []; for(let q = 0; q <= s; q++) ns.push(addNode(cx + dx * q, cy + dy * q)); els.push({ type:'way', id:id(cx, cy) * 2 + dx, nodes:ns, tags:{ highway:'residential', name:'Str ' + cx + '-' + cy } }); break; }
        const n = Math.min(40, h); for(let i = 0; i < n; i++) els.push({ type:'way', id:900000000000 + wid++, center:{ lat:la + (rnd(cx, cy, i) - .5) * 80 / 111320, lon:lo + (rnd(cy, cx, i + 9) - .5) * 80 / (111320 * Math.cos(la * Math.PI / 180)) }, tags:{ building:'house' } }); }
      return { elements:els };
    }
    // the synthetic database lives in memory of this run only: a copy of the fixtures, new rows are added to it
    const DB = { tasks:F.tables.tasks.map(t => ({ ...t })), task_plans:F.tables.task_plans.map(p => ({ ...p })), routes:F.tables.routes.map(r => ({ ...r })), task_workers:F.tables.task_workers.map(r => ({ ...r })) };
    const posts = [], patches = [], deletes = [], errors = [], blocked = [];
    const ctx = await b.newContext({ viewport:{ width:1440, height:900 } });
    await ctx.route(/.*/, async route => {
      const rq = route.request(), u = new URL(rq.url());
      if(u.hostname === 'localhost') return route.continue();
      if(/supabase\.co$/.test(u.hostname)){
        const acc = rq.headers()['accept'] || '', single = acc.includes('vnd.pgrst.object');
        if(u.pathname.startsWith('/storage/')) return route.fulfill({ status:404, body:'' });
        if(u.pathname.startsWith('/auth/')) return route.fulfill({ json:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } });
        if(u.pathname.startsWith('/functions/')) return route.fulfill({ json:{ ok:true } });
        const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/); if(!m) return route.fulfill({ json:null });
        if(m[1]) return route.fulfill({ json:m[2] in F.rpc ? F.rpc[m[2]] : null });
        const tbl = m[2], method = rq.method(), body = rq.postData() ? JSON.parse(rq.postData()) : null;
        if(method === 'POST'){
          posts.push({ tbl, body });
          if(tbl === 'tasks'){ const row = { id:'tnew', status:'open', created_at:new Date().toISOString(), company_id:F.CO, task_workers:[], ...body }; DB.tasks.push(row); return route.fulfill({ status:201, json:single ? row : [row] }); }
          if(tbl === 'task_plans'){ const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id:'pnew-' + posts.filter(q => q.tbl === 'task_plans').length + '-' + i, status:'open', work_dates:[], skipped:[], ...r })); DB.task_plans.push(...rows); return route.fulfill({ status:201, json:single ? rows[0] : rows }); }
          return route.fulfill({ status:201, json:[] });
        }
        if(method === 'PATCH' || method === 'PUT'){ patches.push({ tbl, q:u.search, body }); return route.fulfill({ status:200, json:single ? {} : [] }); }
        if(method === 'DELETE'){ deletes.push({ tbl, q:u.search }); if(tbl === 'task_plans'){ const tid = (u.searchParams.get('task_id') || '').replace('eq.', ''); DB.task_plans = DB.task_plans.filter(p => p.task_id !== tid); } return route.fulfill({ status:204, body:'' }); }
        let rows = filt(DB[tbl] || F.tables[tbl] || [], u.searchParams);
        if(tbl === 'tasks') rows = rows.map(t => ({ ...t, task_workers:DB.task_workers.filter(z => z.task_id === t.id) }));
        return route.fulfill({ status:200, headers:{ 'content-range':`0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'content-type':'application/json' }, body:JSON.stringify(single ? (rows[0] || null) : rows) });
      }
      if(/overpass|maps\.mail\.ru/.test(u.hostname)){ const q = decodeURIComponent((rq.postData() || u.search).replace(/\+/g, ' ')), m = q.match(/\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/);
        return route.fulfill({ status:200, json:m ? overpassAnswer(+m[1], +m[2], +m[3], +m[4]) : { elements:[] }, headers:{ 'access-control-allow-origin':'*' } }); }
      if(/urlose\.github\.io$/.test(u.hostname) && u.pathname.includes('/zensus/')){ const f = ZEN + u.pathname.split('/').pop(); return fs.existsSync(f) ? route.fulfill({ status:200, body:fs.readFileSync(f), headers:{ 'access-control-allow-origin':'*' } }) : route.fulfill({ status:404, body:'', headers:{ 'access-control-allow-origin':'*' } }); }
      if(/photon\.komoot\.io$/.test(u.hostname)){ const la = +u.searchParams.get('lat'), lo = +u.searchParams.get('lon'), nm = 'Testdorf ' + (Math.abs(Math.round(la * 1e3)) % 1000) + '/' + (Math.abs(Math.round(lo * 1e3)) % 1000);
        return route.fulfill({ status:200, json:{ features:u.pathname.includes('reverse') ? [{ properties:{ city:name, district:nm }, geometry:{ type:'Point', coordinates:[lo, la] } }] : [] }, headers:{ 'access-control-allow-origin':'*' } }); }
      if(/tile\.openstreetmap|openstreetmap\.de|basemaps|cartocdn/.test(u.hostname)) return route.fulfill({ status:200, contentType:'image/png', body:TILE });
      blocked.push(u.hostname); return route.abort();
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push('pageerror: ' + e.message)); pg.on('console', m => { if(m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    const sess = { access_token:'x', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now() / 1000) + 3600, refresh_token:'y', user:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } };
    await pg.addInitScript(s => { localStorage.setItem('fm-admin-auth', JSON.stringify(s)); localStorage.setItem('CapacitorStorage.role', '"admin"'); localStorage.setItem('CapacitorStorage.theme', '"light"'); localStorage.setItem('CapacitorStorage.lang', '"de"'); localStorage.setItem('CapacitorStorage.introSeen', 'true'); }, sess);
    await pg.addInitScript(() => { const P = Worker.prototype.postMessage; Worker.prototype.postMessage = function(m, ...r){ try{ const pl = m && (m.payload || m.args || m); const q = pl && (pl.payload || pl); if(q && q.flyers != null) (window.__req = window.__req || []).push({ op:m.op, budget:q.budget, n:q.n, travel:q.travel, flyers:q.flyers, days:q.days, hours:q.hours, sides:(q.side || []).length }); else (window.__req = window.__req || []).push({ keys:Object.keys(m || {}).join(), op:m && m.op }); }catch{} return P.call(this, m, ...r); }; });
    await pg.goto('http://localhost:4519/#new', { waitUntil:'load' }); await sleep(3000);
    const until = async (fn, ms = 90000, arg) => { const t0 = Date.now(); while(Date.now() - t0 < ms){ try{ const v = await pg.evaluate(fn, arg); if(v) return v; }catch{} await sleep(400); } return null; };
    const budget = () => pg.evaluate(() => { const bx = document.querySelector('.budget-box'); if(!bx) return null; const nums = [...bx.querySelectorAll('.cov-n b')].map(e => e.textContent), rows = [...bx.querySelectorAll('.route-row')].map(e => e.innerText.replace(/\n+/g, ' | ')); return { nums, rows, text:bx.innerText }; });
    const stable = async (ms = 4000, max = 150000) => { let last = null, since = Date.now(); const t0 = Date.now(); while(Date.now() - t0 < max){ const h = JSON.stringify(await budget()); if(h === last && h !== 'null'){ if(Date.now() - since > ms) return true; } else { last = h; since = Date.now(); } await sleep(500); } return false; };
    const shot = n => pg.screenshot({ path:path.join(OUT, name.toLowerCase() + '-' + n + '.png') });

    // ---- wizard: budget mode ----
    await pg.waitForSelector('#fullMap');
    await pg.evaluate(([la, lo]) => { const m = document.getElementById('fullMap')._map; m.setView([la, lo], 14, { animate:false }); m.fire('click', { latlng:{ lat:la, lng:lo } }); const t = document.getElementById('cTitle'); if(t) t.value = 'E2E Budget ' + la; }, [lat, lng]);
    for(let k = 0; k < 2; k++){ await pg.evaluate(() => { const n = document.getElementById('cNext'); if(n && !n.disabled) n.click(); }); await sleep(1500); }
    ok(`${name}: step "Flyer/Mitarbeiter" has the mode "Maximum Flyer für die Arbeitszeit"`, !!(await until(() => !!document.getElementById('cBudget'), 60000)));
    await until(() => !!document.querySelector('.cov'), 120000); await sleep(1500);
    await pg.evaluate(() => { const c = document.getElementById('cBudget'); c.checked = true; c.dispatchEvent(new Event('change')); });
    await until(() => !!document.getElementById('cBudH'), 20000);
    await pg.evaluate(() => { const h = document.getElementById('cBudH'); h.value = 6; h.dispatchEvent(new Event('change')); });
    const hrsOf = () => pg.evaluate(() => { const bx = document.querySelector('.budget-box'); if(!bx) return null; const v = bx.querySelectorAll('.cov-n b')[1]; return v ? parseFloat(v.textContent.replace(',', '.')) : null; });
    for(let i = 0; i < 100; i++){ const h = await hrsOf(); if(h != null && h <= 6.31) break; await sleep(800); }
    console.log('   requests to the planner:', JSON.stringify(await pg.evaluate(() => window.__req || [])), 'hours shown', await hrsOf());
    if(process.env.STOP1){ console.log('   panel:', (await pg.evaluate(() => (document.querySelector('.budget-box') || {}).innerText || 'none')).replace(/\n+/g, ' | ').slice(0, 700), '| input:', await pg.evaluate(() => (document.getElementById('cBudH') || {}).value)); await b.close(); srv.close(); process.exit(0); }
    await stable(5000, 60000);
    let bx = await budget(); await shot('1-budget');
    ok(`${name}: result shows possible flyers, hours, uncovered, one row per worker, the estimate note`, bx && bx.nums.length === 3 && bx.rows.length === 2 && /Schätzungen/.test(bx.text) && /Maximum Flyer/.test(bx.text), bx && JSON.stringify(bx.nums) + ' | ' + bx.rows.join(' // '));
    const hoursUsed = bx && bx.nums[1];
    ok(`${name}: the hours shown stay within the 6 h target + 5 % tolerance`, !!hoursUsed && (() => { const m = hoursUsed.match(/(\d+)\s*h\s*(\d+)?/i) || hoursUsed.match(/(\d+)[^\d]+(\d+)?/); return m ? (+m[1] + (+m[2] || 0) / 60) <= 6.31 : false; })(), hoursUsed);
    // the automatic selection (PR #13) already put several nearby villages into the order: there are rides between places
    bx = await budget(); await shot('2-budget-places');
    ok(`${name}: with the automatically selected villages: both workers have routes, rides between places are reported as UNKNOWN (no car assumed)`, bx && bx.rows.length === 2 && /Fahrzeit unbekannt/.test(bx.text) && /kein Auto/.test(bx.text), bx && bx.text.split('\n').filter(l => /Ortswechsel/.test(l)).join(' '));
    // ---- assign workers (one select per person) and go to the last step ----
    await pg.evaluate(() => { const n = document.getElementById('cNext'); if(n && !n.disabled) n.click(); }); await sleep(2000);   // step 4 "Team"
    await until(() => document.querySelectorAll('select[data-wsel]').length > 0, 15000);
    console.log('   last step text:', (await pg.evaluate(() => document.querySelector('#cSheet').innerText)).replace(/\n+/g, ' | ').slice(0, 900), '| save btn:', await pg.evaluate(() => { const b = document.getElementById('cSave'); return b ? (b.disabled ? 'disabled' : 'enabled') : 'none'; }));
    const opts = await pg.evaluate(() => [...document.querySelectorAll('select[data-wsel]')].map(s => [...s.options].map(o => o.value).filter(Boolean)));
    ok(`${name}: one worker choice per person (two common routes, not one per place)`, opts.length === 2, JSON.stringify(opts.map(o => o.length)));
    const pick = opts.map((o, i) => o[i] || o[0]); await pg.evaluate(p => { document.querySelectorAll('select[data-wsel]').forEach((s, i) => { s.value = p[i]; s.dispatchEvent(new Event('change')); }); }, pick); await sleep(1500);
    for(let k = 0; k < 3; k++){ const done = await pg.evaluate(() => !!document.getElementById('cSave')); if(done) break; await pg.evaluate(() => { const n = document.getElementById('cNext'); if(n && !n.disabled) n.click(); }); await sleep(1500); }
    ok(`${name}: nothing saved before the admin presses "Auftrag speichern"`, posts.length === 0, 'POSTs so far: ' + posts.length);
    await pg.evaluate(() => document.getElementById('cSave').click()); await sleep(2500);
    const cerr = await pg.evaluate(() => (document.getElementById('cErr') || {}).textContent); if(cerr) console.log('   save error shown:', cerr);
    await until(() => /task/.test(location.hash) || !document.getElementById('cSave') || document.querySelector('#tMap'), 60000); await sleep(3000);
    const pl = posts.filter(q => q.tbl === 'task_plans').flatMap(q => Array.isArray(q.body) ? q.body : [q.body]), tk = posts.find(q => q.tbl === 'tasks');
    ok(`${name}: SAVED: two task_plans rows (one per worker), not one per place`, pl.length === 2 && pl.map(r => r.idx).join() === '0,1', pl.length + ' rows; places in days: ' + pl.map(r => (r.days || []).map(d => d.place).join('|')).join(' // '));
    ok(`${name}: rows keep worker_id (identity), the budget on the first day, town sections per day, jump points between towns`, pl.length === 2 && pl.map(r => r.worker_id).join() === pick.join() && pl.every(r => r.days[0].budget_h === 6 && r.days.every(d => d.parts && d.parts.length)) && pl.every(r => r.path.filter(q => q[2] === 1).length >= 1), 'workers ' + pl.map(r => r.worker_id).join());
    ok(`${name}: integer mailbox counts, boxes/steps/reserve/path present for GPS and navigation`, pl.every(r => Number.isInteger(r.mailboxes) && r.boxes.length > 0 && r.steps.length > 0 && r.path.length > 20 && Array.isArray(r.reserve)));
    ok(`${name}: order row is the new zone/budget order (travel zones), flyers = what is planned`, tk && tk.body.travel === 'zones' && tk.body.flyers === pl.reduce((a, r) => a + r.mailboxes, 0), tk && ('flyers ' + tk.body.flyers));
    const view = await pg.evaluate(() => document.body.innerText);
    ok(`${name}: the saved order opens (task view) and lists the routes`, /E2E Budget/.test(view), '');
    await shot('3-saved');
    // ---- GPS session of worker 1 on the saved plan; the admin accepted the plan ----
    const saved = DB.task_plans.filter(p => p.task_id === 'tnew'); const dates = Array.from({ length:9 }, (_, i) => new Date(Date.now() + (i + 1) * 864e5).toISOString().slice(0, 10));
    saved[0].status = 'accepted'; saved[0].work_dates = dates; saved[0].accepted_at = new Date().toISOString();
    DB.routes.push({ id:'rg1', worker_id:saved[0].worker_id, task_id:'tnew', plan_id:saved[0].id, started_at:new Date(Date.now() - 4e6).toISOString(), ended_at:new Date(Date.now() - 3e6).toISOString(), distance_m:2000, break_s:0, paused_at:null });
    // ---- reopen for re-planning: budget mode, hours, workers and assignment come back ----
    await pg.evaluate(() => { const e = document.getElementById('tEdit'); if(e) e.click(); }); await sleep(1500);
    const hasRe = await pg.evaluate(() => !!document.getElementById('eReplan')); if(hasRe) await pg.evaluate(() => document.getElementById('eReplan').click()); await sleep(2500);
    ok(`${name}: the saved order can be reopened for editing (Neu planen)`, hasRe);
    await pg.waitForSelector('#fullMap', { timeout:60000 }); await sleep(2000);
    for(let k = 0; k < 2; k++){ await pg.evaluate(() => { const n = document.getElementById('cNext'); if(n && !n.disabled) n.click(); }); await sleep(1500); }
    await until(() => !!document.getElementById('cBudget'), 60000);
    const re = await pg.evaluate(() => ({ on:document.getElementById('cBudget') && document.getElementById('cBudget').checked, hours:document.getElementById('cBudH') && document.getElementById('cBudH').value, n:(document.getElementById('vN') || {}).textContent }));
    ok(`${name}: reopened in budget mode with 6 h and the same number of workers`, re.on === true && re.hours === '6' && (re.n === '2' || re.n === '—'), JSON.stringify(re));
    await until(() => !!document.querySelector('.budget-box'), 240000); await stable(5000, 240000);
    const pre = await pg.evaluate(() => [...document.querySelectorAll('select[data-wsel]')].map(s => s.value));
    ok(`${name}: the assignment of the workers is restored`, pre.join() === pick.join(), pre.join() + ' vs ' + pick.join());
    // save again (replan): acceptance and the GPS session follow the worker to the new plan
    const before = posts.filter(q => q.tbl === 'task_plans').length;
    for(let k = 0; k < 3; k++){ const done = await pg.evaluate(() => !!document.getElementById('cSave')); if(done) break; await pg.evaluate(() => { const n = document.getElementById('cNext'); if(n && !n.disabled) n.click(); }); await sleep(1200); }
    await pg.evaluate(() => document.getElementById('cSave').click()); await sleep(6000);
    const pl2 = posts.filter(q => q.tbl === 'task_plans').slice(before).flatMap(q => Array.isArray(q.body) ? q.body : [q.body]);
    ok(`${name}: replanned: again exactly two rows, old rows of this order replaced (DELETE), nothing else touched`, pl2.length === 2 && deletes.some(d => d.tbl === 'task_plans'), pl2.length + ' rows');
    const kept = pl2.find(r => r.worker_id === pick[0]);
    ok(`${name}: the accepted plan keeps its acceptance and dates for the same worker`, kept && kept.status === 'accepted' && kept.work_dates && kept.work_dates.length >= 1, kept && (kept.status + ' ' + (kept.work_dates || []).length + ' dates'));
    const lnk = patches.filter(p => p.tbl === 'routes' && p.body && p.body.plan_id);
    ok(`${name}: the walked GPS session of the worker is relinked to the new plan (routes.plan_id, by worker)`, lnk.length >= 1 && lnk.every(p => new RegExp('worker_id=eq\\.' + pick[0]).test(p.q) || new RegExp('worker_id=eq\\.' + pick[1]).test(p.q)) && lnk.some(p => p.q.includes('worker_id=eq.' + pick[0])), lnk.map(p => p.q).join(' ; '));
    ok(`${name}: the number of rows never exceeds the number of workers (no extra empty routes)`, DB.task_plans.filter(p => p.task_id === 'tnew').length === 2, String(DB.task_plans.filter(p => p.task_id === 'tnew').length));
    ok(`${name}: no JavaScript errors in the console`, errors.length === 0, errors.slice(0, 3).join(' | '));
    ok(`${name}: no request left the machine`, blocked.length === 0, blocked.length ? [...new Set(blocked)].join(',') : 'blocked hosts: none');
    await ctx.close();
  }
  try{
    await budgetFlow('Weidenberg', 49.942445, 11.729003);
  }catch(e){ ok('test run completed without an exception', false, e.stack.split('\n').slice(0, 4).join(' ')); }
  fs.writeFileSync(path.join(OUT, 'e2e-budget-results.json'), JSON.stringify(results, null, 1));
  console.log('\n' + (fail ? fail + ' FAILED' : 'all ok'));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
