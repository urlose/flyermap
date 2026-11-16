// UI preview: serves worker/www, answers every Supabase call from fixtures.cjs (synthetic data) and takes screenshots.
// node test/ui/preview.cjs <outDir> '<json steps>'   steps: [{ "w":1280, "h":800, "hash":"#map", "theme":"dark", "lang":"de", "shot":"map-desk", "js":"...", "wait":800 }]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const F = require('./fixtures.cjs');
const REAL = !!process.env.REAL_NET;   // CI: real map tiles, census and geocoder; only the database is faked
const ROOT = path.join(__dirname, '../../worker/www'), OUT = process.argv[2] || '.', STEPS = JSON.parse(process.argv[3] || '[]');
const types = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.png':'image/png', '.woff2':'font/woff2', '.json':'application/json', '.svg':'image/svg+xml', '.mp4':'video/mp4' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  fs.readFile(f, (e, b) => { if(e){ s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type':types[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); });
// PostgREST-like filtering of the fixture rows (eq, neq, in, is, gte, lte)
const filt = (rows, sp) => { let r = rows; for(const [k, v] of sp){ if(['select', 'order', 'limit', 'offset', 'columns'].includes(k)) continue;
  const m = v.match(/^(not\.)?(eq|neq|in|is|gte|lte|gt|lt)\.(.*)$/); if(!m) continue; const [, not, op, val] = m;
  const test = x => { const a = x[k]; let ok;
    if(op === 'eq') ok = String(a) === val; else if(op === 'neq') ok = String(a) !== val; else if(op === 'is') ok = val === 'null' ? a == null : String(a) === val;
    else if(op === 'in') ok = val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(a));
    else ok = op === 'gte' ? a >= val : op === 'lte' ? a <= val : op === 'gt' ? a > val : a < val; return not ? !ok : ok; };
  r = r.filter(test); } return r; };
(async () => {
  await new Promise(r => srv.listen(4517, r));
  const b = await chromium.launch();
  for(const st of STEPS){
    const ctx = await b.newContext({ viewport:{ width:st.w || 1280, height:st.h || 800 }, deviceScaleFactor:st.dpr || 1, hasTouch:(st.w || 1280) < 800, isMobile:(st.w || 1280) < 800 });
    const pg = await ctx.newPage(); const logs = [];
    pg.on('pageerror', e => logs.push('ERR ' + e.message)); pg.on('console', m => { if(m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push('console ' + m.text()); });
    await pg.route(/supabase\.co/, async route => {
      const u = new URL(route.request().url()), acc = route.request().headers()['accept'] || '';
      if(REAL && u.pathname.startsWith('/storage/')) return route.continue();
      if(u.pathname.startsWith('/auth/')) return route.fulfill({ json:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } });
      if(u.pathname.startsWith('/functions/')) return route.fulfill({ json:{ ok:true } });
      const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/); if(!m) return route.fulfill({ json:null });
      if(m[1]) return route.fulfill({ json:m[2] in F.rpc ? F.rpc[m[2]] : null });
      if(route.request().method() !== 'GET' && route.request().method() !== 'HEAD') return route.fulfill({ status:201, json:[] });
      let rows = filt(F.tables[m[2]] || [], u.searchParams);
      // embedded task_workers(worker_id) in the tasks list
      if(m[2] === 'tasks') rows = rows.map(t => ({ ...t, task_workers:F.tables.task_workers.filter(x => x.task_id === t.id) }));
      const single = acc.includes('vnd.pgrst.object');
      return route.fulfill({ status:200, headers:{ 'content-range':`0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'content-type':'application/json' }, body:JSON.stringify(single ? (rows[0] || null) : rows) });
    });
    const TILE = fs.readFileSync(path.join(__dirname, 'tile.png'));
    if(!REAL) await pg.route(/tile\.openstreetmap|openstreetmap\.de/, r => r.fulfill({ status:200, contentType:'image/png', body:TILE }));
    if(!REAL) await pg.route(/photon|valhalla|overpass|github\.io/, r => r.fulfill({ status:200, json:{ features:[] } }));
    const sess = { access_token:'x', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now() / 1000) + 3600, refresh_token:'y', user:{ id:'u1', email:'admin@example.com', aud:'authenticated', role:'authenticated' } };
    await pg.addInitScript(([s, th, lg]) => { localStorage.setItem('fm-admin-auth', JSON.stringify(s)); localStorage.setItem('CapacitorStorage.role', '"admin"'); localStorage.setItem('CapacitorStorage.theme', JSON.stringify(th)); localStorage.setItem('CapacitorStorage.lang', JSON.stringify(lg)); localStorage.setItem('CapacitorStorage.introSeen', 'true'); }, [sess, st.theme || 'dark', st.lang || 'de']);
    await pg.goto('http://localhost:4517/' + (st.hash || ''), { waitUntil:'load' });
    await pg.waitForTimeout(st.boot || 1800);
    for(const js of [].concat(st.js || [])){
      // "wait:<css>" waits until an element shows up (planning takes a while with real maps)
      if(typeof js === 'string' && js.startsWith('wait:')){ try{ await pg.waitForSelector(js.slice(5), { timeout:180000 }); }catch(e){ logs.push('WAIT ' + js); } continue; }
      if(typeof js === 'string' && js.startsWith('shot:')){ await pg.screenshot({ path:path.join(OUT, js.slice(5) + '.png') }); continue; }
      try{ const r = await pg.evaluate(js); if(r != null) console.log('  =>', typeof r === 'string' ? r : JSON.stringify(r)); }catch(e){ logs.push('JS ' + e.message); } await pg.waitForTimeout(st.wait || 700); }
    if(st.click) for(const c of [].concat(st.click)){ try{ await pg.click(c, { timeout:3000 }); }catch(e){ logs.push('CLICK ' + c + ' ' + e.message.split('\n')[0]); } await pg.waitForTimeout(st.wait || 700); }
    await pg.screenshot({ path:path.join(OUT, (st.shot || 'shot') + '.png'), fullPage:!!st.full });
    if(st.dump) console.log(await pg.evaluate(st.dump));
    console.log(st.shot, logs.length ? logs.slice(0, 6).join(' | ') : 'ok');
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
