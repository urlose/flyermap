// E2E of RE-PLANNING an existing order (PR #28) in a real Chromium against a REAL PostgreSQL with the real functions:
// supabase/2026-11-16_atomic_task_plans.sql (create) and supabase/2026-11-17_atomic_replan.sql (re-plan), on the
// production-like schema test/sql/fixtures/replan_schema.sql (tables, triggers, RLS). Synthetic data only, no production.
// Flow: create an order in the wizard -> distributor 1 accepted without dates and walked once, distributor 2 accepted
// -> re-plan: dry run -> warning -> cancel (nothing saved) -> confirm while a shift starts (refused, old state kept)
// -> confirm with an injected failure in the middle of the transaction (rolled back, old state kept) -> confirm -> saved.
// Everything else (lists, notifications, maps, census) as in e2e-timefirst.cjs: fake Supabase in memory, invented streets.
// Needs: an empty PostgreSQL reachable with PGHOST/PGPORT/PGUSER/PGPASSWORD (a database fm_e2e_replan is created).
// Run: (cd worker && npm ci && node build.mjs) && node test/ui/e2e-replan.cjs [outDir]     (CHROME=/path/to/chrome optional)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const F = require('./fixtures.cjs');
const ROOT = path.join(__dirname, '../../worker/www'), ZEN = path.join(__dirname, '../../admin/zensus/'), OUT = process.argv[2] || path.join(__dirname, 'out-e2e-replan');
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

