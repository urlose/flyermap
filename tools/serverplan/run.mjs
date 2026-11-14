// Runs the app's planner in Node (GitHub Actions) for the request in req.json and writes out/<name>.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const req = JSON.parse(readFileSync(new URL('./req.json', import.meta.url)));
require('./bundle.js');
const t0 = Date.now();
const out = await globalThis.FMRun(req);
out.req = req; out.secs = Math.round((Date.now() - t0) / 1000);
mkdirSync(new URL('./out/', import.meta.url), { recursive:true });
writeFileSync(new URL('./out/' + req.name + '.json', import.meta.url), JSON.stringify(out));
console.log(out.log.join('\n'), '\nside:', out.side.map(s => s.name + ' ' + s.flyers).join(', '), '\nmailboxes', out.plan.mailboxes, 'secs', out.secs);
