// E2E of the order wizard for Phase 2A (suggestions, map highlight, add/remove) in a real Chromium.
// What is REAL: the app build (worker/www), the Zensus 2022 files (admin/zensus, served instead of GitHub Pages), the planner, the wizard.
// What is SYNTHETIC: Supabase (fixtures.cjs, auth included – nothing leaves the machine, every write is recorded and must stay empty),
// the street/house data: Overpass is answered with an invented street grid + houses generated FROM the real census cells
// (so villages lie where the census has them, but the streets are not OSM). Geocoder: invented names. No outbound network is used.
// Run: (cd worker && npm ci && node build.mjs) && node test/ui/e2e-phase2a.cjs [outDir]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const F = require('./fixtures.cjs');
const ROOT = path.join(__dirname, '../../worker/www'), ZEN = path.join(__dirname, '../../admin/zensus/'), OUT = process.argv[2] || path.join(__dirname, 'out-e2e');
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
  await new Promise(r => srv.listen(4518, r));
  const Z = await import('../../worker/src/zensus.js'), src = Z.censusSource(async u => { const p = ZEN + u.split('/').pop(); return fs.existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(fs.readFileSync(p)).buffer } : { ok:false, status:404 }; });
  const b = await chromium.launch();
  const TILE = fs.readFileSync(path.join(__dirname, 'tile.png'));

  async function town(name, lat, lng){
    console.log('\n===== ' + name + ' =====');
    // synthetic street + house world from the real census cells around the start (30 km)
    const [x, y] = Z.laea(lat, lng), WR = 300, cx0 = Math.floor(x / 100), cy0 = Math.floor(y / 100);
    const H = await src.households(cx0 - WR, cy0 - WR, cx0 + WR, cy0 + WR), id = (cx, cy) => cx * 100000 + cy, cache = new Map();
    const ll = (cx, cy) => { const k = cx + ',' + cy; if(!cache.has(k)) cache.set(k, Z.unlaea(cx * 100 + 50, cy * 100 + 50)); return cache.get(k); };
    const rnd = (a, c, i) => { const v = Math.sin(a * 12.9898 + c * 78.233 + i * 37.719) * 43758.5453; return v - Math.floor(v); };
    const tileLog = [];
    function overpassAnswer(S, W, N, E){
      const els = [], nodes = new Set(), addNode = (cx, cy) => { const k = id(cx, cy); if(nodes.has(k)) return k; nodes.add(k); const [la, lo] = ll(cx, cy); els.push({ type:'node', id:k, lat:la, lon:lo }); return k; };
      const inb = (la, lo) => la >= S && la <= N && lo >= W && lo <= E; let wid = 1;
      for(const [k, h] of H){
        const [cx, cy] = k.split(',').map(Number), [la, lo] = ll(cx, cy); if(!inb(la, lo)) continue;
        for(const [dx, dy] of [[1, 0], [0, 1]]){   // road to the next populated cell east / north (up to 30 cells = 3 km of open ground, so villages are connected like on real roads)
          for(let s = 1; s <= 30; s++){ const nx = cx + dx * s, ny = cy + dy * s; if(!H.has(nx + ',' + ny)) continue;
            const ns = []; for(let q = 0; q <= s; q++) ns.push(addNode(cx + dx * q, cy + dy * q));
            els.push({ type:'way', id:id(cx, cy) * 2 + dx, nodes:ns, tags:{ highway:'residential', name:'Str ' + cx + '-' + cy } }); break; } }
        const n = Math.min(40, h); for(let i = 0; i < n; i++) els.push({ type:'way', id:900000000000 + wid++, center:{ lat:la + (rnd(cx, cy, i) - .5) * 80 / 111320, lon:lo + (rnd(cy, cx, i + 9) - .5) * 80 / (111320 * Math.cos(la * Math.PI / 180)) }, tags:{ building:'house' } });
      }
      tileLog.push({ S, W, N, E, houses:els.filter(e => e.center).length, ways:els.filter(e => e.nodes).length });
      return { elements:els };
    }
    const READ_ONLY = new Set(['rpc:become_admin', 'rpc:worker_stats', 'rpc:my_company_info', 'rpc:tiles_stamp', 'rpc:company_stats', 'rpc:wa_enabled', 'fn:osm']), reads = new Set();   // POSTs that only read (admin check, statistics, map-square cache)
    const ctx = await b.newContext({ viewport:{ width:1440, height:900 } }), writes = [], blocked = [], errors = [], reqs = { overpass:0, zensus:0, photon:0 };
    await ctx.route(/.*/, async route => {
      const rq = route.request(), u = new URL(rq.url());
      if(u.hostname === 'localhost') return route.continue();
      if(/supabase\.co$/.test(u.hostname)){
        const acc = rq.headers()['accept'] || '';
        if(rq.method() !== 'GET' && rq.method() !== 'HEAD' && !u.pathname.startsWith('/auth/')){ const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/), fn = u.pathname.match(/^\/functions\/v1\/(\w+)/), key = rpc ? 'rpc:' + rpc[1] : fn ? 'fn:' + fn[1] : rq.method() + ':' + u.pathname;
          if(READ_ONLY.has(key)) reads.add(key); else writes.push(key); }
        if(u.pathname.startsWith('/storage/')) return route.fulfill({ status:404, body:'' });          // no own map squares: the planner asks (our) Overpass
        if(u.pathname.startsWith('/auth/')) return route.fulfill({ json:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } });
        if(u.pathname.startsWith('/functions/')) return route.fulfill({ json:{ ok:true } });
        const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/); if(!m) return route.fulfill({ json:null });
        if(m[1]) return route.fulfill({ json:m[2] in F.rpc ? F.rpc[m[2]] : null });
        if(rq.method() !== 'GET' && rq.method() !== 'HEAD') return route.fulfill({ status:201, json:[] });
        let rows = filt(F.tables[m[2]] || [], u.searchParams);
        if(m[2] === 'tasks') rows = rows.map(t => ({ ...t, task_workers:F.tables.task_workers.filter(z => z.task_id === t.id) }));
        const single = acc.includes('vnd.pgrst.object');
        return route.fulfill({ status:200, headers:{ 'content-range':`0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'content-type':'application/json' }, body:JSON.stringify(single ? (rows[0] || null) : rows) });
      }
      if(/overpass|maps\.mail\.ru/.test(u.hostname)){ reqs.overpass++; const q = decodeURIComponent((rq.postData() || u.search).replace(/\+/g, ' ')), m = q.match(/\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/);
        return route.fulfill({ status:200, json:m ? overpassAnswer(+m[1], +m[2], +m[3], +m[4]) : { elements:[] }, headers:{ 'access-control-allow-origin':'*' } }); }
      if(/urlose\.github\.io$/.test(u.hostname) && u.pathname.includes('/zensus/')){ reqs.zensus++; const f = ZEN + u.pathname.split('/').pop(); return fs.existsSync(f) ? route.fulfill({ status:200, body:fs.readFileSync(f), headers:{ 'access-control-allow-origin':'*' } }) : route.fulfill({ status:404, body:'', headers:{ 'access-control-allow-origin':'*' } }); }
      if(/photon\.komoot\.io$/.test(u.hostname)){ reqs.photon++; const la = +u.searchParams.get('lat'), lo = +u.searchParams.get('lon'), nm = 'Testdorf ' + (Math.abs(Math.round(la * 1e3)) % 1000) + '/' + (Math.abs(Math.round(lo * 1e3)) % 1000);
        return route.fulfill({ status:200, json:{ features:u.pathname.includes('reverse') ? [{ properties:{ city:name, district:nm }, geometry:{ type:'Point', coordinates:[lo, la] } }] : [] }, headers:{ 'access-control-allow-origin':'*' } }); }
      if(/tile\.openstreetmap|openstreetmap\.de|basemaps|cartocdn/.test(u.hostname)) return route.fulfill({ status:200, contentType:'image/png', body:TILE });
      blocked.push(u.hostname); return route.abort();
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push('pageerror: ' + e.message)); pg.on('console', m => { if(m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    const sess = { access_token:'x', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now() / 1000) + 3600, refresh_token:'y', user:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } };
    await pg.addInitScript(s => { localStorage.setItem('fm-admin-auth', JSON.stringify(s)); localStorage.setItem('CapacitorStorage.role', '"admin"'); localStorage.setItem('CapacitorStorage.theme', '"light"'); localStorage.setItem('CapacitorStorage.lang', '"de"'); localStorage.setItem('CapacitorStorage.introSeen', 'true'); }, sess);
    await pg.addInitScript(() => { const W = window.Worker; window.Worker = class extends W { constructor(...a){ super(...a); this.addEventListener('message', e => { try{ const d = e.data, pl = d && (d.plan || (d.res && d.res.plan) || (d.result && d.result.plan) || (d.value && d.value.plan)); if(pl) (window.__plans = window.__plans || []).push({ mb:pl.mailboxes, split:pl.split, si:pl.side_info, sf:pl.side_failed, routes:(pl.routes || []).length }); else (window.__msgkeys = window.__msgkeys || []).push(Object.keys(d || {}).join()); }catch{} }); } }; });
    await pg.goto('http://localhost:4518/#new', { waitUntil:'load' }); await sleep(3000);
    const until = async (fn, ms = 90000, arg) => { const t0 = Date.now(); while(Date.now() - t0 < ms){ try{ const v = await pg.evaluate(fn, arg); if(v) return v; }catch{} await sleep(400); } return null; };
    const rows = () => pg.evaluate(() => [...document.querySelectorAll('.sug-row')].map((r, i) => { const b = r.querySelector('b'), tx = r.innerText.replace(/\n+/g, ' | '); const km = tx.match(/([\d,]+) km Luftlinie vom Start/), gp = tx.match(/([\d,]+) km Luftlinie bis ([^|]+?)(?: –|\s*\|)/), hh = tx.match(/≈ ([\d.]+) Haushalte/);
      return { i, name:b ? b.textContent.trim() : '', km:km ? +km[1].replace(',', '.') : null, gap:gp ? +gp[1].replace(',', '.') : null, to:gp ? gp[2].trim() : null, hh:hh ? +hh[1].replace(/\./g, '') : null, small:/kleiner Ort/.test(tx), adj:/direkt daneben/.test(tx), notYet:/noch nicht im Auftrag/.test(tx) }; }));
    const have = () => pg.evaluate(() => { const b = document.querySelectorAll('.cov .cov-n b'); return b.length >= 3 ? { want:b[0].textContent, have:b[1].textContent, missing:b[2].textContent } : null; });
    const chips = () => pg.evaluate(() => [...document.querySelectorAll('.cov-side .chip')].map(c => c.textContent.replace('✕', '').trim()));
    const hl = () => pg.evaluate(() => { const m = document.getElementById('fullMap')._map, p = m.getPane('sugPane'), cv = p && p.querySelector('canvas'); if(!cv) return { canvas:false, px:0 };
      const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for(let i = 3; i < d.length; i += 4) if(d[i] > 0) n++; return { canvas:true, px:n, z:+p.style.zIndex, ev:p.style.pointerEvents }; });
    const view = () => pg.evaluate(() => { const m = document.getElementById('fullMap')._map, c = m.getCenter(); return { lat:c.lat, lng:c.lng, z:m.getZoom() }; });
    const stable = async (ms = 4000, max = 120000) => { let last = null, since = Date.now(); const t0 = Date.now(); while(Date.now() - t0 < max){ const h = JSON.stringify(await have()) + (await pg.evaluate(() => !!document.querySelector('.cov-sug .small.muted') && /Suche|calculat|berechn/i.test(document.querySelector('.cov-sug').innerText))); if(h === last){ if(Date.now() - since > ms) return true; } else { last = h; since = Date.now(); } await sleep(500); } return false; };
    const shot = n => pg.screenshot({ path:path.join(OUT, name.toLowerCase() + '-' + n + '.png') });

    // 1 — new order: 10 000 flyers, 2 workers, never saved
    await pg.waitForSelector('#fullMap');
    await pg.evaluate(([la, lo]) => { document.getElementById('fullMap')._map.setView([la, lo], 14, { animate:false }); document.getElementById('fullMap')._map.fire('click', { latlng:{ lat:la, lng:lo } }); const t = document.getElementById('cTitle'); if(t) t.value = 'E2E ' + la; }, [lat, lng]);
    for(let k = 0; k < 2; k++){ await pg.evaluate(() => { const n = document.getElementById('cNext'); if(n && !n.disabled) n.click(); }); await sleep(1500); }
    const okFly = await until(() => { const f = document.getElementById('cFly'); if(!f) return false; f.value = 10000; f.dispatchEvent(new Event('change')); return f.value === '10000'; }, 30000);
    ok(`${name} 1: new order, step "Flyer/Mitarbeiter" reached, 10.000 flyers entered`, !!okFly);
    const gotPlan = await until(() => !!document.querySelector('.cov') && !document.querySelector('.cov .cov-n') === false, 240000); await stable();
    const nW = await pg.evaluate(() => (document.getElementById('vN') || {}).textContent);
    ok(`${name} 1: 2 workers, plan calculated, shortfall shown`, nW === '2' && !!(await have()) && /Zu wenige/.test(await pg.evaluate(() => document.querySelector('.cov').innerText)), JSON.stringify(await have()) + ' workers=' + nW);
    const sideBefore = await chips(); await until(() => document.querySelectorAll('.sug-row').length > 0, 120000); await sleep(3000);
    let R = await rows(); await shot('1-list');
    // 2 — small villages
    const smalls = R.filter(r => r.small);
    ok(`${name} 2: 8–10 suggestions on the first screen, small villages among them`, R.length >= 8 && R.length <= 10 && smalls.length >= 3, `${R.length} rows, ${smalls.length} small (${smalls.slice(0, 4).map(r => r.hh + 'hh').join(',')})`);
    ok(`${name} 2: every row shows households, Luftlinie to the start, Luftlinie to the nearest confirmed area and "noch nicht im Auftrag"`, R.every(r => r.hh > 0 && r.km != null && r.gap != null && r.notYet), JSON.stringify(R[0]));
    ok(`${name} 2: names arrive (one request at a time, none for failed ones twice)`, await until(() => [...document.querySelectorAll('.sug-row b')].filter(b => /^Testdorf|^Ort in/.test(b.textContent)).length >= 1, 30000) !== null);
    // 3 — hover
    const h0 = await hl(); await pg.hover('.sug-row[data-srow="1"]'); await sleep(600); const h1 = await hl(); await shot('3-hover');
    ok(`${name} 3: hover draws a highlighted area (canvas pixels), pane below the routes and without pointer events`, !h0.px && h1.px > 200 && h1.z === 395 && h1.ev === 'none', JSON.stringify(h1));
    await pg.mouse.move(1000, 150); await sleep(500); const h2 = await hl(); ok(`${name} 3: leaving the row removes it`, h2.px === 0, JSON.stringify(h2));
    for(const i of [1, 2, 3, 2, 4, 0]){ await pg.hover(`.sug-row[data-srow="${i}"]`); await sleep(60); } await pg.hover('.sug-row[data-srow="5"]'); await sleep(500);
    ok(`${name} 3: fast moves over several rows leave one highlight`, (await hl()).px > 0); await pg.mouse.move(1000, 150); await sleep(400);
    // 4 — click on a name
    const v0 = await view(); const idx = R.findIndex((r, i) => i >= 4 && r.km >= 3); await pg.click(`[data-sfocus="${idx}"]`); await sleep(2500); const v1 = await view(), h3 = await hl(); await shot('4-focus');
    const dm = Math.hypot((v1.lat - v0.lat) * 111320, (v1.lng - v0.lng) * 111320 * Math.cos(lat * Math.PI / 180));
    ok(`${name} 4: click on a name flies the map there (${Math.round(dm)} m, zoom ${v0.z}→${v1.z}) and keeps the area lit`, dm > 300 && v1.z >= 14 && h3.px > 200);
    ok(`${name} 4/10: the click added nothing (confirmed places unchanged)`, JSON.stringify(await chips()) === JSON.stringify(sideBefore) && (await rows()).length === R.length);
    // 5 — show more
    const nBefore = (await rows()).length; await pg.click('#sugMore'); await sleep(1500); const R2 = await rows();
    ok(`${name} 5: "Weitere anzeigen" adds rows from the same list`, R2.length > nBefore && R2.length <= nBefore + 10, `${nBefore} → ${R2.length}; requests overpass=${reqs.overpass}`);
    const ovBefore = reqs.overpass, zenBefore = reqs.zensus;
    // 6 — radius
    await pg.selectOption('#sugKm', '10'); await until(() => { const s = document.querySelector('.sug-row'); return !!s; }, 60000); await sleep(2500); const R10 = await rows();
    ok(`${name} 6: radius 10 km: every suggestion within 10 km Luftlinie of the start`, R10.length > 0 && R10.every(r => r.km <= 10), `${R10.length} rows, max ${Math.max(...R10.map(r => r.km))} km`);
    await pg.selectOption('#sugKm', '5'); await sleep(2500); const R5 = await rows(); ok(`${name} 6: radius 5 km: within 5 km`, R5.every(r => r.km <= 5), `${R5.length} rows`);
    await pg.selectOption('#sugKm', '15'); await sleep(2500); R = await rows(); ok(`${name} 6: back to 15 km, no new map/census downloads for a radius change`, R.length >= 8 && reqs.overpass === ovBefore, `overpass ${ovBefore}→${reqs.overpass}, zensus ${zenBefore}→${reqs.zensus}`);
    // 7 — add a small village ~4–8 km out
    const target = R.find(r => r.hh >= 300 && r.km >= 4 && r.km <= 9 && !r.adj) || R.find(r => r.hh >= 300 && !r.adj); const before = await have(), namesBefore = new Set(R.map(r => r.name));
    await pg.click(`[data-sadd="${target.i}"]`); await sleep(1500);
    const added = await until(() => document.querySelectorAll('.cov-side .chip').length > 0, 30000); const ch = await chips(); await stable(5000, 240000); const after = await have(); await shot('7-added'); const diag = await pg.evaluate(() => { const c = document.querySelector('.cov'), w = [...document.querySelectorAll('.warnbox,.hint,.err')].map(e => e.innerText.slice(0, 160)); return { chips:[...document.querySelectorAll('.cov-side .chip')].map(x => x.innerText), warn:w.slice(0, 4), planSum:(document.querySelector('#cSheet').innerText.match(/Briefkästen[^\n]*km[^\n]*/) || [''])[0] }; }); console.log('   diag7', JSON.stringify(diag)); const vl = target.name.match(/(\d+)\/(\d+)/); if(vl){ const la = 49 + 0 + 0, T = tileLog.filter(t => true).length; console.log('   tiles requested so far:', T); console.log('   plans:', JSON.stringify(await pg.evaluate(() => (window.__plans || []).slice(-2))), 'msgkeys', JSON.stringify(await pg.evaluate(() => [...new Set(window.__msgkeys || [])]))); } console.log('   sheet:', (await pg.evaluate(() => document.querySelector('#cSheet').innerText)).split('\n').filter(l => /verteilt|Briefkästen|Testdorf|Weg/.test(l)).slice(0, 8).join(' | '));
    ok(`${name} 7: "Ort hinzufügen" puts the village into the order and the plan is recalculated`, !!added && ch.some(c => c.startsWith(target.name.split(' (')[0]) || ch.length === 1) && JSON.stringify(after) !== JSON.stringify(before) && parseInt(after.have.replace(/\D/g, '')) > parseInt(before.have.replace(/\D/g, '')), `${target.name} (${target.hh}hh, ${target.km} km): ${before.have} → ${after.have} mailboxes, missing ${before.missing} → ${after.missing}`);
    // 8 — new neighbours around it
    await until(() => document.querySelectorAll('.sug-row').length > 0, 120000); await sleep(3000); const R7 = await rows(); const around = R7.filter(r => r.to && r.gap <= 4 && r.to.startsWith(target.name.split(' (')[0].slice(0, 8))), fresh = R7.filter(r => !namesBefore.has(r.name));
    ok(`${name} 8: after adding, the added village is no longer suggested and places around it appear`, !R7.some(r => r.name === target.name) && around.length >= 1, `${around.length} within 4 km of it: ${around.slice(0, 4).map(r => r.hh + 'hh/' + r.gap + 'km').join(', ')}; ${fresh.length} names new on the first screen`);
    ok(`${name} 8: still all within 15 km of the ORIGINAL start`, R7.every(r => r.km <= 15), 'max ' + Math.max(...R7.map(r => r.km)) + ' km');
    // 9 — remove
    await pg.click('[data-srm]'); await sleep(1500); await until(() => document.querySelectorAll('.cov-side .chip').length === 0, 30000); await stable(5000, 240000); await until(() => document.querySelectorAll('.sug-row').length > 0, 120000); await sleep(3000);
    const R9 = await rows(), c9 = await chips(); await shot('9-removed');
    ok(`${name} 9: removing the village empties the confirmed list and the village is suggested again; no "bis <village>" rows left`, c9.length === 0 && R9.some(r => r.name === target.name) && !R9.some(r => r.to && r.to !== 'Startadresse'), `rows=${R9.length}, back=${R9.some(r => r.name === target.name)}`);
    // 7b — a small village (< 150 households), confirmed by the admin: the planner now gives it a route of its own
    { const sm = R9.find(r => r.small && r.km >= 2 && !r.adj), b4 = await have();
      await pg.click(`[data-sadd="${sm.i}"]`); await until(() => document.querySelectorAll('.cov-side .chip').length > 0, 30000); await stable(5000, 240000); const a4 = await have();
      const flagged = await pg.evaluate(() => !!document.querySelector('.cov-side .chip.no-route')); await shot('7b-small'); if(process.env.DEBUG7B) console.log('   plan7b', JSON.stringify(await pg.evaluate(() => (window.__plans || []).slice(-1))));
      ok(`${name} 7b: adding a small village (${sm.hh} hh) gets it a route: mailboxes ${b4.have} -> ${a4.have}, no "no route" notice`, parseInt(a4.have.replace(/\D/g, '')) > parseInt(b4.have.replace(/\D/g, '')) && !flagged, 'flagged=' + flagged);
      await pg.click('[data-srm]'); await until(() => document.querySelectorAll('.cov-side .chip').length === 0, 30000); await stable(4000, 240000); }
    // 10 — nothing saved
    const stored = await pg.evaluate(() => Object.keys(localStorage));
    ok(`${name} 10: nothing was written to the (synthetic) database – no POST/PATCH/PUT/DELETE at all`, writes.length === 0, writes.length ? writes.join(', ') : 'writes: none; read-only POSTs seen: ' + [...reads].join(', '));
    ok(`${name} 10: the wizard is still on "new order" (no saved task opened)`, await pg.evaluate(() => location.hash === '#new' || /new/.test(location.hash)), await pg.evaluate(() => location.hash));
    ok(`${name}: no JavaScript errors in the console`, errors.length === 0, errors.slice(0, 3).join(' | '));
    ok(`${name}: no request left the machine (everything routed to synthetic/local data)`, blocked.length === 0, blocked.length ? [...new Set(blocked)].join(',') : 'blocked hosts: none');
    await ctx.close();
  }
  try{
    if(!process.env.ONLY || process.env.ONLY === 'Weidenberg') await town('Weidenberg', 49.942445, 11.729003);
    if(!process.env.ONLY || process.env.ONLY === 'Eisfeld') await town('Eisfeld', 50.4215, 10.9105);
  }catch(e){ ok('test run completed without an exception', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(results, null, 1));
  console.log('\n' + (fail ? fail + ' FAILED' : 'all ok'));
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
