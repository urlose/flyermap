import { build } from 'esbuild';
import { mkdirSync, copyFileSync, cpSync } from 'node:fs';
mkdirSync('www', { recursive: true });
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'iife', target: 'safari15', outfile: 'www/app.js' });
copyFileSync('src/index.html', 'www/index.html');
copyFileSync('node_modules/leaflet/dist/leaflet.css', 'www/leaflet.css');
cpSync('node_modules/leaflet/dist/images', 'www/images', { recursive: true });
console.log('www built');