const { execFileSync } = require('child_process');
// ---------- real PostgreSQL ----------
const ROOTDIR = path.join(__dirname, '../..'), DBN = 'fm_e2e_replan', ADMIN = 'a0000000-0000-4000-8000-0000000000e2';
const psql = (sql, { db = DBN, role = null } = {}) => {
  const pre = role ? `set role ${role}; set request.jwt.claim.sub = '${ADMIN}';\n` : '';
  try{ return { out:execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-qAtX', '-d', db], { input:pre + sql, env:{ ...process.env, PGOPTIONS:'-c client_min_messages=warning' }, encoding:'utf8', maxBuffer:64e6 }).trim() }; }
  catch(e){ const m = String(e.stderr || e.message).match(/ERROR:\s+(.*)/); return { error:{ code:'P0001', message:m ? m[1].trim() : String(e.stderr || e.message) } }; }
};
// fixture ids are short strings ('w1'); the database needs uuids: one fixed uuid per worker, mapped both ways
const WID = new Map(F.tables.workers.map((w, i) => [w.id, 'e0000000-0000-4000-8000-' + String(i + 1).padStart(12, '0')]));
const toDb = s => { let t = s; for(const [k, v] of WID) t = t.split('"' + k + '"').join('"' + v + '"'); return t; };
const fromDb = s => { let t = s; for(const [k, v] of WID) t = t.split('"' + v + '"').join('"' + k + '"'); return t; };
const PG = {
  setup(){
    const r0 = psql(`drop database if exists ${DBN}; create database ${DBN};`.split(';').filter(x => x.trim()).map(x => x + ';').join('\n'), { db:'postgres' });
    if(r0.error && !/role .* already exists/.test(r0.error.message)) throw new Error('db: ' + r0.error.message);
    for(const r of ['anon', 'authenticated', 'service_role nologin bypassrls']) psql(`do $$ begin create role ${r.split(' ')[0]} ${r.includes(' ') ? r.slice(r.indexOf(' ') + 1) : 'nologin'}; exception when duplicate_object then null; end $$;`, { db:'postgres' });
    const schema = fs.readFileSync(path.join(ROOTDIR, 'test/sql/fixtures/replan_schema.sql'), 'utf8').replace(/^create role .*$/m, '');
    for(const f of [schema, fs.readFileSync(path.join(ROOTDIR, 'supabase/2026-11-16_atomic_task_plans.sql'), 'utf8'), fs.readFileSync(path.join(ROOTDIR, 'supabase/2026-11-17_atomic_replan.sql'), 'utf8')]){
      const r = psql(f); if(r.error) throw new Error('setup: ' + r.error.message); }
    const ws = F.tables.workers.map(w => `('${WID.get(w.id)}', ${"'" + String(w.name).replace(/'/g, "''") + "'"}, '${F.CO}')`).join(',');
    const r = psql(`insert into companies values ('${F.CO}', 'Test'); insert into admins values ('${ADMIN}', '${F.CO}'); insert into workers values ${ws};`);
    if(r.error) throw new Error('seed: ' + r.error.message);
  },
  rpc(fn, args){
    const j = x => '$j$' + toDb(JSON.stringify(x)) + '$j$::jsonb';
    const sql = fn === 'create_task_with_plans' ? `select public.create_task_with_plans(${j(args.p_task)}, ${j(args.p_plans)});`
      : `select public.replan_task_with_plans('${args.p_task_id}', ${j(args.p_task)}, ${j(args.p_plans)}, ${args.p_dry_run ? 'true' : 'false'});`;
    const r = psql(sql, { role:'authenticated' }); if(r.error) return r;
    return { data:JSON.parse(fromDb(r.out)) };
  },
  q(sql){ const r = psql(sql); if(r.error) throw new Error(r.error.message + ' in ' + sql.slice(0, 120)); return r.out; },
  // fingerprint of everything that belongs to one order
  snap(id){ return PG.q(`select md5(coalesce((select to_jsonb(t)::text from tasks t where id='${id}'),'') || coalesce((select string_agg(to_jsonb(p)::text,'' order by id) from task_plans p where task_id='${id}'),'') || coalesce((select string_agg(worker_id::text,',' order by worker_id) from task_workers where task_id='${id}'),'') || coalesce((select string_agg(to_jsonb(r)::text,'' order by id) from routes r where task_id='${id}'),'') || (select count(*) from task_plans_trash) || (select count(*) from tasks_history))`); },
};
// the browser's in-memory database follows the real one after each successful save
function syncTask(DB, data){
  if(!data || !data.task) return; const tk = { ...data.task, task_workers:[] };
  DB.tasks = DB.tasks.filter(t => t.id !== tk.id).concat(tk);
  DB.task_plans = DB.task_plans.filter(p => p.task_id !== tk.id).concat(data.plans || []);
  DB.task_workers = DB.task_workers.filter(w => w.task_id !== tk.id).concat([...new Set((data.plans || []).map(p => p.worker_id).filter(Boolean))].map(w => ({ task_id:tk.id, worker_id:w })));
}

let fail = 0; const results = [];
const ok = (name, c, info) => { results.push({ name, ok:!!c, info }); console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null && info !== '' ? '  ' + info : '')); if(!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => srv.listen(4521, r));
  const Z = await import('../../worker/src/zensus.js'), src = Z.censusSource(async u => { const p = ZEN + u.split('/').pop(); return fs.existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(fs.readFileSync(p)).buffer } : { ok:false, status:404 }; });
  const b = await chromium.launch(process.env.CHROME ? { executablePath:process.env.CHROME, args:['--no-sandbox'] } : {});
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
    const posts = [], patches = [], deletes = [], errors = [], blocked = [], rpcs = [];
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
        if(m[1]){
          if(m[2] === 'create_task_with_plans' || m[2] === 'replan_task_with_plans'){
            const args = rq.postDataJSON() || {}, r = PG.rpc(m[2], args);
            rpcs.push({ fn:m[2], dry:!!args.p_dry_run, ok:!r.error, error:r.error && r.error.message });
            if(r.error) return route.fulfill({ status:400, json:r.error });
            if(!args.p_dry_run) syncTask(DB, r.data);
            return route.fulfill({ status:200, json:r.data });
          }
          if(m[2] === 'replan_task_with_plans') return route.fulfill({ status:404, json:{} });
          return route.fulfill({ json:m[2] in F.rpc ? F.rpc[m[2]] : null });
        }
        const tbl = m[2], method = rq.method(), body = rq.postData() ? JSON.parse(rq.postData()) : null;
        if(method === 'POST'){
          posts.push({ tbl, body });
          if(tbl === 'tasks'){ const row = { id:'tnew', status:'open', created_at:new Date().toISOString(), company_id:F.CO, task_workers:[], ...body }; DB.tasks.push(row); return route.fulfill({ status:201, json:single ? row : [row] }); }
          if(tbl === 'task_plans'){ const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id:'pnew-' + posts.filter(q => q.tbl === 'task_plans').length + '-' + i, status:'open', work_dates:[], skipped:[], ...r })); DB.task_plans.push(...rows); return route.fulfill({ status:201, json:single ? rows[0] : rows }); }
          return route.fulfill({ status:201, json:[] });
        }
        if(method === 'PATCH' || method === 'PUT'){ patches.push({ tbl, q:u.search, body }); const hit = (DB[tbl] || []).filter(r => Object.entries(Object.fromEntries(u.searchParams)).every(([k, v]) => !/^eq\./.test(v) || String(r[k]) === v.slice(3))); hit.forEach(r => Object.assign(r, body)); return route.fulfill({ status:200, json:single ? (hit[0] || {}) : hit }); }
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
    await pg.goto('http://localhost:4521/#new', { waitUntil:'load' }); await sleep(3000);
    const until = async (fn, ms = 90000, arg) => { const t0 = Date.now(); while(Date.now() - t0 < ms){ try{ const v = await pg.evaluate(fn, arg); if(v) return v; }catch{} await sleep(400); } return null; };
    const budget = () => pg.evaluate(() => { const bx = document.querySelector('.budget-box'); if(!bx) return null; const nums = [...bx.querySelectorAll('.cov-n b')].map(e => e.textContent), rows = [...bx.querySelectorAll('.route-row')].map(e => e.innerText.replace(/\n+/g, ' | ')); return { nums, rows, text:bx.innerText }; });
    const stable = async (ms = 4000, max = 150000) => { let last = null, since = Date.now(); const t0 = Date.now(); while(Date.now() - t0 < max){ const h = JSON.stringify(await budget()); if(h === last && h !== 'null'){ if(Date.now() - since > ms) return true; } else { last = h; since = Date.now(); } await sleep(500); } return false; };
    const shot = n => pg.screenshot({ path:path.join(OUT, name.toLowerCase() + '-' + n + '.png') });

    const next = () => pg.evaluate(() => { const b = document.getElementById('cNext'); if(b && !b.disabled) b.click(); });

    // ---- 1. new order through the wizard, saved by the REAL create function ----
    await pg.waitForSelector('#fullMap');
    await pg.evaluate(([la, lo]) => { const m = document.getElementById('fullMap')._map; m.setView([la, lo], 14, { animate:false }); m.fire('click', { latlng:{ lat:la, lng:lo } }); const t = document.getElementById('cTitle'); if(t) t.value = 'E2E Replan ' + la; }, [lat, lng]);
    await next();
    await until(() => !!document.getElementById('cBudH'), 90000);
    await pg.evaluate(() => { const h = document.getElementById('cBudH'); h.value = 16; h.dispatchEvent(new Event('change')); });
    await next();
    await until(() => !!document.querySelector('.budget-box'), 240000); await stable(5000, 240000);
    await next();
    await until(() => document.querySelectorAll('select[data-wsel]').length >= 2, 30000);
    const opts = await pg.evaluate(() => [...document.querySelectorAll('select[data-wsel]')].map(s => [...s.options].map(o => o.value).filter(Boolean)));
    const pick = opts.map((o, i) => o[i] || o[0]);
    await pg.evaluate(p => { document.querySelectorAll('select[data-wsel]').forEach((s, i) => { s.value = p[i]; s.dispatchEvent(new Event('change')); }); }, pick);
    await next(); await until(() => !!document.getElementById('cSave'), 30000);
    await pg.evaluate(() => document.getElementById('cSave').click());
    await until(() => document.querySelector('#tCustomerExport') !== null, 60000);
    const tk = DB.tasks.find(t => /^E2E Replan/.test(t.title) || /E2E Replan/.test(t.title));
    const TID = tk && tk.id;
    ok(name + ': order created in the real database (2 routes, 2 distributors)', !!TID && PG.q(`select count(*) from task_plans where task_id='${TID}'`) === '2' && PG.q(`select count(*) from task_workers where task_id='${TID}'`) === '2', TID);
    if(!TID) throw new Error('no order created');
    const W1 = pick[0], W2 = pick[1], name1 = (F.tables.workers.find(w => w.id === W1) || {}).name;

    // ---- 2. distributor 1 accepted but has not chosen dates yet, walked once; distributor 2 accepted with 5 dates ----
    const days = JSON.parse(PG.q(`select jsonb_agg(jsonb_array_length(days) order by idx) from task_plans where task_id='${TID}'`));
    const dates = n => JSON.stringify(Array.from({ length:n }, (_, i) => '2026-12-0' + (i + 1)));
    PG.q(`update task_plans set status='accepted', accepted_at=now(), committed_terms='v1', work_dates='[]' where task_id='${TID}' and idx=0;
          update task_plans set status='accepted', accepted_at=now(), committed_terms='v1', work_dates='${dates(5)}' where task_id='${TID}' and idx=1;
          insert into routes(id, worker_id, task_id, plan_id, company_id, started_at, ended_at) select '30000000-0000-4000-8000-0000000000e1', worker_id, task_id, id, '${F.CO}', now() - interval '5 hours', now() - interval '1 hour' from task_plans where task_id='${TID}' and idx=0;`);
    const plans0 = JSON.parse(fromDb(PG.q(`select jsonb_agg(to_jsonb(p) order by idx) from task_plans p where task_id='${TID}'`)));
    DB.task_plans = DB.task_plans.filter(p => p.task_id !== TID).concat(plans0);
    DB.routes.push({ id:'30000000-0000-4000-8000-0000000000e1', worker_id:W1, task_id:TID, plan_id:plans0[0].id, paused_at:null, last30_m:0, started_at:new Date(Date.now() - 5 * 36e5).toISOString(), ended_at:new Date(Date.now() - 36e5).toISOString(), break_s:0, distance_m:9000, place:name, adj_s:0, together_s:0 });
    const before = PG.snap(TID), ids0 = plans0.map(p => p.id);

    // ---- 3. open the order, re-plan ----
    let rideAsked = false;
    const openReplan = async () => {
      const step = async (label, v) => { if(!v){ await shot('stuck-' + label); console.log('  stuck at: ' + label); } return v; };
      await pg.goto('http://localhost:4521/#task/' + TID, { waitUntil:'load' });
      if(!await step('order-view', await until(() => !!document.getElementById('tEdit2'), 30000))) return false;
      await pg.evaluate(() => document.getElementById('tEdit2').click());
      if(!await step('edit-sheet', await until(() => !!document.getElementById('eReplan'), 15000))) return false;
      // the button exists a moment before its handler is bound: press until the wizard opens
      if(!await step('wizard', await until(() => { if(document.getElementById('cSheet')) return true; const b = document.getElementById('eReplan'); if(b) b.click(); return false; }, 20000))) return false;
      // known gap (not this PR): nearby places auto-selected at creation are saved without a ride time; the re-plan then
      // asks for one. The admin goes back to step 2 and enters it (30 min, like the real Leipheim order).
      const first = await until(() => document.querySelector('.budget-box') ? 'plan' : /Anfahrtszeit/.test(document.getElementById('cSheet')?.innerText || '') ? 'ride' : null, 240000);
      if(first === 'ride'){
        rideAsked = true;
        await pg.evaluate(() => document.getElementById('cPrev').click());
        if(!await step('ride-input', await until(() => !!document.getElementById('cBudTravel'), 30000))) return false;
        await pg.evaluate(() => { const i = document.getElementById('cBudTravel'); i.value = 30; i.dispatchEvent(new Event('change')); });
        await next();
      }
      if(!await step('route-step', await until(() => !!document.querySelector('.budget-box'), 240000))) return false;
      await stable(5000, 240000);
      await next(); if(!await step('team-step', await until(() => document.querySelectorAll('select[data-wsel]').length >= 2, 30000))) return false;
      await next(); return step('overview-step', await until(() => !!document.getElementById('cSave'), 30000));
    };
    const dialog = () => until(() => { const y = document.querySelector('.modal [data-y], [data-y]'); if(!y) return null; const m = y.closest('.modal') || y.parentElement; return { title:(m.querySelector('h2') || {}).textContent, text:(m.querySelector('p') || {}).textContent }; }, 60000);
    const saveAndWaitDialog = async () => { const n = rpcs.length; await pg.evaluate(() => document.getElementById('cSave').click()); const dl = await dialog(); return { dl, calls:rpcs.slice(n) }; };
    const errShown = () => until(() => { const e = document.getElementById('cErr'); const tt = [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' '); return (e && e.textContent.trim()) || tt.trim() || null; }, 30000);
    const clearErr = () => pg.evaluate(() => { const e = document.getElementById('cErr'); if(e) e.textContent = ''; document.querySelectorAll('.toast').forEach(x => x.remove()); });

    ok(name + ': re-plan wizard opens on the existing order and reaches "save"', await openReplan());
    if(rideAsked) console.log('  note: re-plan asked for a ride time (nearby places saved at creation without one) – entered 30 min');
    let r = await saveAndWaitDialog();
    ok(name + ': save starts with a dry run (no real call yet)', r.calls.length === 1 && r.calls[0].fn === 'replan_task_with_plans' && r.calls[0].dry && r.calls[0].ok, JSON.stringify(r.calls));
    ok(name + ': warning shown before saving: distributor 1 by name, reason "more days"', !!r.dl && r.dl.text.includes(name1) && /mehr Tage/.test(r.dl.text), r.dl && r.dl.text);
    ok(name + ': distributor 2 (enough dates) is not in the warning', !!r.dl && !r.dl.text.includes((F.tables.workers.find(w => w.id === W2) || {}).name));
    ok(name + ': dry run changed nothing in the database', PG.snap(TID) === before);
    await shot('warning');
    await pg.setViewportSize({ width:375, height:812 }); await sleep(600); await shot('warning-phone');
    const fit = await pg.evaluate(() => [...document.querySelectorAll('[data-y], [data-n]')].map(b => { const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && (top === b || b.contains(top)); }));
    ok(name + ': warning usable on a phone (375 px): both buttons fully visible and on top', fit.length === 2 && fit.every(Boolean), JSON.stringify(fit));
    await pg.setViewportSize({ width:1440, height:900 }); await sleep(600);

    // ---- 4. cancel ----
    let n0 = rpcs.length;
    await pg.evaluate(() => document.querySelector('[data-n]').click()); await sleep(1500);
    ok(name + ': "cancel": no real call, database unchanged, save button usable again', rpcs.length === n0 && PG.snap(TID) === before && await pg.evaluate(() => !document.getElementById('cSave').disabled));

    // ---- 5. confirm while a shift starts in the meantime ----
    r = await saveAndWaitDialog();
    PG.q(`insert into routes(id, worker_id, task_id, plan_id, company_id) values ('30000000-0000-4000-8000-0000000000e2', '${WID.get(W2)}', '${TID}', '${ids0[1]}', '${F.CO}')`);
    const live = PG.snap(TID); n0 = rpcs.length;
    await pg.evaluate(() => document.querySelector('[data-y]').click());
    let msg = await errShown();
    ok(name + ': shift started before confirming: server refuses, admin sees why', rpcs.slice(n0).some(c => !c.dry && !c.ok && /replan_live/.test(c.error)) && /unterwegs/.test(msg || ''), msg);
    ok(name + ': refused: old routes, acceptance, sessions unchanged', PG.snap(TID) === live && PG.q(`select string_agg(id::text, ',' order by idx) from task_plans where task_id='${TID}'`) === ids0.join(','));
    PG.q(`delete from routes where id='30000000-0000-4000-8000-0000000000e2'`); await clearErr();
    ok(name + ': state back to before the attempt', PG.snap(TID) === before);

    // ---- 6. failure in the middle of the transaction ----
    r = await saveAndWaitDialog(); n0 = rpcs.length;
    ok(name + ': (dry run before the failure test still warns)', !!r.dl);
    // the failure is armed after the warning: it hits the real save, after the order row was already updated
    PG.q(`create function _e2e_fail() returns trigger language plpgsql as $f$ begin if new.idx >= 0 and current_setting('flyermap.replan', true) = '1' then raise exception 'e2e_injected_failure'; end if; return new; end $f$;
          create trigger e2e_fail before update on task_plans for each row execute function _e2e_fail();`);
    await pg.evaluate(() => document.querySelector('[data-y]').click());
    msg = await errShown();
    PG.q(`drop trigger e2e_fail on task_plans; drop function _e2e_fail();`);
    ok(name + ': failure after the order row was already changed: error shown', rpcs.slice(n0).some(c => !c.dry && !c.ok && /e2e_injected_failure/.test(c.error)) && !!msg, msg);
    ok(name + ': failure: everything rolled back (order, routes, acceptance, assignments, sessions, archive, history)', PG.snap(TID) === before);
    await clearErr();

    // ---- 7. confirm -> saved ----
    const hist0 = +PG.q(`select count(*) from tasks_history`), notif0 = posts.filter(p => p.tbl === 'notifications').length;
    r = await saveAndWaitDialog(); n0 = rpcs.length;
    await pg.evaluate(() => document.querySelector('[data-y]').click());
    const done = await until(() => document.querySelector('#tCustomerExport') !== null && !document.getElementById('cSave'), 60000);
    const after = JSON.parse(fromDb(PG.q(`select jsonb_agg(to_jsonb(p) order by idx) from task_plans p where task_id='${TID}'`)));
    ok(name + ': confirmed: one real call succeeded, order view shown again', !!done && rpcs.slice(n0).filter(c => !c.dry).length === 1 && rpcs.slice(n0).every(c => c.ok));
    ok(name + ': routes keep their ids (same distributors)', after.map(p => p.id).join() === ids0.join(), after.map(p => p.id).join());
    ok(name + ': distributor 1: acceptance reset as announced (offered, no dates)', after[0].worker_id === W1 && after[0].status === 'offered' && after[0].work_dates.length === 0 && after[0].accepted_at == null, JSON.stringify({ s:after[0].status, d:after[0].work_dates }));
    ok(name + ': distributor 2: acceptance, dates and terms kept', after[1].worker_id === W2 && after[1].status === 'accepted' && after[1].work_dates.length >= 1 && after[1].work_dates.length === Math.max(1, after[1].days.length) && after[1].committed_terms === 'v1');
    ok(name + ': walked session still linked to distributor 1\'s route', PG.q(`select plan_id from routes where id='30000000-0000-4000-8000-0000000000e1'`) === ids0[0]);
    ok(name + ': order history not lost (tasks_history not reduced)', +PG.q(`select count(*) from tasks_history`) >= hist0);
    ok(name + ': assignments unchanged', PG.q(`select string_agg(worker_id::text, ',' order by worker_id) from task_workers where task_id='${TID}'`) === [WID.get(W1), WID.get(W2)].sort().join(','));
    ok(name + ': browser shows the saved state (in-memory copy follows the database)', DB.task_plans.filter(p => p.task_id === TID).map(p => p.status).join() === 'offered,accepted');
    ok(name + ': no delete / separate route writes (old way not used)', !deletes.some(d => d.tbl === 'task_plans' || d.tbl === 'task_workers') && !posts.some(p => p.tbl === 'task_plans') && !patches.some(p => p.tbl === 'tasks'), JSON.stringify(deletes.concat(patches).slice(0, 3)));
    ok(name + ': distributors notified once each (test environment only)', posts.filter(p => p.tbl === 'notifications').length - notif0 === 2);
    await shot('saved');
    ok(name + ': no browser JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    ok(name + ': no request left the test environment', blocked.length === 0, [...new Set(blocked)].join(','));
    await ctx.close();
  }
  try{
    PG.setup();
    await budgetFlow('Weidenberg', 49.942445, 11.729003);
  }catch(e){ ok('test run completed without an exception', false, e.stack.split('\n').slice(0, 4).join(' ')); }
  fs.writeFileSync(path.join(OUT, 'e2e-replan-results.json'), JSON.stringify(results, null, 1));
  console.log('\n' + (fail ? fail + ' FAILED' : 'all ok'));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
