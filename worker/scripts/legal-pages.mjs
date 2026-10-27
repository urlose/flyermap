// Writes the hosted legal pages (privacy.html, impressum.html) from src/legal.js into the given folder.
// Usage: node scripts/legal-pages.mjs <out-dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { legalPage } from '../src/legal.js';
const out = process.argv[2] || '.';
mkdirSync(out, { recursive:true });
writeFileSync(join(out, 'privacy.html'), legalPage('privacy'));
writeFileSync(join(out, 'impressum.html'), legalPage('imprint'));
console.log('legal pages written to', out);
