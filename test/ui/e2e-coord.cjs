// E2E of the role "Koordinator" in the admin panel (fake Supabase as in e2e-timefirst.cjs, synthetic data).
// The database side (what a coordinator may write) is tested in test/sql/coordinator_role.sh; here: what the panel shows.
// Run: (cd worker && npm ci && node build.mjs) && node test/ui/e2e-coord.cjs [outDir]     (CHROME=/path/to/chrome optional)
let ROLE = 'coordinator';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const F = require('./fixtures.cjs');
const ROOT = path.join(__dirname, '../../worker/www'), ZEN = path.join(__dirname, '../../admin/zensus/'), OUT = process.argv[2] || path.join(__dirname, 'out-e2e-coord');
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
  await new Promise(r => srv.listen(4523, r));
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
          const args = rq.postDataJSON() || {}; rpcs.push({ fn:m[2], args });
          if(m[2] === 'my_company_info') return route.fulfill({ json:{ ...F.rpc.my_company_info, role:ROLE, display_name:ROLE === 'coordinator' ? 'Kemal' : 'Cem', ref_code:ROLE === 'coordinator' ? 'KEMAL234' : null } });
          if(m[2] === 'my_ref_code') return route.fulfill({ json:ROLE === 'coordinator' ? 'KEMAL234' : 'CEMCEM23' });
          if(m[2] === 'coord_assign_plan'){ const p = DB.task_plans.find(x => x.id === args.p_plan); if(p){ p.worker_id = args.p_worker; p.status = 'offered'; } return route.fulfill({ json:args.p_plan }); }
          if(m[2] === 'set_admin_role'){ const a = DB.admins.find(x => x.user_id === args.p_user); if(a) a.role = args.p_role; return route.fulfill({ json:null }); }
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
    await pg.goto('http://localhost:4523/#tasks', { waitUntil:'load' }); await sleep(3000);
    const until = async (fn, ms = 90000, arg) => { const t0 = Date.now(); while(Date.now() - t0 < ms){ try{ const v = await pg.evaluate(fn, arg); if(v) return v; }catch{} await sleep(400); } return null; };
    const budget = () => pg.evaluate(() => { const bx = document.querySelector('.budget-box'); if(!bx) return null; const nums = [...bx.querySelectorAll('.cov-n b')].map(e => e.textContent), rows = [...bx.querySelectorAll('.route-row')].map(e => e.innerText.replace(/\n+/g, ' | ')); return { nums, rows, text:bx.innerText }; });
    const stable = async (ms = 4000, max = 150000) => { let last = null, since = Date.now(); const t0 = Date.now(); while(Date.now() - t0 < max){ const h = JSON.stringify(await budget()); if(h === last && h !== 'null'){ if(Date.now() - since > ms) return true; } else { last = h; since = Date.now(); } await sleep(500); } return false; };
    const shot = n => pg.screenshot({ path:path.join(OUT, name.toLowerCase() + '-' + n + '.png') });

    const vis = sel => pg.evaluate(s => [...document.querySelectorAll(s)].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }), sel);
    const go = async (hash, sel) => { await pg.goto('http://localhost:4523/?r=' + Date.now() + '#' + hash, { waitUntil:'load' }); if(sel) await until(s => !!document.querySelector(s), 30000, sel); await sleep(1200); };
    DB.admins = [{ user_id:'u1', display_name:'Kemal', phone:'+4915100000002', role:'coordinator', created_at:'2026-11-17' }, { user_id:'a2', display_name:'Cem', phone:'+4915100000001', role:'admin', created_at:'2026-11-01' }];
    DB.workers = F.tables.workers.map(w => ({ ...w, referred_by:w.id === 'w5' ? 'u1' : null }));

    // ---- orders ----
    await go('tasks', '.tcard, table, .tasks');
    ok(name + ': coordinator: no "create order" button', !await vis('#tNew') && !await vis('#fab') && !await vis('#create'));
    await go('task/t2', '#tNav');
    ok(name + ': order view opens', await vis('#tNav'));
    ok(name + ': coordinator: no edit / done / delete / merge on the order', !await vis('#tEdit') && !await vis('#tEdit2') && !await vis('#tDone') && !await vis('#tDel') && !await vis('#tCancel'));
    ok(name + ': customer export still offered', await vis('#tCustomerExport'));
    ok(name + ': free route has a distributor choice', await vis('select[data-plan="p4"]'));
    ok(name + ': taken route: no choice, no swap', !await vis('select[data-plan="p3"]') && !await vis('[data-swap]'));
    const n0 = rpcs.length, p0 = patches.length;
    await pg.evaluate(() => { const s = document.querySelector('select[data-plan="p4"]'); s.value = 'w5'; s.dispatchEvent(new Event('change')); });
    await until(() => true, 1000); await sleep(1500);
    const call = rpcs.slice(n0).find(c => c.fn === 'coord_assign_plan');
    ok(name + ': assignment goes through coord_assign_plan with the notification text', !!call && call.args.p_plan === 'p4' && call.args.p_worker === 'w5' && /t2|Weidenberg|Bayreuth|Auftrag/i.test(call.args.p_title || ''), JSON.stringify(call));
    ok(name + ': no direct table writes for the assignment', patches.slice(p0).length === 0 && !posts.some(p => p.tbl === 'task_workers' || p.tbl === 'notifications'), JSON.stringify(patches.slice(p0)));
    await shot('order');

    // ---- people ----
    await go('people', '#invBox');
    await pg.evaluate(() => { const d = document.getElementById('invBox'); if(d) d.open = true; }); await sleep(800);
    ok(name + ': personal link card visible with the own code', await vis('#myRefCard') && /\?neu=KEMAL234$/.test(await pg.evaluate(() => (document.getElementById('myRefLink') || {}).value || '')));
    ok(name + ': firm link, "new login account" and the login links of the distributors hidden', !await vis('#invLink') && !await vis('#wNewLink') && !await vis('#linkBox'));
    await shot('people');
    await pg.setViewportSize({ width:375, height:812 }); await go('people', '#invBox'); await pg.evaluate(() => { const d = document.getElementById('invBox'); if(d) d.open = true; }); await sleep(800);
    await pg.evaluate(() => document.getElementById('myRefCard')?.scrollIntoView({ block:'center' })); await sleep(500); await shot('people-phone');
    ok(name + ': link card visible and fits a phone (375 px)', await vis('#myRefCard') && await pg.evaluate(() => { const r = document.getElementById('myRefCard').getBoundingClientRect(); return r.width > 200 && r.left >= 0 && r.right <= innerWidth; }));
    await pg.setViewportSize({ width:1440, height:900 });

    // ---- distributor profile ----
    await go('worker/w5', '#wNav');
    ok(name + ': profile shows who invited the distributor', /Geworben von Kemal/.test(await pg.evaluate(() => document.body.innerText)));
    ok(name + ': coordinator: no save / delete on the profile', !await vis('#wsave') && !await vis('#wdel'));
    await go('worker/w1', '#wNav');
    ok(name + ': no "invited by" line without a referrer', !/Geworben von/.test(await pg.evaluate(() => document.body.innerText)));

    // ---- settings ----
    await go('settings', '#setNav');
    ok(name + ': coordinator: no firm edit, contract save, bot, admin invitation, demo', !await vis('#fcEdit') && !await vis('#ctSave') && !await vis('#botCard') && !await vis('#tInv') && !await vis('#tDemo'));
    ok(name + ': coordinator: no admin list with role switch', !await vis('#adminsCard'));
    ok(name + ': theme, language and logout stay', await vis('#tOut'));

    // ---- help reports ----
    await go('help', null); await sleep(1000);
    ok(name + ': help reports can be answered', await pg.evaluate(() => !!document.querySelector('[data-close]') || /Hilfe/.test(document.body.innerText)));

    // ---- full admin: everything as before ----
    ROLE = 'admin';   // the signed-in user u1 is now the full admin Cem; Kemal is another account
    DB.admins = [{ user_id:'u1', display_name:'Cem', phone:'+4915100000001', role:'admin', created_at:'2026-11-01' }, { user_id:'c9', display_name:'Kemal', phone:'+4915100000002', role:'coordinator', created_at:'2026-11-17' }];
    await go('tasks', '.tcard, table, .tasks');
    ok(name + ': admin: create order available again', await vis('#tNew') || await vis('#fab'));
    await go('people', '#invBox'); await pg.evaluate(() => { const d = document.getElementById('invBox'); if(d) d.open = true; }); await sleep(800);
    ok(name + ': admin: firm link and login links as before, no personal card', await vis('#invLink') && await vis('#linkBox') && !await vis('#myRefCard'));
    await go('task/t2', '#tNav');
    ok(name + ': admin: edit available', await vis('#tEdit') || await vis('#tEdit2'));
    await go('settings', '#setNav');
    ok(name + ': admin: list of admins and coordinators with role switch', await vis('#adminsCard') && /Kemal/.test(await pg.evaluate(() => document.getElementById('adminsCard').innerText)) && await vis('[data-role="c9"][data-to="admin"]'));
    await pg.evaluate(() => document.getElementById('tInv').click()); await until(() => !!document.getElementById('invRole'), 10000);
    ok(name + ': admin invitation asks for role and name', await vis('#invRole') && await vis('#invName'));
    await pg.evaluate(() => { document.getElementById('invE').value = '+49 170 1234567'; const r = document.getElementById('invRole'); r.value = 'coordinator'; r.dispatchEvent(new Event('change')); document.getElementById('invName').value = 'Leyla'; document.getElementById('invB').click(); });
    await sleep(1500);
    const inv = posts.find(p => p.tbl === 'admin_phone_invites') || patches.find(p => p.tbl === 'admin_phone_invites');
    ok(name + ': invitation saved with role coordinator and name', !!inv && JSON.stringify(inv.body || inv).includes('coordinator') && JSON.stringify(inv.body || inv).includes('Leyla'), JSON.stringify(inv));
    ok(name + ': no browser JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    ok(name + ': no request left the test environment', blocked.length === 0, [...new Set(blocked)].join(','));
    await ctx.close();
  }
  try{
    await budgetFlow('Coordinator', 49.942445, 11.729003);
  }catch(e){ ok('test run completed without an exception', false, e.stack.split('\n').slice(0, 4).join(' ')); }
  fs.writeFileSync(path.join(OUT, 'e2e-coord-results.json'), JSON.stringify(results, null, 1));
  console.log('\n' + (fail ? fail + ' FAILED' : 'all ok'));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
