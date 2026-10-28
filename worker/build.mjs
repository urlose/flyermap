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
writeFileSync('www/manifest.json', JSON.stringify({ name:'FlyerMap', short_name:'FlyerMap', start_url:'./', scope:'./', display:'standalone', background_color:'#F3F5F7', theme_color:'#0E9F8E', icons:[{ src:'icon.png', sizes:'1024x1024', type:'image/png', purpose:'any' }] }));
console.log('www built');
