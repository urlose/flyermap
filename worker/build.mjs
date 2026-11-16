import { build } from 'esbuild';
import { stampVersion } from './scripts/stamp-version.mjs';
import { mkdirSync, copyFileSync, cpSync, writeFileSync } from 'node:fs';
mkdirSync('www', { recursive: true });
// the route planner runs in a Web Worker: bundled first and embedded as a string (started from a Blob, works in every WebView)
const pw = await build({ entryPoints: ['src/planworker.js'], bundle: true, minify: true, format: 'iife', target: 'safari15', write: false });
// ES modules with code splitting: app.js (login + distributor) and, loaded on demand, the admin part with the planner (c/admin-….js)
import { rmSync, readdirSync } from 'node:fs';
rmSync('www/c', { recursive: true, force: true });
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'esm', splitting: true, target: 'safari15', outdir: 'www', entryNames: '[name]', chunkNames: 'c/[name]-[hash]', define: { __PLANWORKER__: JSON.stringify(pw.outputFiles[0].text) } });
const CHUNKS = readdirSync('www/c').filter(f => !f.startsWith('admin-')).map(f => './c/' + f);   // the admin part is not put on a distributor's phone in advance (it is kept once it was opened)
// app.js?v=<content hash>: a new version is loaded right away instead of an old copy from the browser cache
{ const { readFileSync, writeFileSync } = await import('fs'); const { createHash } = await import('crypto');
  const v = createHash('sha1').update(readFileSync('www/app.js')).digest('hex').slice(0, 10);
  writeFileSync('www/index.html', readFileSync('src/index.html', 'utf8').replace('src="app.js"', `src="app.js?v=${v}"`)); }
stampVersion('www/index.html');
copyFileSync('node_modules/leaflet/dist/leaflet.css', 'www/leaflet.css');
cpSync('node_modules/leaflet/dist/images', 'www/images', { recursive: true });
copyFileSync('assets/icon-only.png', 'www/icon.png'); copyFileSync('assets/favicon.png', 'www/favicon.png');
// Inter is shipped with the app (latin + cyrillic): no request to a font server (privacy, works offline)
mkdirSync('www/fonts', { recursive: true });
// Onest (main font since 06.11.2026, SIL OFL) + Inter as fallback
for(const fam of ['onest', 'inter']) for(const f of ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext']) copyFileSync(`node_modules/@fontsource-variable/${fam}/files/${fam}-${f}-wght-normal.woff2`, `www/fonts/${fam}-${f}-wght-normal.woff2`);
// the intro videos for distributors (help page, first login)
cpSync('assets/video', 'www/video', { recursive: true });
writeFileSync('www/manifest.json', JSON.stringify({ name:'FlyerMap', short_name:'FlyerMap', start_url:'./', scope:'./', display:'standalone', background_color:'#F5F6F8', theme_color:'#2563EB', icons:[{ src:'icon.png', sizes:'1024x1024', type:'image/png', purpose:'any' }] }));
// service worker (web app only): the app opens without signal; the page itself always comes fresh when there is signal
{ const { readFileSync } = await import('fs'); const { createHash } = await import('crypto');
  const v = createHash('sha1').update(readFileSync('www/app.js')).update(readFileSync('www/index.html')).digest('hex').slice(0, 10);
  const shell = ['./', './index.html', readFileSync('www/index.html', 'utf8').match(/src="(app\.js\?v=[^"]+)"/)[1], './leaflet.css', './icon.png', './manifest.json', ...CHUNKS,
    ...['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'].map(f => `./fonts/onest-${f}-wght-normal.woff2`)];
  writeFileSync('www/sw.js', `const SHELL = 'fm-shell-${v}', FILES = ${JSON.stringify(shell)};
self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fm-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if(r.method !== 'GET' || u.origin !== location.origin) return;
  if(r.mode === 'navigate'){
    // no-store: the browser's own 10-minute copy of the page must not hide a new release
    e.respondWith(fetch(r.url, { cache: 'no-store', credentials: 'same-origin' }).then(res => { const c = res.clone(); caches.open(SHELL).then(x => x.put('./index.html', c)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if(res.ok){ const c = res.clone(); caches.open(SHELL).then(x => x.put(r, c)); } return res; })));
});
`); }
console.log('www built');
