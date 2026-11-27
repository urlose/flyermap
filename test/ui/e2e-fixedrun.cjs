// E2E (27.11.2026): new order with a FIXED print run in Löhne in a real Chromium – the street choice by walking distance, the box
// "Feste Auflage" with ordered/doable, and the delivery radius circle with its label "Verteilradius ≈ … km (Luftlinie)" on the map,
// in the wizard and after saving in the order view.
// REAL: the app build (worker/www), the planner, the Zensus files, the map squares of Löhne (test/fixtures/loehne-2026-11-27.json.gz,
// served where the app loads its own squares). SYNTHETIC: Supabase (fixtures.cjs), geocoder names, background map tiles.
// Run: (cd worker && npm ci && node build.mjs) && node test/ui/e2e-fixedrun.cjs [outDir]      (CHROME=/path/to/chrome optional)
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { chromium } = require('playwright');
const F = require('./fixtures.cjs');
const ROOT = path.join(__dirname, '../../worker/www'), ZEN = path.join(__dirname, '../../admin/zensus/'), OUT = process.argv[2] || path.join(__dirname, 'out-e2e-fixedrun');
fs.mkdirSync(OUT, { recursive:true });
const TILES = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../fixtures/loehne-2026-11-27.json.gz')))).tiles;
const START = [52.206232, 8.699767];
const types = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.png':'image/png', '.woff2':'font/woff2', '.json':'application/json', '.svg':'image/svg+xml', '.mp4':'video/mp4' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  fs.readFile(f, (e, b) => { if(e){ s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type':types[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); });
const filt = (rows, sp) => { let r = rows; for(const [k, v] of sp){ if(['select', 'order', 'limit', 'offset', 'columns'].includes(k)) continue;
  const m = v.match(/^(not\.)?(eq|neq|in|is|gte|lte|gt|lt)\.(.*)$/); if(!m) continue; const [, not, op, val] = m;
  r = r.filter(x => { const a = x[k]; let ok; if(op === 'eq') ok = String(a) === val; else if(op === 'neq') ok = String(a) !== val; else if(op === 'is') ok = val === 'null' ? a == null : String(a) === val;
    else if(op === 'in') ok = val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(a)); else ok = op === 'gte' ? a >= val : op === 'lte' ? a <= val : op === 'gt' ? a > val : a < val; return not ? !ok : ok; }); }
  return r; };
