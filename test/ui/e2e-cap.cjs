// E2E smaller print run (18.11.2026), built on the harness of e2e-timefirst.cjs.
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
const ROOT = path.join(__dirname, '../../worker/www'), ZEN = path.join(__dirname, '../../admin/zensus/'), OUT = process.argv[2] || path.join(__dirname, 'out-e2e-cap');
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
  await new Promise(r => srv.listen(4524, r));
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
        if(m[1]){
          if(m[2] === 'create_task_with_plans'){
            const input = rq.postDataJSON();
            posts.push({tbl:'atomic',body:input});
            const task={ id:'tnew',status:'open',created_at:new Date().toISOString(),
              company_id:F.CO,task_workers:[],...input.p_task };
            const rows=input.p_plans.map((p,i)=>({id:'pnew-1-'+i,status:'open',
              work_dates:[],skipped:[],...p,task_id:'tnew'}));
            DB.tasks.push(task); DB.task_plans.push(...rows);
            for(const p of rows)if(p.worker_id)DB.task_workers.push({task_id:'tnew',worker_id:p.worker_id});
            return route.fulfill({status:200,json:{task,plans:rows}});
          }
          if(m[2] === 'replan_task_with_plans') return route.fulfill({ status:404, json:{ code:'PGRST202', message:'Could not find the function public.replan_task_with_plans in the schema cache' } });   // migration not applied yet (as in production today): the admin panel must use the previous way
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
    await pg.goto('http://localhost:4524/#new', { waitUntil:'load' }); await sleep(3000);
    const until = async (fn, ms = 90000, arg) => { const t0 = Date.now(); while(Date.now() - t0 < ms){ try{ const v = await pg.evaluate(fn, arg); if(v) return v; }catch{} await sleep(400); } return null; };
    const budget = () => pg.evaluate(() => { const bx = document.querySelector('.budget-box'); if(!bx) return null; const nums = [...bx.querySelectorAll('.cov-n b')].map(e => e.textContent), rows = [...bx.querySelectorAll('.route-row')].map(e => e.innerText.replace(/\n+/g, ' | ')); return { nums, rows, text:bx.innerText }; });
    const stable = async (ms = 4000, max = 150000) => { let last = null, since = Date.now(); const t0 = Date.now(); while(Date.now() - t0 < max){ const h = JSON.stringify(await budget()); if(h === last && h !== 'null'){ if(Date.now() - since > ms) return true; } else { last = h; since = Date.now(); } await sleep(500); } return false; };
    const shot = n => pg.screenshot({ path:path.join(OUT, name.toLowerCase() + '-' + n + '.png') });

    // ---- New time-first order: hours entered in Auftragsinformationen ----
    await pg.waitForSelector('#fullMap');
    await pg.evaluate(([la,lo])=>{
      const m=document.getElementById('fullMap')._map;m.setView([la,lo],14,{animate:false});
      m.fire('click',{latlng:{lat:la,lng:lo}});
      const t=document.getElementById('cTitle');if(t)t.value='E2E Time First '+la;
    },[lat,lng]);
    await pg.evaluate(()=>{const b=document.getElementById('cNext');if(b&&!b.disabled)b.click();});
    ok(name+': order information has a total time input',
      !!await until(()=>!!document.getElementById('cBudH'),90000));
    const cfg=await pg.evaluate(()=>({
      n:(document.getElementById('vN')||{}).textContent,
      strategy:(document.getElementById('cBudgetStrategy')||{}).value,
      quota:(document.getElementById('cQuota')||{}).value,
      on:(document.getElementById('cBudget')||{}).checked
    }));
    ok(name+': time-first strategy default, 2 employees, 2500 m/30 min',
      cfg.strategy==='near-first'&&cfg.n==='2'&&cfg.quota==='2500'&&cfg.on===true,
      JSON.stringify(cfg));
    ok(name+': new orders: three optional maxima – drive time (15 min), hours, flyers; no km circle',
      await pg.evaluate(()=>+document.getElementById('cDriveMin')?.value===15 && document.getElementById('cMaxFly')?.value==='' && !document.getElementById('cCircle')));
    await pg.locator('#cBudgetMode').selectOption('drive');
    await pg.evaluate(()=>{ const r=document.getElementById('cDriveMin'); r.value=12; r.dispatchEvent(new Event('change')); });
    await pg.evaluate(H=>{
      const h=document.getElementById('cBudH');h.value=H;h.dispatchEvent(new Event('change'));
    }, +process.env.CAP_H||24);
    await pg.evaluate(()=>{const b=document.getElementById('cNext');if(b&&!b.disabled)b.click();});
    ok(name+': no flyer quantity as input on route step',
      !!await until(()=>!!document.querySelector('.budget-box'),240000) &&
      await pg.evaluate(()=>!document.getElementById('cFly')));
    await stable(5000,300000);
    const pg2 = pg;
    const table = () => pg.evaluate(() => [...document.querySelectorAll('#capTable tbody tr')].map(r => [...r.children].map(c => c.innerText.trim())));
    const full = await budget();
    const fullN = await pg.evaluate(() => +((document.getElementById('cCap') || {}).max || 0));
    ok(name+': full plan first: the possible maximum is shown', fullN > 0 && /möglich sind ≈/.test(await pg.evaluate(() => document.getElementById('capBox').innerText)), 'max ' + fullN);
    const fullTime = full && full.nums[1];
    await pg.evaluate(() => document.querySelector('.cov-sheet, .sheet, #cWz')?.scrollTo?.(0, 0));
    await shot('1-full');
    const target = Math.round(fullN * (+process.env.CAP_PCT || 0.6) / 10) * 10;
    await pg.evaluate(v => { const i = document.getElementById('cCap'); i.value = v; i.dispatchEvent(new Event('change')); }, target);
    ok(name+': table per place appears after entering a smaller print run', !!await until(() => !!document.getElementById('capTable'), 300000));
    await stable(5000, 300000);
    const rows = await table();
    const res = await pg.evaluate(() => { const c = window.__lastCap || null; return c; });
    const sum = await pg.evaluate(() => +document.getElementById('capSum').innerText.replace(/\D/g, ''));
    console.log('TARGET', target, 'FULL', fullN, 'PLANNED', sum); rows.forEach(r => console.log('ROW', r.join(' | '))); console.log('KEEP', JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('#capTable tbody tr')].map(r => r.dataset.cap + '=' + r.dataset.keep))));
    console.log('TIME', JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('#capTable tfoot tr')].map(r => r.innerText.replace(/\s+/g, ' ')))));
    ok(name+': planned total within the print run', sum > 0 && sum <= target, sum + ' > ' + target);
    ok(name+': several places in the table, main town first', rows.length >= 3 && /Hauptort|Weidenberg/.test(rows[0][0]), JSON.stringify(rows.slice(0, 2)));
    const num = s => +String(s).replace(/\(.*/, '').replace(/\D/g, '');
    ok(name+': main town keeps its flyers while the villages can give', num(rows[0][2]) === num(rows[0][1]) || rows.slice(1).every(r => num(r[2]) === 0), JSON.stringify(rows[0]));
    const vill = rows.slice(1).map(r => ({ full:num(r[1]), keep:num(r[2]) }));
    const cutV = vill.filter(v => v.keep < v.full);
    ok(name+': the village with the most flyers is cut first', !cutV.length || cutV.some(v => v.full === Math.max(...vill.map(x => x.full))));
    ok(name+': presence kept in every selected place (where possible)', vill.every(v => v.keep > 0) || sum >= target - 50, JSON.stringify(vill));
    ok(name+': streets taken out are drawn grey on the map', await pg.evaluate(() => document.querySelectorAll('path.dropped-street').length > 0));
    const radii = await pg.evaluate(() => { const r = []; document.getElementById('fullMap')._map.eachLayer(l => { if(l.getRadius) r.push(Math.round(l.getRadius())); }); return r; });
    ok(name+': no circle, the reached area stays drawn', radii.length === 0 && await pg.evaluate(() => document.querySelectorAll('path.drive-full').length === 1), JSON.stringify(radii));
    await shot('2-cut');
    await pg.setViewportSize({ width:375, height:812 }); await pg.evaluate(() => document.getElementById('capBox').scrollIntoView({ block:'start' })); await sleep(700); await shot('3-cut-phone');
    ok(name+': input and table fit a phone', await pg.evaluate(() => ['cCap', 'capTable'].every(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })));
    await pg.setViewportSize({ width:1440, height:900 });
    // save: the print run goes with the order
    await pg.evaluate(()=>{const b=document.getElementById('cNext');if(b&&!b.disabled)b.click();});
    await until(()=>document.querySelectorAll('select[data-wsel]').length>=1,30000);
    await pg.evaluate(()=>{document.querySelectorAll('select[data-wsel]').forEach((s,i)=>{ const o=[...s.options].map(o=>o.value).filter(Boolean); s.value=o[i]||o[0]; s.dispatchEvent(new Event('change')); });});
    await pg.evaluate(()=>{const b=document.getElementById('cNext');if(b&&!b.disabled)b.click();});
    await until(()=>!!document.getElementById('cSave'),30000);
    await pg.evaluate(()=>document.getElementById('cSave').click());
    await until(()=>document.querySelector('#tCustomerExport')!==null,60000);
    const saved = DB.task_plans.filter(p=>p.task_id==='tnew'), tk = DB.tasks.find(t=>t.id==='tnew');
    ok(name+': saved order: print run stored, flyers = planned total', saved.length>0 && saved.every(r=>r.days?.[0]?.flyer_cap===target) && tk.flyers<=target && tk.flyers===saved.reduce((a,r)=>a+r.mailboxes,0), JSON.stringify({ flyers:tk && tk.flyers, cap:saved[0]?.days?.[0]?.flyer_cap }));
    await pg.evaluate(()=>document.getElementById('tEdit').click());
    await pg.waitForSelector('#eReplan'); await pg.evaluate(()=>document.getElementById('eReplan').click());
    ok(name+': reopening keeps the print run', !!await until(v => +(document.getElementById('cCap') || {}).value === v, 300000, target));
    ok(name+': no browser JavaScript errors',errors.length===0,errors.slice(0,3).join(' | '));
    ok(name+': no request left the test environment',blocked.length===0,[...new Set(blocked)].join(','));
    await ctx.close();
  }
  try{
    await budgetFlow('Weidenberg', 49.942445, 11.729003);
  }catch(e){ ok('test run completed without an exception', false, e.stack.split('\n').slice(0, 4).join(' ')); }
  fs.writeFileSync(path.join(OUT, 'e2e-cap-results.json'), JSON.stringify(results, null, 1));
  console.log('\n' + (fail ? fail + ' FAILED' : 'all ok'));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
