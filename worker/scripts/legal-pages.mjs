// Writes the hosted legal pages (privacy.html, impressum.html) from src/legal.js into the given folder.
// Usage: node scripts/legal-pages.mjs <out-dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { legalPage, PAGES } from '../src/legal.js';
const out = process.argv[2] || '.';
mkdirSync(out, { recursive:true });
for(const [kind, file] of PAGES) writeFileSync(join(out, file), legalPage(kind));
console.log('legal pages written to', out);