let fail = 0; const results = [];
const ok = (name, c, info) => { results.push({ name, ok:!!c, info }); console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null && info !== '' ? '  ' + info : '')); if(!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => srv.listen(4521, r));
  const b = await chromium.launch(process.env.CHROME ? { executablePath:process.env.CHROME, args:['--no-sandbox'] } : {});
  const TILE = fs.readFileSync(path.join(__dirname, 'tile.png'));
  const DB = { tasks:F.tables.tasks.map(t => ({ ...t })), task_plans:F.tables.task_plans.map(p => ({ ...p })), routes:F.tables.routes.map(r => ({ ...r })), task_workers:F.tables.task_workers.map(r => ({ ...r })) };
  const errors = [], blocked = [], served = new Set();
  const ctx = await b.newContext({ viewport:{ width:1440, height:900 } });
  await ctx.route(/.*/, async route => {
    const rq = route.request(), u = new URL(rq.url());
    if(u.hostname === 'localhost') return route.continue();
    if(/supabase\.co$/.test(u.hostname)){
      const single = (rq.headers()['accept'] || '').includes('vnd.pgrst.object');
      if(u.pathname.includes('/storage/v1/object/public/tiles/v4/')){ const k = u.pathname.split('/').pop(); if(TILES[k]){ served.add(k); return route.fulfill({ status:200, body:Buffer.from(TILES[k], 'base64'), headers:{ 'access-control-allow-origin':'*', 'content-type':'application/gzip' } }); } return route.fulfill({ status:404, body:'' }); }
      if(u.pathname.startsWith('/storage/')) return route.fulfill({ status:404, body:'' });
      if(u.pathname.startsWith('/auth/')) return route.fulfill({ json:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } });
      if(u.pathname.startsWith('/functions/')) return route.fulfill({ json:{ ok:true } });
      const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/); if(!m) return route.fulfill({ json:null });
      if(m[1]){
        if(m[2] === 'create_task_with_plans'){ const input = rq.postDataJSON();
          const task = { id:'tnew', status:'open', created_at:new Date().toISOString(), company_id:F.CO, task_workers:[], ...input.p_task };
          const rows = input.p_plans.map((p, i) => ({ id:'pnew-' + i, status:'open', work_dates:[], skipped:[], ...p, task_id:'tnew' }));
          DB.tasks.push(task); DB.task_plans.push(...rows); return route.fulfill({ status:200, json:{ task, plans:rows } }); }
        return route.fulfill({ json:m[2] in F.rpc ? F.rpc[m[2]] : null });
      }
      const tbl = m[2], method = rq.method();
      if(method !== 'GET') return route.fulfill({ status:201, json:[] });
      let rows = filt(DB[tbl] || F.tables[tbl] || [], u.searchParams);
      if(tbl === 'tasks') rows = rows.map(t => ({ ...t, task_workers:DB.task_workers.filter(z => z.task_id === t.id) }));
      return route.fulfill({ status:200, headers:{ 'content-range':`0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'content-type':'application/json' }, body:JSON.stringify(single ? (rows[0] || null) : rows) });
    }
    if(/urlose\.github\.io$/.test(u.hostname) && u.pathname.includes('/zensus/')){ const f = ZEN + u.pathname.split('/').pop(); return fs.existsSync(f) ? route.fulfill({ status:200, body:fs.readFileSync(f), headers:{ 'access-control-allow-origin':'*' } }) : route.fulfill({ status:404, body:'' }); }
    if(/photon\.komoot\.io$/.test(u.hostname)) return route.fulfill({ status:200, json:{ features:u.pathname.includes('reverse') ? [{ properties:{ city:'Löhne', district:'Obernbeck' }, geometry:{ type:'Point', coordinates:[START[1], START[0]] } }] : [] }, headers:{ 'access-control-allow-origin':'*' } });
    if(/tile\.openstreetmap|openstreetmap\.de|basemaps|cartocdn/.test(u.hostname)) return route.fulfill({ status:200, contentType:'image/png', body:TILE });
    if(/overpass|maps\.mail\.ru/.test(u.hostname)){ blocked.push(u.hostname); return route.fulfill({ status:200, json:{ elements:[] }, headers:{ 'access-control-allow-origin':'*' } }); }
    blocked.push(u.hostname); return route.abort();
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push('pageerror: ' + e.message)); pg.on('console', m => { if(m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const sess = { access_token:'x', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now() / 1000) + 3600, refresh_token:'y', user:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } };
  await pg.addInitScript(s => { localStorage.setItem('fm-admin-auth', JSON.stringify(s)); localStorage.setItem('CapacitorStorage.role', '"admin"'); localStorage.setItem('CapacitorStorage.theme', '"dark"'); localStorage.setItem('CapacitorStorage.lang', '"de"'); }, sess);
  await pg.clock.install({ time:new Date(2026, 10, 27, 12) });   // Friday; deadline Saturday = one working day
  await pg.goto('http://localhost:4521/#new', { waitUntil:'load' }); await sleep(2500);
  const until = async (fn, ms = 120000, arg) => { const t0 = Date.now(); while(Date.now() - t0 < ms){ try{ const v = await pg.evaluate(fn, arg); if(v) return v; }catch{} await sleep(500); } return null; };
  await pg.waitForSelector('#fullMap');
  await pg.evaluate(([la, lo]) => { const m = document.getElementById('fullMap')._map; m.setView([la, lo], 14, { animate:false }); m.fire('click', { latlng:{ lat:la, lng:lo } });
    const t = document.getElementById('cTitle'); if(t) t.value = 'Löhne feste Auflage'; }, START);
  await sleep(1500);
  await pg.evaluate(() => { const bt = document.getElementById('cNext'); if(bt && !bt.disabled) bt.click(); });
  ok('order information step', !!await until(() => !!document.getElementById('cHours'), 60000));
  // fixed print run: no "maximum flyers for the working time"; deadline Monday = Saturday + Monday, 2 people × 2 days × 6,5 h = 26 h
  await pg.evaluate(() => { const c = document.getElementById('cBudget'); if(c && c.checked){ c.checked = false; c.dispatchEvent(new Event('change')); } });
  await sleep(800);
  await pg.evaluate(() => { for(const [id, v] of [['cDeadline', '2026-11-30'], ['cHours', '6,5'], ['cQuota', '3000']]){ const i = document.getElementById(id); if(i){ i.value = v; i.dispatchEvent(new Event('change')); } } });
  await sleep(800);
  const fly = await until(() => !!document.getElementById('cFly'), 5000);
  if(!fly){ await pg.evaluate(() => document.querySelector('[data-step="3"]')?.click()); await until(() => !!document.getElementById('cFly'), 20000); }
  await pg.evaluate(() => { const i = document.getElementById('cFly'); i.value = '6155'; i.dispatchEvent(new Event('change')); });
  ok('no nearby places added by the app', !!await until(() => !document.querySelector('.cov-side') && !!document.getElementById('fixResult'), 240000));
  const t0 = Date.now();
  const box = await until(() => { const r = document.getElementById('fixResult'); return r ? { text:r.innerText, warn:r.className } : null; }, 240000);
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  ok('box "Feste Auflage" with the ordered number', !!box && /6\.155/.test(box.text), box && box.text);
  ok('fits in the 26 h (no warning)', !!box && !/warnbox/.test(box.warn), box && box.text);
  ok('box names the team hours', !!box && /Std\./.test(box.text), box && box.text);
  const label = await until(() => { const e = [...document.querySelectorAll('.reach-tip')].find(x => /Verteilradius/.test(x.textContent)); return e ? e.textContent : null; }, 20000);
  ok('radius label on the map', !!label && /^Verteilradius ≈ \d+,\d km \(Luftlinie\)$/.test(label), label);
  ok('dashed radius circle drawn', await pg.evaluate(() => !!document.querySelector('path.reach-circle')));
  const inView = await pg.evaluate(() => { const e = document.querySelector('.reach-ctl .reach-tip'); if(!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; });
  ok('label visible in the map view', inView);
  await pg.screenshot({ path:path.join(OUT, 'wizard-desktop.png') });
  await pg.setViewportSize({ width:390, height:844 }); await sleep(1200);
  await pg.screenshot({ path:path.join(OUT, 'wizard-phone.png') });
  await pg.setViewportSize({ width:1440, height:900 }); await sleep(800);
  // save, open the order: the radius is a layer there
  await pg.evaluate(() => document.querySelector('[data-step="5"]')?.click());
  await pg.waitForSelector('#cSave', { timeout:30000 }); await pg.locator('#cSave').click();
  ok('order saved and opened', !!await until(() => !!document.querySelector('#tCustomerExport'), 60000));
  const saved = DB.tasks.find(t => t.id === 'tnew');
  ok('the order keeps the ordered print run 6155', saved && saved.flyers === 6155, saved && saved.flyers);
  await sleep(1500);
  ok('order map shows the delivery radius', await pg.evaluate(() => !!document.querySelector('#tMap path.reach-circle') && [...document.querySelectorAll('#tMap .reach-tip')].some(e => /Verteilradius ≈ \d+,\d km \(Luftlinie\)/.test(e.textContent))));
  await pg.screenshot({ path:path.join(OUT, 'order-view.png') });
  await pg.locator('#tBig').click(); await sleep(2500);
  const chip = await pg.evaluate(() => [...document.querySelectorAll('#rvTools [data-ly]')].map(e => e.textContent.trim()));
  ok('big map: switch "Verteilradius"', chip.includes('Verteilradius'), JSON.stringify(chip));
  await pg.screenshot({ path:path.join(OUT, 'order-big-map.png') });
  ok('no browser JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  ok('only the recorded Löhne squares were used (no Overpass)', blocked.length === 0 && served.size > 0, 'squares ' + served.size + (blocked.length ? ' blocked ' + [...new Set(blocked)].join(',') : ''));
  console.log('planning in the browser: ' + secs + ' s');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, secs }, null, 1));
  console.log('\n' + (fail ? fail + ' FAILED' : 'all ok'));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
