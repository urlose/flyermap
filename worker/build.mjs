import { build } from 'esbuild';
import { mkdirSync, copyFileSync, cpSync, writeFileSync } from 'node:fs';
mkdirSync('www', { recursive: true });
// the route planner runs in a Web Worker: bundled first and embedded as a string (started from a Blob, works in every WebView)
const pw = await build({ entryPoints: ['src/planworker.js'], bundle: true, minify: true, format: 'iife', target: 'safari15', write: false });
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'iife', target: 'safari15', outfile: 'www/app.js', define: { __PLANWORKER__: JSON.stringify(pw.outputFiles[0].text) } });
copyFileSync('src/index.html', 'www/index.html');
copyFileSync('node_modules/leaflet/dist/leaflet.css', 'www/leaflet.css');
cpSync('node_modules/leaflet/dist/images', 'www/images', { recursive: true });
copyFileSync('assets/icon-only.png', 'www/icon.png');
// Inter is shipped with the app (latin + cyrillic): no request to a font server (privacy, works offline)
mkdirSync('www/fonts', { recursive: true });
for(const f of ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext']) copyFileSync(`node_modules/@fontsource-variable/inter/files/inter-${f}-wght-normal.woff2`, `www/fonts/inter-${f}-wght-normal.woff2`);
writeFileSync('www/manifest.json', JSON.stringify({ name:'FlyerMap', short_name:'FlyerMap', start_url:'./', scope:'./', display:'standalone', background_color:'#F8FAFC', theme_color:'#2563EB', icons:[{ src:'icon.png', sizes:'1024x1024', type:'image/png', purpose:'any' }] }));
console.log('www built');
